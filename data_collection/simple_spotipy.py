#!/usr/bin/env python

import os
import logging
import spotipy
from dotenv import load_dotenv
from fuzzywuzzy import process
from spotipy.oauth2 import SpotifyClientCredentials
from utils import (
    extract_from_database_spotify,
    commit_to_database,
    commit_genres_to_dataBase,
    extract_from_database,
    execute_query2,
    load_genres_from_csv,
    split_and_clean_genres
)
import datetime
import pickle
import argparse
import time
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
logging.basicConfig(level=logging.ERROR, 
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    handlers=[
                        logging.FileHandler(api_log_file),
                        logging.StreamHandler()  # Added to print logs to console
                    ])

# Separate logger for tracking fuzzy matching and fallback scenarios
fallback_logger = logging.getLogger('fuzzyMatchLogger')
fallback_handler = logging.FileHandler(fuzzy_match_log_file, mode='a')
fallback_handler.setLevel(logging.INFO)
fallback_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
fallback_handler.setFormatter(fallback_formatter)
fallback_logger.addHandler(fallback_handler)

# Load or initialize the API call log
try:
    if os.path.exists(api_call_log_file):
        with open(api_call_log_file, 'rb') as f:
            api_call_log = pickle.load(f)
    else:
        api_call_log = {}
except Exception as e:
    logging.error(f"Error loading API call log: {e}")
    api_call_log = {}  # Use empty dict if there's an error

# Initialize Spotify client with direct credentials
logging.info(f"Starting Spotify search for city: {city_name}")
try:
    # Use direct environment variables instead of JSON config
    SPOTIPY_CLIENT_ID = os.environ.get('NEW_SPOTIPY_CLIENT_ID')
    SPOTIPY_CLIENT_SECRET = os.environ.get('NEW_SPOTIPY_CLIENT_SECRET')
    
    if not SPOTIPY_CLIENT_ID or not SPOTIPY_CLIENT_SECRET:
        logging.error("Missing Spotify credentials in environment variables")
        sys.exit(1)
        
    logging.info("Initializing Spotify client with credentials")
    client_credentials_manager = SpotifyClientCredentials(
        client_id=SPOTIPY_CLIENT_ID,
        client_secret=SPOTIPY_CLIENT_SECRET
    )
    sp = spotipy.Spotify(client_credentials_manager=client_credentials_manager)
    logging.info("Spotify client initialized successfully")
except Exception as e:
    logging.error(f"Failed to initialize Spotify client: {e}")
    sys.exit(1)

# Set the maximum number of requests allowed per minute
MAX_REQUESTS_PER_MINUTE = 300
request_count = 0
start_time = time.time()

# Function to check if an artist has been called recently
def has_been_called_recently(name):
    two_weeks_ago = datetime.datetime.now() - datetime.timedelta(days=14)
    return name in api_call_log and api_call_log[name] > two_weeks_ago

# Function to update the API call log
def update_api_call_log(artist):
    global api_call_log
    api_call_log[artist] = datetime.datetime.now()
    
    # Save periodically to avoid constant disk writes
    if len(api_call_log) % 10 == 0:  # Save every 10 updates
        try:
            with open(api_call_log_file, 'wb') as f:
                pickle.dump(api_call_log, f)
        except Exception as e:
            logging.error(f"Failed to save API call log: {e}")

# Simple rate limiter
def global_rate_limiter():
    global request_count, start_time
    current_time = time.time()
    elapsed_time = current_time - start_time

    if elapsed_time < 60:
        if request_count >= MAX_REQUESTS_PER_MINUTE:
            # If rate limit exceeded, sleep for the remaining time in the current minute
            sleep_time = 60 - elapsed_time
            logging.info(f"Rate limit reached. Sleeping for {sleep_time:.2f} seconds...")
            time.sleep(sleep_time)
            # Reset the counters
            request_count = 0
            start_time = time.time()
        else:
            request_count += 1
    else:
        # Reset the counters if more than a minute has passed
        request_count = 1
        start_time = time.time()

# Function to handle Spotify API search with retries and timeout
def safe_spotify_search(sp, artist_name, retries=3, timeout=10):
    global_rate_limiter()  # Apply the global rate limiter before each API call

    for attempt in range(retries):
        try:
            logging.info(f"Attempt {attempt + 1} to search for artist: {artist_name}")
            
            # Set a timeout for this operation
            import signal
            
            def timeout_handler(signum, frame):
                raise TimeoutError(f"Search for {artist_name} timed out after {timeout} seconds")
                
            # Register the timeout handler
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(timeout)
            
            try:
                result = sp.search(artist_name, type='artist', limit=10)
                # Cancel the alarm on success
                signal.alarm(0)
                logging.info(f"Successfully retrieved data for {artist_name} on attempt {attempt + 1}")
                return result
            except TimeoutError as te:
                logging.error(f"{te}")
                signal.alarm(0)  # Cancel the alarm
                time.sleep(1)  # Brief pause before retrying
                continue
            finally:
                # Ensure the alarm is canceled
                signal.alarm(0)

        except spotipy.exceptions.SpotifyException as e:
            if hasattr(e, 'http_status') and e.http_status == 429:  # Rate limit exceeded
                retry_after = int(getattr(e, 'headers', {}).get('Retry-After', 1))
                logging.warning(f"Rate limit exceeded on attempt {attempt + 1}. Retrying after {retry_after} seconds...")
                time.sleep(retry_after + 1)  # Add 1 second buffer
            else:
                logging.error(f"Spotify API error for {artist_name} on attempt {attempt + 1}: {e}")
                if attempt < retries - 1:
                    time.sleep(1)  # Brief delay before retrying
                else:
                    return None  # Return None after last retry

        except Exception as e:
            logging.error(f"An unexpected error occurred for {artist_name} on attempt {attempt + 1}: {e}")
            if attempt < retries - 1:
                time.sleep(1)  # Brief delay before retrying
            else:
                return None  # Return None after last retry

    logging.error(f"Failed to retrieve data for {artist_name} after {retries} attempts")
    return None  # Return None if all retries are exhausted

# Helper function to get event_id for an artist
def get_event_id_for_artist(artist_name):
    query = """
        SELECT ea.event_id
        FROM clubfindr.event_artists ea
        JOIN clubfindr.artists a ON ea.artist_id = a.id
        WHERE a.artist_name = %s;
    """
    
    # Using execute_query2 to execute the query and return the event_id
    try:
        result = execute_query2(query, (artist_name,), return_results=True)
        
        if result:
            logging.info(f"Found event_id {result[0]} for artist: {artist_name}")
            return result[0]  # Return the first item in the tuple (event_id)
        else:
            logging.warning(f"No event ID found for artist: {artist_name}")
            return None
    except Exception as e:
        logging.error(f"Database error fetching event_id for {artist_name}: {e}")
        return None

# Helper function to get city for an event
def get_city_for_event(event_id):
    query = """
        SELECT city
        FROM clubfindr.events
        WHERE id = %s;
    """
    
    # Using execute_query2 to execute the query and return the city
    try:
        result = execute_query2(query, (event_id,), return_results=True)
        
        if result:
            logging.info(f"Found city {result[0]} for event_id: {event_id}")
            return result[0]  # Return the first item in the tuple (city)
        else:
            logging.warning(f"No city found for event_id: {event_id}")
            return None
    except Exception as e:
        logging.error(f"Database error fetching city for event {event_id}: {e}")
        return None

# Update event genres
def update_event_genres(artist_name):
    """
    Update event genres for all events associated with a given artist.
    
    Args:
        artist_name (str): Name of the artist to update event genres for.
    """
    try:
        # Get the event ID associated with the artist
        event_id = get_event_id_for_artist(artist_name)
        if not event_id:
            logging.warning(f"No event found for artist: {artist_name}")
            return
            
        # Get the city for the event
        city = get_city_for_event(event_id)
        if not city:
            logging.warning(f"No city found for event associated with artist: {artist_name}")
            return
            
        # SQL query to update event genres by aggregating genres from associated artists
        update_event_data_genres_query = """
            UPDATE clubfindr.events
            SET event_genres = (
                SELECT array_agg(DISTINCT x ORDER BY x)
                FROM (
                    SELECT unnest(a.genres) AS x
                    FROM clubfindr.event_artists ea
                    JOIN clubfindr.artists a ON ea.artist_id = a.id
                    WHERE ea.event_id = %s
                    AND a.genres IS NOT NULL 
                    AND cardinality(a.genres) > 0
                ) subquery
            )
            WHERE id = %s AND city = %s;
        """
        
        # Commit the update to the database
        commit_to_database(update_event_data_genres_query, (event_id, event_id, city))
        logging.info(f"Event genres updated for event_id {event_id} in city {city}")
    except Exception as e:
        logging.error(f"Failed to update event genres for {artist_name}: {e}")
        # Log the full traceback for more detailed error information
        import traceback
        logging.error(traceback.format_exc())

# Use the constructed query to fetch artists for the specific city
def get_artists_query():
    return """
    SELECT id, artist_name, spotify_uri 
    FROM clubfindr.artists 
    WHERE primary_city = %s;
    """

# Main execution with proper error handling
try:
    # Fetch artist data for this city
    query = get_artists_query()
    raw_artist_data = extract_from_database_spotify(query, (city_name,))
    
    if not raw_artist_data:
        logging.warning(f"No artists found for city: {city_name}")
        logging.info("Exiting script as no artists were found.")
        sys.exit(0)
    
    logging.info(f"Fetched {len(raw_artist_data)} artists from database.")
    
    # Log a sample of the data for debugging
    sample = list(raw_artist_data.items())[:3] if raw_artist_data else []
    logging.info(f"Sample artist data: {sample}")

    # Prepare dictionaries to hold artists with and without URIs
    artists_with_uri = {}
    artists_without_uri = {}

    # Iterate over raw_artist_data to split into artists with and without URIs
    for artist_id, (artist_name_list, spotify_uri) in raw_artist_data.items():
        try:
            artist_name = ''.join(artist_name_list).strip() if artist_name_list else None
            
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
    for artist_id, (artist_name, spotify_uri) in artists_with_uri.items():
        try:
            logging.info(f"Processing artist with URI: {artist_name}")
            result = safe_spotify_search(sp, spotify_uri)
            
            if result is None:
                # Still mark as processed to avoid retrying continuously
                update_api_call_log(artist_name)
                continue

            # Get artist details from the first item
            if 'artists' in result and 'items' in result['artists'] and result['artists']['items']:
                artist_data = result['artists']['items'][0]
                new_genres = artist_data.get('genres', [])
                
                # Process the genres
                new_genres_list = [genre.strip().lower() for genre in new_genres if genre]
                logging.info(f"Found genres for {artist_name}: {new_genres_list}")
                
                if not new_genres_list:
                    logging.warning(f"No genres found for {artist_name}")
                    update_api_call_log(artist_name)
                    continue

                # Load valid genres from CSV
                valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
                if not valid_genres:
                    logging.error("Failed to load valid genres from CSV")
                    continue
                    
                # Clean and normalize genres
                cleaned_genres = split_and_clean_genres(new_genres_list, valid_genres)
                if not cleaned_genres:
                    logging.warning(f"No valid genres found for {artist_name}")
                    update_api_call_log(artist_name)
                    continue
                    
                logging.info(f"Cleaned genres for {artist_name}: {cleaned_genres}")

                # Define the query to update genres in the artist database
                update_genres_query = """
                    UPDATE clubfindr.artists
                    SET genres = %s
                    WHERE artist_name = %s
                    RETURNING id;
                """

                try:
                    cleaned_genres_array = [genre for genre in cleaned_genres if genre and genre.strip()]

                    artist_result = execute_query2(update_genres_query, 
                            (cleaned_genres_array, artist_name),
                            return_results=True)
                    if artist_result:
                        logging.info(f"Genres updated for {artist_name}")
                        # Update event genres
                        update_event_genres(artist_name)
                    else:
                        logging.error(f"Failed to update genres for {artist_name}")
                except Exception as e:
                    logging.error(f"Database error updating genres for {artist_name}: {e}")
            else:
                logging.warning(f"No artist data found for {artist_name}")

            # Update API call log
            update_api_call_log(artist_name)
            
        except Exception as e:
            logging.error(f"Error processing artist {artist_name}: {e}")
            # Still mark as processed to avoid getting stuck
            update_api_call_log(artist_name)

    # Process artists without a Spotify URI using fuzzy logic
    # Process in smaller batches to avoid memory issues
    BATCH_SIZE = 20
    artists_without_uri_items = list(artists_without_uri.items())
    artists_without_uri_batches = [artists_without_uri_items[i:i+BATCH_SIZE] for i in range(0, len(artists_without_uri_items), BATCH_SIZE)]

    for batch_idx, batch in enumerate(artists_without_uri_batches):
        logging.info(f"Processing batch {batch_idx+1}/{len(artists_without_uri_batches)} of artists without URIs")
        
        for artist_id, artist_name in batch:
            try:
                logging.info(f"Processing artist without URI: {artist_name}")
                
                if not artist_name or not artist_name.strip():
                    logging.warning(f"Empty artist name for artist_id={artist_id}, skipping.")
                    continue

                result = safe_spotify_search(sp, artist_name)
                
                if result is None or 'artists' not in result or 'items' not in result['artists']:
                    update_api_call_log(artist_name)  # Mark as processed anyway
                    continue

                if not result['artists']['items']:
                    logging.warning(f"No artists found for {artist_name} in Spotify search.")
                    update_api_call_log(artist_name)  # Mark as processed
                    continue

                # Use fuzzy logic to match the artist and get the URI and genres
                try:
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

                    match_score = best_match[0][1]
                    matched_artist_name = best_match[0][0]
                    logging.info(f"Best match for '{artist_name}': '{matched_artist_name}' with score {match_score}")
                    
                    if match_score >= 90:  # Slightly lower threshold than 95
                        raw_genres = names_genres[matched_artist_name]
                        uri = names_uri[matched_artist_name]
                        
                        logging.info(f"Raw genres for '{matched_artist_name}': {raw_genres}")
                        
                        # Load valid genres
                        valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
                        if not valid_genres:
                            logging.error("Failed to load valid genres CSV")
                            update_api_call_log(artist_name)  # Mark as processed anyway
                            continue
                            
                        # Clean genres
                        cleaned_genres = split_and_clean_genres(raw_genres, valid_genres)
                        logging.info(f"Cleaned genres: {cleaned_genres}")
                        
                        if not cleaned_genres:
                            logging.warning(f"No valid genres found for {artist_name}")
                            update_api_call_log(artist_name)  # Mark as processed anyway
                            continue

                        # Update the artist's Spotify URI in the database
                        insert_spotify_uri_query = """
                            UPDATE clubfindr.artists
                            SET spotify_uri = %s 
                            WHERE artist_name = %s
                            RETURNING id;
                        """
                        # Update artist genres
                        update_genres_query = """
                                UPDATE clubfindr.artists
                                SET genres = %s
                                WHERE artist_name = %s
                                RETURNING id;
                            """
                        try:
                            cleaned_genres_array = [genre for genre in cleaned_genres if genre and genre.strip()]

                            artist_result = execute_query2(update_genres_query, 
                                                        (cleaned_genres_array, artist_name),
                                                        return_results=True)
                            if not artist_result:
                                logging.error(f"Failed to update Spotify URI for {artist_name}")
                            else:
                                logging.info(f"Spotify URI updated for {artist_name}: {uri}")
                                
                            # Update artist genres
                            update_genres_query = """
                                UPDATE clubfindr.artists
                                SET genres = %s
                                WHERE artist_name = %s
                                RETURNING id;
                            """
                            
                            artist_result = execute_query2(update_genres_query, 
                                                        (cleaned_genres, artist_name),
                                                        return_results=True)
                                                        
                            if artist_result:
                                logging.info(f"Genres updated for {artist_name}")
                                update_event_genres(artist_name)
                            else:
                                logging.error(f"Failed to update genres for {artist_name}")
                                
                        except Exception as e:
                            logging.error(f"Database error for {artist_name}: {e}")
                    else:
                        logging.info(f"Match score {match_score} too low for {artist_name}, skipping")
                except Exception as e:
                    logging.error(f"Error in fuzzy matching for {artist_name}: {e}")
                    
                # Always mark as processed regardless of outcome
                update_api_call_log(artist_name)
                
            except Exception as e:
                logging.error(f"Error processing artist {artist_name}: {e}")
                update_api_call_log(artist_name)  # Mark as processed anyway
                
        # After processing all artists in the batch
        try:
            import gc
            gc.collect()
            logging.info(f"Completed processing batch {batch_idx+1}/{len(artists_without_uri_batches)}")
            time.sleep(2)  # Small pause between batches
        except Exception as e:
            logging.error(f"Error during batch cleanup: {e}")

    # Save the API call log one final time
    try:
        with open(api_call_log_file, 'wb') as f:
            pickle.dump(api_call_log, f)
        logging.info("Final API call log saved")
    except Exception as e:
        logging.error(f"Failed to save final API call log: {e}")
        
except Exception as e:
    logging.error(f"Unhandled error in main execution: {e}")
    import traceback
    logging.error(traceback.format_exc())
    sys.exit(1)
    
if __name__ == '__main__':
    logging.info(f"Finished Spotify search for city: {city_name}")
    print(f"Processed artists for {city_name}: {len(artists_with_uri)} with URI and {len(artists_without_uri)} without URI")