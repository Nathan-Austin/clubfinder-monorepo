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
import pickle
import argparse
import time
import json
import requests
import sys

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
api_call_log_file = os.path.join(log_dir, f'spotify_api_call_log_{city_name}.pkl')

# Ensure the directories exist
ensure_directory_exists(api_log_file)
ensure_directory_exists(fuzzy_match_log_file)
ensure_directory_exists(api_call_log_file)

# Configure the main logger
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    handlers=[
                        logging.FileHandler(api_log_file),
                        logging.StreamHandler()  # Added to print logs to console for debugging
                    ])

# Separate logger for tracking fuzzy matching and fallback scenarios
fallback_logger = logging.getLogger('fuzzyMatchLogger')
fallback_handler = logging.FileHandler(fuzzy_match_log_file, mode='a')
fallback_handler.setLevel(logging.INFO)
fallback_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
fallback_handler.setFormatter(fallback_formatter)
fallback_logger.addHandler(fallback_handler)

# Load or initialize the API call log with improved error handling
try:
    if os.path.exists(api_call_log_file):
        with open(api_call_log_file, 'rb') as f:
            api_call_log = pickle.load(f)
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
    logging.debug(f"Raw SPOTIFY_CREDENTIALS: {spotify_credentials_str[:20]}...")  # Log first 20 chars for debugging
    
    spotify_credentials = json.loads(spotify_credentials_str)
    if not spotify_credentials:
        raise ValueError("No Spotify credentials found in environment")
    
    logging.info(f"Successfully loaded {len(spotify_credentials)} Spotify credentials")
except json.JSONDecodeError as e:
    logging.error(f"Failed to parse Spotify credentials: {e}")
    logging.error(f"Raw credentials value: {spotify_credentials_str[:50]}...")  # First 50 chars
    sys.exit(1)  # Exit with error rather than proceeding with invalid credentials
except Exception as e:
    logging.error(f"Unexpected error loading credentials: {e}")
    sys.exit(1)

# Initialize credential rotation and rate limit tracking
current_credential_index = 0
spotify_clients = []

# Rate limiting settings per API key
REQUESTS_PER_KEY = 80  # More conservative limit (reduced from 100)
REQUEST_TRACKING = {}  # Track requests per key

def init_request_tracking(client_id):
    """Initialize or reset tracking for an API key."""
    REQUEST_TRACKING[client_id] = {
        'count': 0,
        'start_time': time.time(),
        'last_request': time.time()
    }

# Initialize clients and request tracking for each credential
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
            
            # Initialize request tracking for this client
            init_request_tracking(cred['client_id'])
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

def rotate_spotify_client():
    """Enhanced client rotation with rate limit tracking."""
    global current_credential_index, sp
    
    # Get current client's ID for logging
    current_cred = spotify_credentials[current_credential_index]
    old_client_id = current_cred['client_id']
    
    # Rotate to next client
    current_credential_index = (current_credential_index + 1) % len(spotify_clients)
    sp = spotify_clients[current_credential_index]
    
    # Get new client's ID
    new_cred = spotify_credentials[current_credential_index]
    new_client_id = new_cred['client_id']
    
    # Initialize tracking for the new client if needed
    if new_client_id not in REQUEST_TRACKING:
        init_request_tracking(new_client_id)
    
    logging.info(f"Rotated from client {old_client_id[-4:]} to {new_client_id[-4:]} (index: {current_credential_index + 1})")

# Function to check if an artist has been called recently
def has_been_called_recently(name):
    two_weeks_ago = datetime.datetime.now() - datetime.timedelta(days=14)
    return name in api_call_log and api_call_log[name] > two_weeks_ago

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
            with open(api_call_log_file, 'wb') as f:
                pickle.dump(api_call_log, f)
            last_save_time = current_time
            logging.debug(f"Saved API call log at {datetime.datetime.now()}")
        except Exception as e:
            logging.error(f"Failed to save API call log: {e}")

def check_rate_limit(client_id):
    """Check if we've hit rate limit for this key and handle accordingly."""
    if client_id not in REQUEST_TRACKING:
        init_request_tracking(client_id)
        return

    tracking = REQUEST_TRACKING[client_id]
    current_time = time.time()
    elapsed_time = current_time - tracking['start_time']

    # Add small delay between requests to the same key
    time_since_last = current_time - tracking['last_request']
    if time_since_last < 0.2:  # 200ms minimum between requests (increased from 100ms)
        time.sleep(0.2 - time_since_last)

    # Reset counter if a minute has passed
    if elapsed_time >= 60:
        init_request_tracking(client_id)
    else:
        # If we've hit the limit, rotate to next client
        if tracking['count'] >= REQUESTS_PER_KEY:
            rotate_spotify_client()
            # Initialize tracking for the new client
            current_cred = spotify_credentials[current_credential_index]
            init_request_tracking(current_cred['client_id'])
        else:
            tracking['count'] += 1
            tracking['last_request'] = time.time()

def global_rate_limiter():
    """Enhanced rate limiter that handles multiple API keys."""
    try:
        current_cred = spotify_credentials[current_credential_index]
        check_rate_limit(current_cred['client_id'])
    except Exception as e:
        logging.error(f"Error in rate limiter: {e}")
        # Rotate to next client as precaution
        rotate_spotify_client()

# Function to handle Spotify API search with retries and improved error handling
def safe_spotify_search(sp, artist_name, retries=3):
    """
    Perform a safe search using the Spotify API with credential rotation and detailed genre logging.
    """
    global_rate_limiter()  # Apply the global rate limiter before each API call
    
    all_clients_tried = False
    original_client_index = current_credential_index
    
    for attempt in range(retries):
        try:
            logging.info(f"Attempt {attempt + 1} to search for artist: {artist_name}")
            
            # Make the API call with a timeout
            result = sp.search(artist_name, type='artist', limit=10)
            logging.info(f"Successfully retrieved data for {artist_name} on attempt {attempt + 1}")
            
            # Log the structure of the result to understand what we got back
            if result and 'artists' in result and 'items' in result['artists']:
                items_count = len(result['artists']['items'])
                logging.info(f"Found {items_count} artist results for '{artist_name}'")
                
                if items_count > 0:
                    # Log the top result
                    top_result = result['artists']['items'][0]
                    found_name = top_result.get('name', 'Unknown')
                    found_popularity = top_result.get('popularity', 'Unknown')
                    found_uri = top_result.get('uri', 'None')
                    
                    # Extract and log the genres
                    raw_genres = top_result.get('genres', [])
                    logging.info(f"Top result: '{found_name}' (Popularity: {found_popularity}, URI: {found_uri})")
                    logging.info(f"Raw genres for '{found_name}': {raw_genres}")
                    
                    # Load valid genres from CSV for comparison
                    valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
                    if valid_genres:
                        logging.info(f"Loaded {len(valid_genres)} valid genres from CSV")
                        
                        # Log which raw genres are in the valid genres list
                        valid_matches = [genre for genre in raw_genres if genre in valid_genres]
                        invalid_genres = [genre for genre in raw_genres if genre not in valid_genres]
                        
                        if valid_matches:
                            logging.info(f"Valid genres found: {valid_matches}")
                        else:
                            logging.info(f"No valid genres found among: {raw_genres}")
                        
                        if invalid_genres:
                            logging.info(f"Invalid/Unknown genres: {invalid_genres}")
                    else:
                        logging.error("Failed to load valid genres from CSV")
                else:
                    logging.info(f"No artist results found for '{artist_name}'")
            else:
                logging.warning(f"Unexpected result structure for '{artist_name}': {result}")
                
            return result

        except spotipy.exceptions.SpotifyException as e:
            # Handling Rate limit errors
            if hasattr(e, 'http_status') and e.http_status == 429:  # Rate limit exceeded
                logging.warning(f"Rate limit exceeded on attempt {attempt + 1} for {artist_name}.")
                
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
                logging.error(f"Spotify API error for {artist_name} on attempt {attempt + 1}: {e}")
                if attempt < retries - 1:
                    time.sleep(1)  # Brief delay before retrying
                    rotate_spotify_client()  # Try with a different client
                    continue
                return None

        except Exception as e:
            # Catch unexpected errors (network, timeout, etc.)
            logging.error(f"An unexpected error occurred while searching for {artist_name} on attempt {attempt + 1}: {e}")
            if attempt < retries - 1:
                time.sleep(1)  # Brief delay before retrying
                rotate_spotify_client()  # Try with a different client
                continue
            return None

    # If we've exhausted all retries
    logging.error(f"Failed to retrieve data for {artist_name} after {retries} attempts.")
    return None


def split_and_clean_genres_with_logging(genres, valid_genres):
    """Splits and cleans genres based on valid genres with detailed logging."""
    logging.info(f"Input genres for cleaning: {genres}")
    
    if not genres:
        logging.info("No genres provided for cleaning")
        return []

    # Convert valid_genres to set for O(1) lookup and normalize to lowercase
    valid_genres_set = {genre.strip().lower() for genre in valid_genres if genre}
    logging.info(f"Using {len(valid_genres_set)} valid genres for comparison")
    
    # Handle list or string input
    if isinstance(genres, list):
        genre_list = genres
    else:
        # Split on common delimiters and handle edge cases
        genre_list = re.split(r'\s*[,|/]\s*', str(genres))
    
    logging.info(f"Split into {len(genre_list)} genres: {genre_list}")

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
        
        # Handle compound genres (e.g., "TechHouse" -> "Tech House")
        compound_matches = []
        for valid_genre in valid_genres_set:
            if valid_genre in normalized or normalized in valid_genre:
                compound_matches.append(valid_genre)
        
        if compound_matches:
            # Sort by length descending to prefer longer matches
            compound_matches.sort(key=len, reverse=True)
            best_match = compound_matches[0]
            cleaned_genres.add(best_match)
            logging.info(f"Matched '{normalized}' to compound genre '{best_match}'")
        else:
            # Try exact match
            if normalized in valid_genres_set:
                cleaned_genres.add(normalized)
                logging.info(f"Exact match found for '{normalized}'")
            else:
                skipped_genres.append(normalized)
                logging.info(f"No match found for '{normalized}', skipping")

    if skipped_genres:
        logging.info(f"Skipped {len(skipped_genres)} invalid genres: {skipped_genres}")
    
    result = list(cleaned_genres)
    logging.info(f"Final cleaned genres ({len(result)}): {result}")
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
                event_ids_results = execute_query2(event_ids_query, (artist_name,), return_results=True)
                if not event_ids_results:
                    logging.warning(f"No events found for artist {artist_name}")
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
                    city_result = execute_query2(city_query, (event_id,event_id), return_results=True)
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
                    genres_result = execute_query2(all_genres_query, (event_id,), return_results=True)
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
        logging.error(f"Error processing events for artist {artist_name}: {e}")

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
    # Log sample data (first few artists) for debugging
    sample_data = list(raw_artist_data.items())[:3] if raw_artist_data else []
    logging.info(f"Sample artist data: {sample_data}")

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
                logging.info(f"Processing artist with URI: {artist_name}")
                result = safe_spotify_search(sp, spotify_uri)
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
                    logging.warning(f"No genres found for artist {artist_name}")
                    update_api_call_log(artist_name)  # Still mark as processed
                    continue

                # Clean and normalize genres
                cleaned_genres = split_and_clean_genres_with_logging(raw_genres, valid_genres)
                if not cleaned_genres:
                    logging.warning(f"No valid genres found for artist {artist_name}")
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
                                WHERE x IS NOT NULL AND x != ''
                            ) subquery
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
                        logging.info(f"Genres updated for {artist_name}: {cleaned_genres}")
                        # Update event genres for the artist
                        update_event_genres(artist_name)
                    else:
                        logging.error(f"Failed to update genres for {artist_name}")
                except Exception as e:
                    logging.error(f"Failed to update genres for {artist_name}: {e}")

                # Update API call log
                update_api_call_log(artist_name)
                
            except Exception as e:
                logging.error(f"Error processing artist {artist_name}: {e}")
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
                logging.info(f"Processing artist without URI: {artist_name}")
                
                if not artist_name or not artist_name.strip():
                    logging.warning(f"Empty artist name encountered for artist_id: {artist_id}. Skipping...")
                    continue

                result = safe_spotify_search(sp, artist_name)
                if result is None or 'artists' not in result or 'items' not in result['artists']:
                    update_api_call_log(artist_name)  # Mark as processed even if failed
                    continue

                if not result['artists']['items']:
                    logging.warning(f"No artists found for {artist_name} in Spotify search.")
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
                fallback_logger.info(f"Fuzzy matching result for {artist_name}: {best_match}")

                if not best_match:
                    logging.warning(f"No fuzzy match found for {artist_name}.")
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
                        logging.warning(f"No valid genres found for artist {artist_name}")
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
                            logging.error(f"Failed to update Spotify URI for {artist_name}")
                            continue
                        logging.info(f"Spotify URI updated for {artist_name}: {uri}")
                    except Exception as e:
                        logging.error(f"Failed to update Spotify URI for {artist_name}: {e}")
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
                                    WHERE x IS NOT NULL AND x != ''
                                ) subquery
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
                            logging.info(f"Genres updated for {artist_name}: {cleaned_genres}")
                            # Update event genres for the artist
                            update_event_genres(artist_name)
                        else:
                            logging.error(f"Failed to update genres for {artist_name}")
                    except Exception as e:
                        logging.error(f"Failed to update genres for {artist_name}: {e}")

                    # Update API call log
                    update_api_call_log(artist_name)
            except Exception as e:
                logging.error(f"Error processing artist {artist_name}: {e}")
        
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
        with open(api_call_log_file, 'wb') as f:
            pickle.dump(api_call_log, f)
        logging.info("Final API call log saved")
    except Exception as e:
        logging.error(f"Failed to save final API call log: {e}")

if __name__ == '__main__':
    logging.info(f"Finished Spotify search for city: {city_name}")
    print(f"Processed {len(artists_with_uri)} artists with URIs and {len(artists_without_uri)} artists without URIs")