import os
import logging
import spotipy
from dotenv import load_dotenv
import shutil
from fuzzywuzzy import process
from spotipy.oauth2 import SpotifyClientCredentials
from utils import extract_from_database_spotify, commit_to_database, commit_genres_to_dataBase
import datetime
import pickle
from psycopg2 import sql
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
                        #logging.StreamHandler()  # This sends log messages to the console
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

# Function to check if an artist has been called recently
def has_been_called_recently(name):
    seven_days_ago = datetime.datetime.now() - datetime.timedelta(days=7)
    if name in api_call_log and api_call_log[name] > seven_days_ago:
        return True
    return False

# Function to update the API call log
def update_api_call_log(artist):
    api_call_log[artist] = datetime.datetime.now()
    with open(api_call_log_file, 'wb') as f:
        pickle.dump(api_call_log, f)

# Function to update the API call log
def update_api_call_log(artist):
    api_call_log[artist] = datetime.datetime.now()
    with open(api_call_log_file, 'wb') as f:
        pickle.dump(api_call_log, f)

# Function to handle Spotify API search with retries
def safe_spotify_search(sp, artist_name, retries=3):
    for attempt in range(retries):
        try:
            return sp.search(artist_name, type='artist', limit=10)
        except spotipy.exceptions.SpotifyException as e:
            if e.http_status == 429:  # Rate limit exceeded
                retry_after = int(e.headers.get('Retry-After', 1))
                logging.warning(f"Rate limit exceeded, retrying after {retry_after} seconds...")
                time.sleep(retry_after)
            else:
                logging.error(f"Spotify API error for {artist_name}: {e}")
                return None
        except Exception as e:
            logging.error(f"An unexpected error occurred: {e}")
            return None

# Delete the cache directory if it exists
cache_path = ".cache"
if os.path.exists(cache_path):
    if os.path.isdir(cache_path):
        shutil.rmtree(cache_path)
        logging.info(f"Deleted cache directory at {cache_path}")
    else:
        os.remove(cache_path)
        logging.info(f"Deleted cache file at {cache_path}")

logging.info("Starting Spotify search...")
SPOTIPY_CLIENT_ID = os.environ.get('SPOTIPY_CLIENT_ID')
SPOTIPY_CLIENT_SECRET = os.environ.get('SPOTIPY_CLIENT_SECRET')
sp = spotipy.Spotify(client_credentials_manager=SpotifyClientCredentials(client_id=SPOTIPY_CLIENT_ID,
                                                                         client_secret=SPOTIPY_CLIENT_SECRET))
table_name = f"event_data_{city_name}"
artists_table_name= f"artists_{city_name}"

# Get all artists from the database
get_artists_query = f"""SELECT artist_id, artist_name, spotify_uri FROM {artists_table_name};"""
raw_artist_data = extract_from_database_spotify(get_artists_query)
logging.info(f"Fetched {len(raw_artist_data)} artists from database.")
print(f"raw_artist_data type: {type(raw_artist_data)}")
logging.debug(f"Raw artist data: {raw_artist_data}")

# Prepare dictionaries to hold artists with and without URIs
artists_with_uri = {}
artists_without_uri = {}

# Iterate over raw_artist_data to split into artists with and without URIs
for artist_id, (artist_name_list, spotify_uri) in raw_artist_data.items():
    # Reconstruct the artist name from the list
    artist_name = ''.join(artist_name_list).strip()  # Reconstructing the artist name
    
    logging.debug(f"Processing artist_id={artist_id}, artist_name={artist_name}, spotify_uri={spotify_uri}")
    
    if spotify_uri is not None and not has_been_called_recently(artist_name):
        # Artist has a URI and hasn't been called recently
        artists_with_uri[artist_id] = (artist_name, spotify_uri)
    elif spotify_uri is None and not has_been_called_recently(artist_name):
        # Artist does not have a URI and hasn't been called recently
        artists_without_uri[artist_id] = artist_name

logging.debug(f"Artists with URI: {artists_with_uri}")
logging.debug(f"Artists without URI: {artists_without_uri}")

## Process artists with URI (skipping fuzzy logic)
for artist_id, (artist_name, spotify_uri) in artists_with_uri.items():
    logging.info(f"Processing artist with URI: {artist_name}")
    result = safe_spotify_search(sp, spotify_uri)  # Assuming safe_spotify_search handles the search based on URI
    if result is None:
        continue

    new_genres = result.get('genres', [])
    new_genres_list = [genre.strip().lower() for genre in new_genres if genre]
    new_genres_str = ', '.join(f"'{genre.replace('\'', '\'\'')}'" for genre in new_genres_list)

    # Update genres in the artist database
    update_genres_query = sql.SQL("""UPDATE {artists_table_name}
        SET genres = (SELECT array_agg(DISTINCT x) 
        FROM unnest(genres || ARRAY[{new_genres_str}]::text[]) AS x)
        WHERE artist_name = {artist_name};""").format(
        artists_table_name=sql.Identifier(artists_table_name),
        new_genres_str=sql.Literal(new_genres_str),
        artist_name=sql.Literal(artist_name)
    )

    try:
        commit_to_database(update_genres_query)
        logging.info(f"Genres updated for {artist_name}: {new_genres_list}")
    except Exception as e:
        logging.error(f"Failed to update genres for {artist_name}: {e}")

    # Update genres in the event database
    update_event_data_genres_query = sql.SQL("""
        UPDATE {table}
        SET event_genres = (SELECT array_agg(DISTINCT x) 
        FROM unnest(event_genres || ARRAY[{genres}]::text[]) AS x)
        WHERE {artist} = ANY(artists);
    """).format(
        table=sql.Identifier(table_name),
        genres=sql.Literal(new_genres_str),
        artist=sql.Literal(artist_name)
    )
    try:
        commit_to_database(update_event_data_genres_query)
        logging.info(f"Event genres updated for {artist_name}: {new_genres_list}")
    except Exception as e:
        logging.error(f"Failed to update event genres for {artist_name}: {e}")
    
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

    # Use the fuzzy logic to match the artist and get the URI and genres
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
        insert_spotify_uri_query = sql.SQL("""UPDATE {artists_table_name} 
                                               SET spotify_uri = {uri} 
                                               WHERE artist_name = {artist_name};""").format(
                                                artists_table_name=sql.Identifier(artists_table_name),
                                                uri=sql.Literal(uri),
                                                artist_name=sql.Literal(artist_name)
                                            )
        try:
            commit_genres_to_dataBase(insert_spotify_uri_query)
            logging.info(f"Spotify URI updated for {artist_name}: {uri}")
        except Exception as e:
            logging.error(f"Failed to update Spotify URI for {artist_name}: {e}")

        # Process the new genres as before
        new_genres_list = [genre.strip().lower() for genre in new_genres if genre]
        new_genres_str = ', '.join(f"'{genre.replace('\'', '\'\'')}'" for genre in new_genres_list)

        update_genres_query = sql.SQL("""UPDATE {artists_table_name}
            SET genres = (SELECT array_agg(DISTINCT x) 
            FROM unnest(genres || ARRAY[{new_genres_str}]::text[]) AS x)
            WHERE artist_name = {artist_name};""").format(
            artists_table_name=sql.Identifier(artists_table_name),
            new_genres_str=sql.Literal(new_genres_str),
            artist_name=sql.Literal(artist_name)
        )

        try:
            commit_to_database(update_genres_query)
            logging.info(f"Genres updated for {artist_name}: {new_genres_list}")
        except Exception as e:
            logging.error(f"Failed to update genres for {artist_name}: {e}")

        update_event_data_genres_query = sql.SQL("""
            UPDATE {table}
            SET event_genres = (SELECT array_agg(DISTINCT x) 
            FROM unnest(event_genres || ARRAY[{genres}]::text[]) AS x)
            WHERE {artist} = ANY(artists);
        """).format(
            table=sql.Identifier(table_name),
            genres=sql.Literal(new_genres_str),
            artist=sql.Literal(artist_name)

        )
        try:
            commit_to_database(update_event_data_genres_query)
            logging.info(f"Event genres updated for {artist_name}: {new_genres_list}")
        except Exception as e:
            logging.error(f"Failed to update event genres for {artist_name}: {e}")
        
        update_api_call_log(artist_name)

if __name__ == '__main__':
    logging.info("Finished Spotify search.")
