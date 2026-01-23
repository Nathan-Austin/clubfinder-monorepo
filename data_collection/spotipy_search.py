# Fixed spotipy_search.py

import os
import logging
import spotipy
from dotenv import load_dotenv
from fuzzywuzzy import process
from spotipy.oauth2 import SpotifyClientCredentials
from utils import (
    extract_from_database_spotify,
    commit_to_database,
    extract_from_database,
    execute_query2,
    load_genres_from_csv,
    split_and_clean_genres
)
import datetime
import argparse
import time
import json
import requests
import sys
import re
from spotify_rate_limiter import ApiKeyRateLimiter
from log_utils import redact_identifier, redact_list

# Load environment variables
load_dotenv()

# Argument parsing to get the city name
parser = argparse.ArgumentParser(description="Fetch Spotify data and update the database.")
parser.add_argument('city_name', type=str, help="Name of the city")
args = parser.parse_args()

# Use the city_name argument in your script
city_name = args.city_name.lower()

# Ensure directories for logs and pickle files exist
def ensure_directory_exists(filepath):
    directory = os.path.dirname(filepath)
    if not os.path.exists(directory):
        os.makedirs(directory)

# Set up file paths
log_dir = f'/home/nathan/clubfinder/data_collection/logs/{city_name}'
api_log_file = os.path.join(log_dir, 'spotify_api.log')
fuzzy_match_log_file = os.path.join(log_dir, 'spotify_fuzzy_match.log')
api_call_log_file = os.path.join(log_dir, f'spotify_api_call_log_{city_name}.json')

# Ensure the directories exist
ensure_directory_exists(api_log_file)
ensure_directory_exists(fuzzy_match_log_file)
ensure_directory_exists(api_call_log_file)

# Configure the main logger
logging.basicConfig(level=logging.ERROR, 
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    handlers=[
                        logging.FileHandler(api_log_file),
                        logging.StreamHandler()  # Added to print logs to console for debugging
                    ])

# Separate logger for tracking fuzzy matching and fallback scenarios
fallback_logger = logging.getLogger('fuzzyMatchLogger')
fallback_handler = logging.FileHandler(fuzzy_match_log_file, mode='a')
fallback_handler.setLevel(logging.ERROR)
fallback_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
fallback_handler.setFormatter(fallback_formatter)
fallback_logger.addHandler(fallback_handler)

# Load or initialize the API call log with improved error handling
try:
    if os.path.exists(api_call_log_file):
        with open(api_call_log_file, 'r') as f:
            api_call_log_raw = json.load(f)
            # Convert ISO format strings back to datetime objects
            api_call_log = {
                name: datetime.datetime.fromisoformat(timestamp)
                for name, timestamp in api_call_log_raw.items()
            }
    else:
        api_call_log = {}
except Exception as e:
    logging.error(f"Error loading API call log: {e}")
    api_call_log = {}  # Use empty dict if there's an error

session = requests.Session()
adapter = requests.adapters.HTTPAdapter(max_retries=3)
session.mount("https://", adapter)
session.mount("http://", adapter)

# Default timeout for all requests to prevent hanging
DEFAULT_TIMEOUT = 15  # seconds

class TimeoutSession(requests.Session):
    def request(self, *args, **kwargs):
        kwargs.setdefault('timeout', DEFAULT_TIMEOUT)
        return super().request(*args, **kwargs)

timeout_session = TimeoutSession()

# Load and parse Spotify credentials with better error handling
logging.info(f"Starting Spotify search for city: {city_name}")
try:
    spotify_credentials_str = os.environ.get('SPOTIFY_CREDENTIALS', '[]')
    logging.debug("SPOTIFY_CREDENTIALS length: %d", len(spotify_credentials_str))
    
    spotify_credentials = json.loads(spotify_credentials_str)
    if not spotify_credentials:
        raise ValueError("No Spotify credentials found in environment")
    
    logging.info(f"Successfully loaded {len(spotify_credentials)} Spotify credentials")
except json.JSONDecodeError as e:
    logging.error(f"Failed to parse Spotify credentials: {e}")
    logging.error("SPOTIFY_CREDENTIALS length: %d", len(spotify_credentials_str))
    sys.exit(1)  # Exit with error rather than proceeding with invalid credentials
except Exception as e:
    logging.error(f"Unexpected error loading credentials: {e}")
    sys.exit(1)

# Initialize credential rotation and rate limit tracking
current_credential_index = 0
spotify_clients = []

# Rate limiting settings per API key
REQUESTS_PER_KEY = int(os.getenv("SPOTIFY_REQUESTS_PER_KEY", "80"))
MIN_REQUEST_INTERVAL = float(os.getenv("SPOTIFY_MIN_REQUEST_INTERVAL", "0.2"))
API_CALL_COOLDOWN_DAYS = int(os.getenv("SPOTIFY_API_CALL_COOLDOWN_DAYS", "14"))

# Initialize clients for each credential
try:
    for cred in spotify_credentials:
        try:
            # Create Spotify client with appropriate timeouts
            client_credentials_manager = SpotifyClientCredentials(
                client_id=cred['client_id'],
                client_secret=cred['client_secret'],
                requests_timeout=DEFAULT_TIMEOUT
            )
            client = spotipy.Spotify(
                client_credentials_manager=client_credentials_manager,
                requests_timeout=DEFAULT_TIMEOUT
            )
            spotify_clients.append(client)
            logging.info(f"Initialized client {cred['client_id'][-4:]} with rate limit tracking")
        except Exception as e:
            logging.error(f"Failed to initialize Spotify client {cred['client_id'][-4:]}: {e}")
    
    if not spotify_clients:
        raise ValueError("No Spotify clients could be initialized")
except Exception as e:
    logging.error(f"Failed to initialize Spotify clients: {e}")
    sys.exit(1)

sp = spotify_clients[current_credential_index]
logging.info(f"Using initial client {spotify_credentials[current_credential_index]['client_id'][-4:]}")

rate_limiter = ApiKeyRateLimiter(
    [cred['client_id'] for cred in spotify_credentials],
    requests_per_window=REQUESTS_PER_KEY,
    min_interval_seconds=MIN_REQUEST_INTERVAL,
)

def rotate_spotify_client():
    """Enhanced client rotation with rate limit tracking."""
    global current_credential_index, sp
    
    # Get current client's ID for logging
    current_cred = spotify_credentials[current_credential_index]
    old_client_id = current_cred['client_id']
    
    # Rotate to next client
    rate_limiter.rotate()
    current_credential_index = rate_limiter.current_index
    sp = spotify_clients[current_credential_index]
    new_client_id = spotify_credentials[current_credential_index]['client_id']
    
    logging.info(f"Rotated from client {old_client_id[-4:]} to {new_client_id[-4:]} (index: {current_credential_index + 1})")

# Function to check if an artist has been called recently
def has_been_called_recently(name):
    cutoff = datetime.datetime.now() - datetime.timedelta(days=API_CALL_COOLDOWN_DAYS)
    return name in api_call_log and api_call_log[name] > cutoff

# Function to update the API call log with periodic saves
last_save_time = time.time()
SAVE_INTERVAL = 60  # Save every 60 seconds

def update_api_call_log(artist):
    global last_save_time
    current_time = time.time()
    api_call_log[artist] = datetime.datetime.now()

    # Save periodically rather than after every update
    if current_time - last_save_time > SAVE_INTERVAL:
        try:
            # Convert datetime objects to ISO format strings for JSON serialization
            api_call_log_serializable = {
                name: timestamp.isoformat()
                for name, timestamp in api_call_log.items()
            }
            with open(api_call_log_file, 'w') as f:
                json.dump(api_call_log_serializable, f, indent=2)
            last_save_time = current_time
            logging.debug(f"Saved API call log at {datetime.datetime.now()}")
        except Exception as e:
            logging.error(f"Failed to save API call log: {e}")

def global_rate_limiter():
    """Enhanced rate limiter that handles multiple API keys."""
    global current_credential_index, sp
    try:
        client_id = rate_limiter.acquire()
        if client_id is None:
            return
        if spotify_credentials[current_credential_index]['client_id'] != client_id:
            current_credential_index = next(
                i for i, cred in enumerate(spotify_credentials)
                if cred['client_id'] == client_id
            )
            sp = spotify_clients[current_credential_index]
    except Exception as e:
        logging.error(f"Error in rate limiter: {e}")
        # Rotate to next client as precaution
        rotate_spotify_client()

# Function to handle Spotify API search with retries and improved error handling
def safe_spotify_search(artist_name, retries=3):
    """
    Perform a safe search using the Spotify API with credential rotation and detailed genre logging.
    """
    all_clients_tried = False
    original_client_index = current_credential_index
    
    for attempt in range(retries):
        try:
            global_rate_limiter()  # Apply the global rate limiter before each API call
            logging.info(
                "Attempt %d to search for artist: %s",
                attempt + 1,
                redact_identifier(artist_name, "artist"),
            )
            
            # Make the API call with a timeout
            result = sp.search(artist_name, type='artist', limit=10)
            logging.info(
                "Successfully retrieved data for %s on attempt %d",
                redact_identifier(artist_name, "artist"),
                attempt + 1,
            )
            
            # Log the structure of the result to understand what we got back
            if result and 'artists' in result and 'items' in result['artists']:
                items_count = len(result['artists']['items'])
                logging.info(
                    "Found %d artist results for %s",
                    items_count,
                    redact_identifier(artist_name, "artist"),
                )
                
                if items_count > 0:
                    # Log the top result
                    top_result = result['artists']['items'][0]
                    found_name = top_result.get('name', 'Unknown')
                    found_popularity = top_result.get('popularity', 'Unknown')
                    found_uri = top_result.get('uri', 'None')
                    
                    # Extract and log the genres
                    raw_genres = top_result.get('genres', [])
                    logging.info(
                        "Top result: %s (Popularity: %s, URI: %s)",
                        redact_identifier(found_name, "artist"),
                        found_popularity,
                        redact_identifier(found_uri, "uri"),
                    )
                    logging.info(
                        "Raw genres for %s: %s",
                        redact_identifier(found_name, "artist"),
                        redact_list(raw_genres, "genres"),
                    )
                    
                    # Load valid genres from CSV for comparison
                    valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
                    if valid_genres:
                        logging.info("Loaded %d valid genres from CSV", len(valid_genres))
                        
                        # Log which raw genres are in the valid genres list
                        valid_matches = [genre for genre in raw_genres if genre in valid_genres]
                        invalid_genres = [genre for genre in raw_genres if genre not in valid_genres]
                        
                        if valid_matches:
                            logging.info("Valid genres found: %s", redact_list(valid_matches, "genres"))
                        else:
                            logging.info("No valid genres found among: %s", redact_list(raw_genres, "genres"))
                        
                        if invalid_genres:
                            logging.info("Invalid/Unknown genres: %s", redact_list(invalid_genres, "genres"))
                    else:
                        logging.error("Failed to load valid genres from CSV")
                else:
                    logging.info(
                        "No artist results found for %s",
                        redact_identifier(artist_name, "artist"),
                    )
            else:
                logging.warning(
                    "Unexpected result structure for %s",
                    redact_identifier(artist_name, "artist"),
                )
                
            return result

        except spotipy.exceptions.SpotifyException as e:
            # Handling Rate limit errors
            if hasattr(e, 'http_status') and e.http_status == 429:  # Rate limit exceeded
                logging.warning(
                    "Rate limit exceeded on attempt %d for %s.",
                    attempt + 1,
                    redact_identifier(artist_name, "artist"),
                )
                
                if not all_clients_tried:
                    # Rotate to the next client
                    rotate_spotify_client()
                    # Check if we've tried all clients
                    if current_credential_index == original_client_index:
                        all_clients_tried = True
                        retry_after = int(getattr(e, 'headers', {}).get('Retry-After', 1))
                        logging.warning(f"All clients are rate limited. Waiting {retry_after} seconds...")
                        time.sleep(retry_after)
                    else:
                        logging.info(f"Trying next client: {spotify_credentials[current_credential_index]['client_id'][-4:]}")
                        continue
                else:
                    # All clients are rate limited, wait for the Retry-After header if available
                    retry_after = int(getattr(e, 'headers', {}).get('Retry-After', 1))
                    logging.warning(f"All clients still rate limited. Waiting {retry_after} seconds...")
                    time.sleep(retry_after)
            
            else:
                # Other Spotify API errors
                logging.error(
                    "Spotify API error for %s on attempt %d: %s",
                    redact_identifier(artist_name, "artist"),
                    attempt + 1,
                    e,
                )
                if attempt < retries - 1:
                    time.sleep(1)  # Brief delay before retrying
                    rotate_spotify_client()  # Try with a different client
                    continue
                return None

        except Exception as e:
            # Catch unexpected errors (network, timeout, etc.)
            logging.error(
                "An unexpected error occurred while searching for %s on attempt %d: %s",
                redact_identifier(artist_name, "artist"),
                attempt + 1,
                e,
            )
            if attempt < retries - 1:
                time.sleep(1)  # Brief delay before retrying
                rotate_spotify_client()  # Try with a different client
                continue
            return None

    # If we've exhausted all retries
    logging.error(
        "Failed to retrieve data for %s after %d attempts.",
        redact_identifier(artist_name, "artist"),
        retries,
    )
    return None


def split_and_clean_genres_with_logging(genres, valid_genres):
    """Splits and cleans genres based on valid genres with detailed logging."""
    logging.info("Input genres for cleaning: %s", redact_list(genres, "genres"))
    
    if not genres:
        logging.info("No genres provided for cleaning")
        return []

    # Convert valid_genres to set for O(1) lookup and normalize to lowercase
    valid_genres_set = {genre.strip().lower() for genre in valid_genres if genre}
    logging.info("Using %d valid genres for comparison", len(valid_genres_set))
    
    # Handle list or string input
    if isinstance(genres, list):
        genre_list = genres
    else:
        # Split on common delimiters and handle edge cases
        genre_list = re.split(r'\s*[,|/]\s*', str(genres))
    
    logging.info("Split into %d genres: %s", len(genre_list), redact_list(genre_list, "genres"))

    cleaned_genres = set()  # Use set to automatically deduplicate
    skipped_genres = []

    for genre in genre_list:
        if not genre or genre.lower() == 'none':
            continue
            
        # Normalize the genre
        normalized = genre.strip().lower()
        
        # Remove quotes and special characters
        normalized = re.sub(r'["\']', '', normalized)
        normalized = re.sub(r'[^\w\s-]', ' ', normalized)
        
        # Prefer exact matches before fuzzy compound matching.
        if normalized in valid_genres_set:
            cleaned_genres.add(normalized)
            logging.info("Exact match found for %s", redact_identifier(normalized, "genre"))
            continue

        # Handle compound genres (e.g., "TechHouse" -> "Tech House")
        normalized_compact = re.sub(r'[\s-]+', '', normalized)
        compound_matches = []
        for valid_genre in valid_genres_set:
            valid_compact = re.sub(r'[\s-]+', '', valid_genre)
            if not valid_compact:
                continue
            if valid_compact in normalized_compact or normalized_compact in valid_compact:
                compound_matches.append(valid_genre)

        if compound_matches:
            # Sort by length descending to prefer longer matches
            compound_matches.sort(key=len, reverse=True)
            best_match = compound_matches[0]
            cleaned_genres.add(best_match)
            logging.info(
                "Matched %s to compound genre %s",
                redact_identifier(normalized, "genre"),
                redact_identifier(best_match, "genre"),
            )
        else:
            skipped_genres.append(normalized)
            logging.info("No match found for %s, skipping", redact_identifier(normalized, "genre"))

    if skipped_genres:
        logging.info("Skipped %d invalid genres: %s", len(skipped_genres), redact_list(skipped_genres, "genres"))
    
    result = list(cleaned_genres)
    logging.info("Final cleaned genres (%d): %s", len(result), redact_list(result, "genres"))
    return result
# Modified to return the query string without parameters
def get_artists_query():
    return """
    SELECT id, artist_name, spotify_uri 
    FROM clubfindr.artists 
    WHERE primary_city = %s
    ORDER BY id 
    LIMIT 1000;
    """

# Fixed function to update event genres
def update_event_genres(artist_name, max_retries=3):
    """Update event genres with properly cleaned and normalized genres from all associated artists."""
    try:
        # Load valid genres from CSV
        valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
        if not valid_genres:
            logging.error("Failed to load valid genres from CSV")
            return

        # Get all event IDs associated with the artist
        event_ids_query = """
            SELECT DISTINCT ea.event_id
            FROM clubfindr.event_artists ea
            JOIN clubfindr.artists a ON ea.artist_id = a.id
            WHERE a.artist_name = %s;
        """
        
        for attempt in range(max_retries):
            try:
                event_ids_results = execute_query2(event_ids_query, (artist_name,), fetch=True)
                if not event_ids_results:
                    logging.warning(
                        "No events found for artist %s",
                        redact_identifier(artist_name, "artist"),
                    )
                    return
                break
            except Exception as e:
                logging.error(f"Database error fetching event IDs (attempt {attempt+1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(1)  # Wait before retrying
                else:
                    return  # Give up after max retries
        
        # Process each event
        for event_result in event_ids_results:
            event_id = event_result[0]
            
            # Get the city for this event
            city_query = """
                SELECT city
                FROM clubfindr.events
                WHERE id = %s OR LOWER(city) = LOWER(%s);
            """
            
            city_result = None
            for attempt in range(max_retries):
                try:
                    city_result = execute_query2(city_query, (event_id,event_id), fetch=True)
                    break
                except Exception as e:
                    logging.error(f"Database error fetching city (attempt {attempt+1}): {e}")
                    if attempt < max_retries - 1:
                        time.sleep(1)  # Wait before retrying
                    else:
                        continue  # Skip this event after max retries
            
            if not city_result:
                logging.warning(f"No city found for event_id {event_id}")
                continue
            
            city = city_result[0][0]
            
            # Get all genres from all artists associated with this event
            all_genres_query = """
                SELECT DISTINCT unnest(a.genres) as genre
                FROM clubfindr.event_artists ea
                JOIN clubfindr.artists a ON ea.artist_id = a.id
                WHERE ea.event_id = %s
                AND a.genres IS NOT NULL;
            """
            
            genres_result = None
            for attempt in range(max_retries):
                try:
                    genres_result = execute_query2(all_genres_query, (event_id,), fetch=True)
                    break
                except Exception as e:
                    logging.error(f"Database error fetching genres (attempt {attempt+1}): {e}")
                    if attempt < max_retries - 1:
                        time.sleep(1)  # Wait before retrying
                    else:
                        continue  # Skip this event after max retries
            
            if not genres_result:
                logging.warning(f"No genres found for event {event_id}")
                continue
            
            # Extract and clean genres
            raw_genres = [g[0] for g in genres_result if g[0]]
            cleaned_genres = split_and_clean_genres_with_logging(raw_genres, valid_genres)
            
            if not cleaned_genres:
                logging.warning(f"No valid genres found for event {event_id}")
                continue
            
            # Update event genres with improved query
            update_event_data_genres_query = """
                UPDATE clubfindr.events
                SET event_genres = (
                    SELECT array_agg(DISTINCT x ORDER BY x)
                    FROM unnest(%s::text[]) AS x
                    WHERE x IS NOT NULL AND x != ''
                )
                WHERE id = %s AND city = %s
                RETURNING id;
            """
            
            for attempt in range(max_retries):
                try:
                    event_result = execute_query2(update_event_data_genres_query, 
                                               (cleaned_genres, event_id, city),
                                               return_results=True)
                    if event_result:
                        logging.info(f"Event genres updated for event_id {event_id} in city {city}")
                    else:
                        logging.error(f"Failed to update genres for event {event_id}")
                    break
                except Exception as e:
                    logging.error(f"Failed to update event genres for event {event_id} (attempt {attempt+1}): {e}")
                    if attempt < max_retries - 1:
                        time.sleep(1)  # Wait before retrying
    
    except Exception as e:
        logging.error(
            "Error processing events for artist %s: %s",
            redact_identifier(artist_name, "artist"),
            e,
        )

# Main execution
try:
    # Fetch artist data WITH PROPER PARAMETERS
    query = get_artists_query()
    raw_artist_data = extract_from_database_spotify(query, (city_name,))
    
    if not raw_artist_data:
        logging.warning(f"No artists found for city: {city_name}")
        logging.info("Exiting script as no artists were found.")
        sys.exit(0)
    
    # Add detailed debugging info
    logging.info(f"Fetched {len(raw_artist_data)} artists from database.")
    # Log sample size only to avoid PII in logs
    sample_data = list(raw_artist_data.items())[:3] if raw_artist_data else []
    logging.info("Sample artist data: %d entries", len(sample_data))

    # Prepare dictionaries to hold artists with and without URIs
    artists_with_uri = {}
    artists_without_uri = {}

    # Iterate over raw_artist_data to split into artists with and without URIs
    for artist_id, (artist_name_list, spotify_uri) in raw_artist_data.items():
        try:
            artist_name = ''.join(artist_name_list).strip() if artist_name_list else None  # Reconstructing the artist name
            
            if not artist_name:
                logging.warning(f"Empty artist name for artist_id={artist_id}, skipping.")
                continue
                
            if spotify_uri is not None and not has_been_called_recently(artist_name):
                artists_with_uri[artist_id] = (artist_name, spotify_uri)
            elif spotify_uri is None and not has_been_called_recently(artist_name):
                artists_without_uri[artist_id] = artist_name
        except Exception as e:
            logging.error(f"Error processing artist_id={artist_id}: {e}")

    logging.info(f"Artists to process - With URI: {len(artists_with_uri)}, Without URI: {len(artists_without_uri)}")

    # Process artists with URI
    BATCH_SIZE = 20  # Reduced batch size for better error handling and less memory usage
    artists_with_uri_items = list(artists_with_uri.items())
    artists_with_uri_batches = [artists_with_uri_items[i:i+BATCH_SIZE] for i in range(0, len(artists_with_uri_items), BATCH_SIZE)]

    for batch_idx, batch in enumerate(artists_with_uri_batches):
        logging.info(f"Processing batch {batch_idx+1}/{len(artists_with_uri_batches)} of artists with URIs")
        
        for artist_id, (artist_name, spotify_uri) in batch:
            try:
                logging.info(
                    "Processing artist with URI: %s",
                    redact_identifier(artist_name, "artist"),
                )
                result = safe_spotify_search(spotify_uri)
                if result is None:
                    continue

                # Load valid genres from CSV
                valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
                if not valid_genres:
                    logging.error("Failed to load valid genres from CSV")
                    continue

                # Get raw genres from Spotify
                raw_genres = []
                if 'artists' in result and 'items' in result['artists'] and result['artists']['items']:
                    artist_item = result['artists']['items'][0]
                    raw_genres = artist_item.get('genres', [])
                
                if not raw_genres:
                    logging.warning(
                        "No genres found for artist %s",
                        redact_identifier(artist_name, "artist"),
                    )
                    update_api_call_log(artist_name)  # Still mark as processed
                    continue

                # Clean and normalize genres
                cleaned_genres = split_and_clean_genres_with_logging(raw_genres, valid_genres)
                if not cleaned_genres:
                    logging.warning(
                        "No valid genres found for artist %s",
                        redact_identifier(artist_name, "artist"),
                    )
                    update_api_call_log(artist_name)  # Still mark as processed
                    continue

                # Update artist genres with improved query
                try:
                    # Verify the query is defined before use
                    print("Attempting to define update_genres_query")
                    update_genres_query = """
                        UPDATE clubfindr.artists
                        SET genres = (
                            SELECT array_agg(DISTINCT x ORDER BY x)
                            FROM (
                                SELECT unnest(array_cat(
                                    COALESCE(clubfindr.artists.genres, ARRAY[]::text[]),
                                    %s::text[]
                                )) AS x
                            ) subquery
                            WHERE x IS NOT NULL AND x != ''
                        )
                        WHERE artist_name = %s
                        RETURNING id;
                    """
                    print("update_genres_query successfully defined")
                except Exception as e:
                    logging.error(f"Error defining update_genres_query: {e}")

                try:
                    artist_result = execute_query2(update_genres_query, 
                                                (cleaned_genres, artist_name),
                                                return_results=True)
                    if artist_result:
                        logging.info(
                            "Genres updated for %s: %s",
                            redact_identifier(artist_name, "artist"),
                            redact_list(cleaned_genres, "genres"),
                        )
                        # Update event genres for the artist
                        update_event_genres(artist_name)
                    else:
                        logging.error(
                            "Failed to update genres for %s",
                            redact_identifier(artist_name, "artist"),
                        )
                except Exception as e:
                    logging.error(
                        "Failed to update genres for %s: %s",
                        redact_identifier(artist_name, "artist"),
                        e,
                    )

                # Update API call log
                update_api_call_log(artist_name)
                
            except Exception as e:
                logging.error(
                    "Error processing artist %s: %s",
                    redact_identifier(artist_name, "artist"),
                    e,
                )
                continue  # Skip to next artist
        
        # After processing all artists in the batch
        try:
            import gc
            gc.collect()
            logging.info(f"Completed processing batch of {len(batch)} artists with URIs")
            time.sleep(2)  # Slightly longer pause between batches
        except Exception as e:
            logging.error(f"Error during batch cleanup: {e}")

    # Process artists without a Spotify URI using fuzzy logic
    artists_without_uri_items = list(artists_without_uri.items())
    artists_without_uri_batches = [artists_without_uri_items[i:i+BATCH_SIZE] for i in range(0, len(artists_without_uri_items), BATCH_SIZE)]

    for batch_idx, batch in enumerate(artists_without_uri_batches):
        logging.info(f"Processing batch {batch_idx+1}/{len(artists_without_uri_batches)} of artists without URIs")
        
        for artist_id, artist_name in batch:
            try:
                logging.info(
                    "Processing artist without URI: %s",
                    redact_identifier(artist_name, "artist"),
                )
                
                if not artist_name or not artist_name.strip():
                    logging.warning(f"Empty artist name encountered for artist_id: {artist_id}. Skipping...")
                    continue

                result = safe_spotify_search(artist_name)
                if result is None or 'artists' not in result or 'items' not in result['artists']:
                    update_api_call_log(artist_name)  # Mark as processed even if failed
                    continue

                if not result['artists']['items']:
                    logging.warning(
                        "No artists found for %s in Spotify search.",
                        redact_identifier(artist_name, "artist"),
                    )
                    update_api_call_log(artist_name)  # Mark as processed
                    continue

                # Use fuzzy logic to match the artist and get the URI and genres
                listdic = result['artists']['items']
                names_genres = {}
                names_uri = {}
                
                for d in listdic:
                    if 'name' in d:
                        names_genres[d['name']] = d.get('genres', [])
                        names_uri[d['name']] = d.get('uri', '')

                best_match = process.extractBests(artist_name, names_genres.keys(), score_cutoff=80, limit=1)
                best_match_score = best_match[0][1] if best_match else None
                fallback_logger.info(
                    "Fuzzy matching result for %s: score=%s",
                    redact_identifier(artist_name, "artist"),
                    best_match_score,
                )

                if not best_match:
                    logging.warning(
                        "No fuzzy match found for %s.",
                        redact_identifier(artist_name, "artist"),
                    )
                    update_api_call_log(artist_name)  # Mark as processed
                    continue

                if best_match[0][1] >= 95:
                    # Load valid genres from CSV
                    valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
                    if not valid_genres:
                        logging.error("Failed to load valid genres from CSV")
                        continue

                    matched_artist_name = best_match[0][0]
                    raw_genres = names_genres[matched_artist_name]
                    uri = names_uri[matched_artist_name]

                    # Clean and normalize genres
                    cleaned_genres = split_and_clean_genres_with_logging(raw_genres, valid_genres)
                    if not cleaned_genres:
                        logging.warning(
                            "No valid genres found for artist %s",
                            redact_identifier(artist_name, "artist"),
                        )
                        update_api_call_log(artist_name)  # Mark as processed
                        continue

                    # Update the artist's Spotify URI in the database
                    insert_spotify_uri_query = """
                        UPDATE clubfindr.artists
                        SET spotify_uri = %s 
                        WHERE artist_name = %s
                        RETURNING id;
                    """
                    try:
                        artist_result = execute_query2(insert_spotify_uri_query, 
                                                    (uri, artist_name),
                                                    return_results=True)
                        if not artist_result:
                            logging.error(
                                "Failed to update Spotify URI for %s",
                                redact_identifier(artist_name, "artist"),
                            )
                            continue
                        logging.info(
                            "Spotify URI updated for %s: %s",
                            redact_identifier(artist_name, "artist"),
                            redact_identifier(uri, "uri"),
                        )
                    except Exception as e:
                        logging.error(
                            "Failed to update Spotify URI for %s: %s",
                            redact_identifier(artist_name, "artist"),
                            e,
                        )
                        continue

                    try:
                        # Verify the query is defined before use
                        print("Attempting to define update_genres_query")
                        update_genres_query = """
                            UPDATE clubfindr.artists
                            SET genres = (
                                SELECT array_agg(DISTINCT x ORDER BY x)
                                FROM (
                                    SELECT unnest(array_cat(
                                        COALESCE(clubfindr.artists.genres, ARRAY[]::text[]),
                                        %s::text[]
                                    )) AS x
                                ) subquery
                                WHERE x IS NOT NULL AND x != ''
                            )
                            WHERE artist_name = %s
                            RETURNING id;
                        """
                        print("update_genres_query successfully defined")
                    except Exception as e:
                        logging.error(f"Error defining update_genres_query: {e}")
                    
                    try:
                        artist_result = execute_query2(update_genres_query, 
                                                    (cleaned_genres, artist_name),
                                                    return_results=True)
                        if artist_result:
                            logging.info(
                                "Genres updated for %s: %s",
                                redact_identifier(artist_name, "artist"),
                                redact_list(cleaned_genres, "genres"),
                            )
                            # Update event genres for the artist
                            update_event_genres(artist_name)
                        else:
                            logging.error(
                                "Failed to update genres for %s",
                                redact_identifier(artist_name, "artist"),
                            )
                    except Exception as e:
                        logging.error(
                            "Failed to update genres for %s: %s",
                            redact_identifier(artist_name, "artist"),
                            e,
                        )

                    # Update API call log
                    update_api_call_log(artist_name)
            except Exception as e:
                logging.error(
                    "Error processing artist %s: %s",
                    redact_identifier(artist_name, "artist"),
                    e,
                )
        
        # After processing all artists in the batch
        try:
            import gc
            gc.collect()
            logging.info(f"Completed processing batch of {len(batch)} artists without URIs")
            time.sleep(2)  # Small pause between batches
        except Exception as e:
            logging.error(f"Error during batch cleanup: {e}")

except Exception as e:
    logging.error(f"Unhandled error in main execution: {e}")
    logging.exception("Exception details:")
    sys.exit(1)  # Exit with error code
    
finally:
    # Final cleanup before exit
    try:
        # Save the API call log one last time
        # Convert datetime objects to ISO format strings for JSON serialization
        api_call_log_serializable = {
            name: timestamp.isoformat()
            for name, timestamp in api_call_log.items()
        }
        with open(api_call_log_file, 'w') as f:
            json.dump(api_call_log_serializable, f, indent=2)
        logging.info("Final API call log saved")
    except Exception as e:
        logging.error(f"Failed to save final API call log: {e}")

if __name__ == '__main__':
    logging.info(f"Finished Spotify search for city: {city_name}")
    print(f"Processed {len(artists_with_uri)} artists with URIs and {len(artists_without_uri)} artists without URIs")
