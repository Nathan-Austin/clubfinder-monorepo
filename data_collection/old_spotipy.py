import os
import logging
import spotipy
from dotenv import load_dotenv
import shutil
from fuzzywuzzy import process
from spotipy.oauth2 import SpotifyClientCredentials
from utils import extract_from_database_spotify, commit_to_database, commit_genres_to_dataBase, extract_from_database, execute_query2
import datetime
import pickle
import argparse
import time

# Load environment variables
load_dotenv()

# Argument parsing to get the city name
parser = argparse.ArgumentParser(description="Fetch Spotify data and update the database.")
parser.add_argument('city_name', type=str, help="Name of the city")
args = parser.parse_args()

# Use the city_name argument in your script
city_name = args.city_name.lower().replace(' ', '_')

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
                    ])

# Separate logger for tracking fuzzy matching and fallback scenarios
fallback_logger = logging.getLogger('fuzzyMatchLogger')
fallback_handler = logging.FileHandler(fuzzy_match_log_file, mode='a')
fallback_handler.setLevel(logging.INFO)
fallback_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
fallback_handler.setFormatter(fallback_formatter)
fallback_logger.addHandler(fallback_handler)

# Load or initialize the API call log
if os.path.exists(api_call_log_file):
    with open(api_call_log_file, 'rb') as f:
        api_call_log = pickle.load(f)
else:
    api_call_log = {}

logging.info("Starting Spotify search...")
SPOTIPY_CLIENT_ID = os.environ.get('NEW_SPOTIPY_CLIENT_ID')
SPOTIPY_CLIENT_SECRET = os.environ.get('NEW_SPOTIPY_CLIENT_SECRET')
sp = spotipy.Spotify(client_credentials_manager=SpotifyClientCredentials(client_id=SPOTIPY_CLIENT_ID,
                                                                         client_secret=SPOTIPY_CLIENT_SECRET))

# Function to check if an artist has been called recently
def has_been_called_recently(name):
    two_weeks_ago = datetime.datetime.now() - datetime.timedelta(days=14)
    return name in api_call_log and api_call_log[name] > two_weeks_ago

# Function to update the API call log
def update_api_call_log(artist):
    api_call_log[artist] = datetime.datetime.now()
    with open(api_call_log_file, 'wb') as f:
        pickle.dump(api_call_log, f)

# Set the maximum number of requests allowed within a given time period
MAX_REQUESTS_PER_MINUTE = 30  # Adjust this based on the API's rate limits

# Track the number of requests made in the current minute
request_count = 0
start_time = time.time()

def global_rate_limiter():
    global request_count, start_time
    current_time = time.time()
    elapsed_time = current_time - start_time

    if elapsed_time < 60:
        if request_count >= MAX_REQUESTS_PER_MINUTE:
            # If rate limit exceeded, sleep for the remaining time in the current minute
            sleep_time = 60 - elapsed_time
            print(f"Rate limit reached. Sleeping for {sleep_time:.2f} seconds...")
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

# Function to handle Spotify API search with retries

def safe_spotify_search(sp, artist_name, retries=3):
    global_rate_limiter()  # Apply the global rate limiter before each API call

    for attempt in range(retries):
        try:
            logging.info(f"Attempt {attempt + 1} to search for artist: {artist_name}")
            result = sp.search(artist_name, type='artist', limit=10)
            logging.info(f"Successfully retrieved data for {artist_name} on attempt {attempt + 1}")
            return result  # Return the result if the API call is successful

        except spotipy.exceptions.SpotifyException as e:
            if e.http_status == 429:  # Rate limit exceeded
                retry_after = int(e.headers.get('Retry-After', 1))
                logging.warning(f"Rate limit exceeded on attempt {attempt + 1}. Retrying after {retry_after} seconds...")
                time.sleep(retry_after)  # Wait before retrying
            else:
                logging.error(f"Spotify API error for {artist_name} on attempt {attempt + 1}: {e}")
                return None  # Return None if there's a different API error

        except Exception as e:
            logging.error(f"An unexpected error occurred on attempt {attempt + 1}: {e}")
            return None  # Return None if there's a non-Spotify exception

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
    result = execute_query2(query, (artist_name,), return_results=True)

    if result:
        logging.info(f"Found event_id {result[0]} for artist: {artist_name}")
        return result[0]  # Return the first item in the tuple (event_id)
    else:
        logging.error(f"No event ID found for artist: {artist_name}")
        return None




# Helper function to get city for an event
def get_city_for_event(event_id):
    query = """
        SELECT city
        FROM clubfindr.events
        WHERE id = %s;
    """

    # Using execute_query2 to execute the query and return the city
    result = execute_query2(query, (event_id,), return_results=True)

    if result:
        logging.info(f"Found city {result[0]} for event_id: {event_id}")
        return result[0]  # Return the first item in the tuple (city)
    else:
        logging.error(f"No city found for event_id: {event_id}")
        return None


# Update event genres
def update_event_genres(artist_name):
    event_id = get_event_id_for_artist(artist_name)
    if event_id:
        city = get_city_for_event(event_id)
        if city:
            update_event_data_genres_query = """
                UPDATE clubfindr.events
                SET event_genres = (
                    SELECT array_agg(DISTINCT genre)
                    FROM (
                        SELECT unnest(a.genres) AS genre
                        FROM clubfindr.event_artists ea
                        JOIN clubfindr.artists a ON ea.artist_id = a.id
                        WHERE ea.event_id = clubfindr.events.id
                    ) subquery
                )
                WHERE id = %s AND city = %s;
            """
            try:
                commit_to_database(update_event_data_genres_query, (event_id, city))
                logging.info(f"Event genres updated for event_id {event_id} in city {city}")
            except Exception as e:
                logging.error(f"Failed to update event genres for {artist_name}: {e}")
        else:
            logging.error(f"City not found for event_id {event_id}. Skipping update.")
    else:
        logging.error(f"Event ID not found for artist {artist_name}. Skipping update.")

# Use the constructed query to fetch artists
def get_artists_query():
    return """SELECT id, artist_name, spotify_uri FROM clubfindr.artists;"""

# Fetch artist data
query = get_artists_query()
raw_artist_data = extract_from_database_spotify(query)

logging.info(f"Fetched {len(raw_artist_data)} artists from database.")
logging.debug(f"Raw artist data: {raw_artist_data}")

# Prepare dictionaries to hold artists with and without URIs
artists_with_uri = {}
artists_without_uri = {}

# Iterate over raw_artist_data to split into artists with and without URIs
for artist_id, (artist_name_list, spotify_uri) in raw_artist_data.items():
    artist_name = ''.join(artist_name_list).strip()  # Reconstructing the artist name
    logging.debug(f"Processing artist_id={artist_id}, artist_name={artist_name}, spotify_uri={spotify_uri}")

    if spotify_uri is not None and not has_been_called_recently(artist_name):
        artists_with_uri[artist_id] = (artist_name, spotify_uri)
    elif spotify_uri is None and not has_been_called_recently(artist_name):
        artists_without_uri[artist_id] = artist_name

logging.debug(f"Artists with URI: {artists_with_uri}")
logging.debug(f"Artists without URI: {artists_without_uri}")

# Process artists with URI
for artist_id, (artist_name, spotify_uri) in artists_with_uri.items():
    logging.info(f"Processing artist with URI: {artist_name}")
    result = safe_spotify_search(sp, spotify_uri)
    if result is None:
        continue

    new_genres = result.get('genres', [])
    new_genres_list = [genre.strip().lower() for genre in new_genres if genre]

    # Define the query to update genres in the artist database
    update_genres_query = """
        UPDATE clubfindr.artists
        SET genres = (SELECT array_agg(DISTINCT x) 
        FROM unnest(genres || %s::text[]) AS x)
        WHERE artist_name = %s;
    """

    try:
        commit_to_database(update_genres_query, (new_genres_list, artist_name))
        logging.info(f"Genres updated for {artist_name}: {new_genres_list}")
    except Exception as e:
        logging.error(f"Failed to update genres for {artist_name}: {e}")

    # Update event genres for the artist
    update_event_genres(artist_name)

    # Update API call log
    update_api_call_log(artist_name)

# Process artists without a Spotify URI using fuzzy logic
for artist_id, artist_name in artists_without_uri.items():
    logging.info(f"Processing artist without URI: {artist_name}")

    if not artist_name.strip():
        logging.warning(f"Empty artist name encountered for artist_id: {artist_id}. Skipping...")
        continue
    
    result = safe_spotify_search(sp, artist_name)
    if result is None:
        continue

    if not result['artists']['items']:
        logging.warning(f"No artists found for {artist_name} in Spotify search.")
        continue

    # Use fuzzy logic to match the artist and get the URI and genres
    listdic = result['artists']['items']
    names_genres = dict(zip([d['name'] for d in listdic], [d['genres'] for d in listdic]))
    names_uri = dict(zip([d['name'] for d in listdic], [d['uri'] for d in listdic]))

    best_match = process.extractBests(artist_name, names_genres.keys(), score_cutoff=80, limit=1)
    fallback_logger.info(f"Fuzzy matching result for {artist_name}: {best_match}")

    if not best_match:
        logging.warning(f"No fuzzy match found for {artist_name}.")
        continue

    if best_match[0][1] >= 95:
        matched_artist_name = best_match[0][0]
        new_genres = names_genres[matched_artist_name]
        uri = names_uri[matched_artist_name]

        # Update the artist's Spotify URI in the database
        insert_spotify_uri_query = """
            UPDATE clubfindr.artists
            SET spotify_uri = %s 
            WHERE artist_name = %s;
        """
        try:
            commit_genres_to_dataBase(insert_spotify_uri_query, (uri, artist_name))
            logging.info(f"Spotify URI updated for {artist_name}: {uri}")
        except Exception as e:
            logging.error(f"Failed to update Spotify URI for {artist_name}: {e}")

        # Process the new genres safely as a list of parameters
        new_genres_list = [genre.strip().lower() for genre in new_genres if genre]

        # Define the query to update genres in the artist database
        update_genres_query = """
            UPDATE clubfindr.artists
            SET genres = (SELECT array_agg(DISTINCT x) 
            FROM unnest(genres || %s::text[]) AS x)
            WHERE artist_name = %s;
        """
        
        try:
            commit_to_database(update_genres_query, (new_genres_list, artist_name))
            logging.info(f"Genres updated for {artist_name}: {new_genres_list}")
        except Exception as e:
            logging.error(f"Failed to update genres for {artist_name}: {e}")

        # Update event genres for the artist
        update_event_genres(artist_name)

        # Update API call log
        update_api_call_log(artist_name)

if __name__ == '__main__':
    logging.info("Finished Spotify search.")