import os
import time
import json
import requests
import datetime
import logging
import argparse
import re
from urllib.parse import urlparse
from dotenv import load_dotenv
from psycopg2 import sql
import csv
from log_utils import redact_identifier
from utils import (
    extract_from_database, 
    commit_to_database, 
    extract_event_id_from_database,
    execute_query2,
    load_genres_from_csv,
   
)


load_dotenv()
logging.basicConfig(
    level=logging.ERROR,
    filename="/home/nathan/clubfinder-monorepo/data_collection/soundcloud_api.log",
    filemode="a",
    format="%(asctime)s - %(levelname)s - %(message)s",
)

fallback_logger = logging.getLogger("fallbackLogger")
fallback_handler = logging.FileHandler("soundcloud_fallback.log", mode="a")
fallback_handler.setLevel(logging.ERROR)
fallback_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
fallback_handler.setFormatter(fallback_formatter)
fallback_logger.addHandler(fallback_handler)

MAX_API_CALLS = 15000
DELAY_BETWEEN_CALLS = 1  # 1 second delay between calls

# Initialize or load API call count from file
API_CALL_COUNT_FILE = "/home/nathan/clubfinder-monorepo/data_collection/api_call_count.json"
if os.path.exists(API_CALL_COUNT_FILE):
    with open(API_CALL_COUNT_FILE, "r") as f:
        api_call_count_data = json.load(f)
        last_reset_time = datetime.datetime.fromisoformat(api_call_count_data['last_reset_time'])
        api_call_count = api_call_count_data['api_call_count']
        
        # Reset count if 24 hours have passed
        if datetime.datetime.now() - last_reset_time > datetime.timedelta(days=1):
            api_call_count = 0
            last_reset_time = datetime.datetime.now()
else:
    api_call_count = 0
    last_reset_time = datetime.datetime.now()

def save_api_call_count():
    with open(API_CALL_COUNT_FILE, "w") as f:
        json.dump({
            'api_call_count': api_call_count,
            'last_reset_time': last_reset_time.isoformat()
        }, f)

def has_been_called_recently(name):
    two_weeks_ago = datetime.datetime.now() - datetime.timedelta(days=14)

    if name in api_call_log and api_call_log[name] > two_weeks_ago:
        return True

    return False


def get_data_base_info(city_name):
    # Parameterized query
    artists_names_query = """
        SELECT artist_name, soundcloud_link
        FROM clubfindr.artists
        WHERE soundcloud_link IS NOT NULL AND primary_city = %s; 
    """
    
    # Execute the query and pass the city_name as a parameter
    links_dict = extract_from_database(artists_names_query, (city_name,))
    
    return links_dict

def get_event_id_for_artist(artist_id):
    # Query to get event_id associated with the artist_id from event_artists
    event_id_query = """
        SELECT event_id
        FROM clubfindr.event_artists
        WHERE artist_id = %s;
    """
    
    # Fetch the event_id(s) for the given artist_id
    event_ids = extract_event_id_from_database(event_id_query, (artist_id,))
    
    # Extract the actual event_id values from the tuples and return as a list
    return [event_id[0] for event_id in event_ids] if event_ids else None



def get_access_token(client_id, client_secret):
    url = "https://api.soundcloud.com/oauth2/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "client_credentials",
    }
    response = requests.post(url, data=data)
    response.raise_for_status()
    tokens = response.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)  # Default to 1 hour if not provided
    token_expiry = time.time() + expires_in  # Calculate the expiry time
    return access_token, refresh_token, token_expiry

def refresh_access_token(client_id, client_secret, refresh_token):
    url = "https://secure.soundcloud.com/oauth/token"
    data = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }
    response = requests.post(url, data=data)
    response.raise_for_status()
    tokens = response.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)
    token_expiry = time.time() + expires_in
    return access_token, refresh_token, token_expiry


def normalize_soundcloud_url(raw_url):
    if not raw_url:
        return None

    cleaned = raw_url.strip()
    if not cleaned.startswith(("http://", "https://")):
        cleaned = f"https://{cleaned}"

    try:
        parsed = urlparse(cleaned)
    except Exception:
        return cleaned

    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]

    if netloc:
        parsed = parsed._replace(netloc=netloc, query="", fragment="")
        return parsed.geturl()

    return cleaned


def get_user_id(access_token, artist_name, artist_url):
    """Enhanced user ID retrieval with more robust error handling and logging."""
    # Require at least one identifier so we can attempt resolve or search.
    if not artist_name and not artist_url:
        logging.error(
            "Invalid artist input - Name: %s, URL: %s",
            redact_identifier(artist_name, "artist"),
            redact_identifier(artist_url, "url"),
        )
        return None

    try:
        headers = {"Authorization": f"Bearer {access_token}"}

        # First attempt: Resolve using the normalized URL if present.
        if artist_url:
            normalized_url = normalize_soundcloud_url(artist_url)
            candidates = [normalized_url]
            if normalized_url != artist_url:
                candidates.append(artist_url)

            for candidate_url in candidates:
                if not candidate_url:
                    continue
                try:
                    response = requests.get(
                        "https://api.soundcloud.com/resolve",
                        params={"url": candidate_url, "format": "json"},
                        headers=headers,
                        timeout=15,
                    )
                    response.raise_for_status()
                    user_info = response.json()
                    user_id = user_info.get("id")
                    if user_id:
                        logging.info(
                            "Successfully resolved user ID for %s via URL",
                            redact_identifier(artist_name, "artist"),
                        )
                        return user_id
                except Exception as url_resolve_error:
                    logging.warning(
                        "URL resolution failed for %s: %s",
                        redact_identifier(artist_name, "artist"),
                        url_resolve_error,
                    )

            # Fallback: resolve using username extracted from the URL path.
            try:
                parsed = urlparse(normalized_url or artist_url)
                path_parts = [part for part in parsed.path.split("/") if part]
                username = path_parts[0] if path_parts else None
            except Exception:
                username = None

            if username:
                try:
                    response = requests.get(
                        "https://api.soundcloud.com/resolve",
                        params={"url": f"https://soundcloud.com/{username}", "format": "json"},
                        headers=headers,
                        timeout=15,
                    )
                    response.raise_for_status()
                    user_info = response.json()
                    user_id = user_info.get("id")
                    if user_id:
                        logging.info(
                            "Successfully resolved user ID for %s via URL username",
                            redact_identifier(artist_name, "artist"),
                        )
                        return user_id
                except Exception as url_resolve_error:
                    logging.warning(
                        "URL username resolution failed for %s: %s",
                        redact_identifier(artist_name, "artist"),
                        url_resolve_error,
                    )

        # Fallback: Search by artist name
        if artist_name:
            try:
                response = requests.get(
                    "https://api.soundcloud.com/users",
                    params={"q": artist_name, "limit": 10},
                    headers=headers,
                    timeout=15,
                )
                response.raise_for_status()
                search_results = response.json()

                if isinstance(search_results, dict):
                    collection = search_results.get("collection", [])
                elif isinstance(search_results, list):
                    collection = search_results
                else:
                    collection = []

                if collection:
                    # Find the best match
                    best_match = max(
                        collection,
                        key=lambda x: (
                            # Prioritize exact name match
                            1 if x.get("username", "").lower() == artist_name.lower() else 0,
                            # Then by follower count or tracks count as a proxy for relevance
                            x.get("followers_count", 0) + x.get("track_count", 0),
                        ),
                    )
                    user_id = best_match.get("id")

                    if user_id:
                        logging.info(
                            "Found user ID for %s via search",
                            redact_identifier(artist_name, "artist"),
                        )
                        return user_id
            except Exception as search_error:
                logging.warning(
                    "Search failed for %s: %s",
                    redact_identifier(artist_name, "artist"),
                    search_error,
                )

        # If all methods fail
        logging.error(
            "Could not find user ID for artist: %s",
            redact_identifier(artist_name, "artist"),
        )
        return None

    except Exception as e:
        logging.error(
            "Unexpected error finding user ID for %s: %s",
            redact_identifier(artist_name, "artist"),
            e,
        )
        return None



def get_tracks_info(access_token, user_id, limit=10):
    tracks_url = f"https://api.soundcloud.com/users/{user_id}/tracks?limit={limit}format=json"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(tracks_url, headers=headers, timeout=10)
    response.raise_for_status()
    tracks_info = response.json()
    return tracks_info


def get_track_data(access_token, track_id):
    track_url = f"https://api.soundcloud.com/tracks/{track_id}?format=json"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(track_url, headers=headers)

    if response.status_code != 200:
        logging.error(
            f"Error getting track data for track {track_id}. Status code: {response.status_code}"
        )
        return None
    track_data_json = response.json()
    genre_data = track_data_json.get("genre", "")
    return genre_data

 


def update_database_new_genres(artist_name, soundcloud_link, genres, city_name, event_id):
    """Update artist and event genres with properly cleaned and normalized genres."""
    try:
        # Load valid genres from CSV
        valid_genres = load_genres_from_csv("/home/nathan/clubfinder-monorepo/data_collection/full_genre_list.csv")
        if not valid_genres:
            logging.error("Failed to load valid genres from CSV")
            return

        # Clean and normalize genres using the improved split_and_clean_genres function
        cleaned_genres = split_and_clean_genres(genres, valid_genres)
        if not cleaned_genres:
            logging.warning(
                "No valid genres found for artist %s",
                redact_identifier(artist_name, "artist"),
            )
            return

        # Updated query to use fully qualified column reference
        update_artists_genres_query = """
            UPDATE clubfindr.artists a
            SET genres = (
                WITH existing_cleaned AS (
                    SELECT unnest(array_cat(
                        COALESCE(a.genres, ARRAY[]::text[]),
                        %s::text[]
                    )) AS existing_genre
                )
                SELECT array_agg(DISTINCT existing_genre ORDER BY existing_genre)
                FROM existing_cleaned
                WHERE existing_genre IS NOT NULL AND trim(existing_genre) != ''
            )
            WHERE a.soundcloud_link = %s AND a.primary_city = %s
            RETURNING a.id;
        """
        
        # Execute artist update and get artist ID
        artist_result = execute_query2(update_artists_genres_query, 
                                     (cleaned_genres, soundcloud_link, city_name),
                                     return_results=True)
        
        if not artist_result:
            logging.error(
                "Failed to update or find artist %s",
                redact_identifier(artist_name, "artist"),
            )
            return

        # Update event genres by aggregating from all associated artists
        update_event_data_genres_query = """
            UPDATE clubfindr.events e
            SET event_genres = (
                WITH event_artist_genres AS (
                    SELECT unnest(a.genres) AS genre
                    FROM clubfindr.event_artists ea
                    JOIN clubfindr.artists a ON ea.artist_id = a.id
                    WHERE ea.event_id = %s
                    AND a.genres IS NOT NULL
                )
                SELECT array_agg(DISTINCT genre ORDER BY genre)
                FROM event_artist_genres
                WHERE genre IS NOT NULL AND trim(genre) != ''
            )
            WHERE e.id = %s AND e.city = %s;
        """
        
        # Execute event update
        commit_to_database(update_event_data_genres_query, (event_id, event_id, city_name))
        logging.info(
            "Successfully updated genres for artist %s and event %s",
            redact_identifier(artist_name, "artist"),
            redact_identifier(event_id, "event"),
        )

    except Exception as e:
        logging.error(
            "Failed to update database for artist %s with error: %s",
            redact_identifier(artist_name, "artist"),
            e,
        )
        # Add more detailed logging
        import traceback
        logging.error(traceback.format_exc())


def genre_cleaner(genre_str):
    """Enhanced genre cleaning and normalization."""
    if not genre_str or genre_str.lower() in ['none', '']:
        return None
        
    # Convert to string and lowercase
    genre_str = str(genre_str).lower().strip()
    
    # Remove quotes and special characters
    genre_str = re.sub(r'["\']', '', genre_str)
    genre_str = re.sub(r'[^\w\s-]', ' ', genre_str)
    
    # Handle common compound genres and normalizations
    genre_mappings = {
        'techhouse': 'tech house',
        'deephouse': 'deep house',
        'proghouse': 'progressive house',
        'dance - house': 'dance house',
        'dance edm': 'dance',
    }
    
    # Apply genre mappings
    for old, new in genre_mappings.items():
        genre_str = genre_str.replace(old, new)
    
    # Clean up whitespace
    genre_str = re.sub(r'\s+', ' ', genre_str)
    genre_str = genre_str.strip()
    
    return genre_str if genre_str else None

def split_and_clean_genres(genres, valid_genres):
    """
    Enhanced genre splitting and cleaning function.
    
    Args:
        genres (list or str): List of genres or single genre string
        valid_genres (set): Set of valid genres
    
    Returns:
        list: Cleaned and validated genres
    """
    # Ensure genres is a list
    if isinstance(genres, str):
        genres = [genres]
    
    # Clean and normalize genres
    cleaned_genres = []
    for genre in genres:
        # Clean the genre
        cleaned_genre = genre_cleaner(genre)
        
        # Skip if genre is None or empty after cleaning
        if not cleaned_genre:
            continue
        
        # Check against valid genres (case-insensitive)
        matching_genres = [
            valid_genre for valid_genre in valid_genres 
            if cleaned_genre.lower() == valid_genre.lower()
        ]
        
        if matching_genres:
            cleaned_genres.append(matching_genres[0])  # Use the exact case from valid genres
        else:
            # Log genres not found in the valid list
            logging.warning(
                "Genre not found in valid genres list: %s",
                redact_identifier(cleaned_genre, "genre"),
            )
    
    # Remove duplicates while preserving order
    return list(dict.fromkeys(cleaned_genres))


# Load or initialize the failed artist tracking system
FAILED_ARTISTS_FILE = "/home/nathan/clubfinder-monorepo/data_collection/failed_artists.json"

# Initialize or load failed artist log
if os.path.exists(FAILED_ARTISTS_FILE):
    with open(FAILED_ARTISTS_FILE, "r") as f:
        failed_artists_log_raw = json.load(f)
        # Convert ISO format strings back to datetime objects
        failed_artists_log = {
            name: datetime.datetime.fromisoformat(timestamp)
            for name, timestamp in failed_artists_log_raw.items()
        }
else:
    failed_artists_log = {}

def save_failed_artists():
    """Save the failed artists log to a file."""
    # Convert datetime objects to ISO format strings for JSON serialization
    failed_artists_log_serializable = {
        name: timestamp.isoformat()
        for name, timestamp in failed_artists_log.items()
    }
    with open(FAILED_ARTISTS_FILE, "w") as f:
        json.dump(failed_artists_log_serializable, f, indent=2)



def has_bad_link(name):
    retry_period = datetime.timedelta(days=30)  # Retry after 30 days
    if name in failed_artists_log:
        failed_time = failed_artists_log[name]
        if datetime.datetime.now() - failed_time > retry_period:
            del failed_artists_log[name]  # Allow re-try by removing from log
            save_failed_artists()
            return False
        return True
    return False



def call_api(artist, artist_url, access_token, refresh_token, token_expiry, api_call_log, city_name, client_id, client_secret):
    global api_call_count
    artist_cleaned = artist.replace(",", " ").strip()

    # Add more robust input validation
    if not artist_cleaned or not artist_url:
        logging.warning(
            "Invalid artist input - Name: %s, URL: %s",
            redact_identifier(artist_cleaned, "artist"),
            redact_identifier(artist_url, "url"),
        )
        return

    if has_bad_link(artist_cleaned):
        logging.info(
            "Skipping API call for %s, marked as bad link.",
            redact_identifier(artist_cleaned, "artist"),
        )
        return

    if has_been_called_recently(artist_cleaned):
        logging.info(
            "Skipping API call for %s, recently fetched.",
            redact_identifier(artist_cleaned, "artist"),
        )
        return

    if api_call_count >= MAX_API_CALLS:
        logging.error("Reached the maximum API call limit for the day. Stopping execution.")
        return

    if time.time() >= token_expiry:
        access_token, refresh_token, token_expiry = refresh_access_token(client_id, client_secret, refresh_token)

    # Update get_user_id call to handle potential None returns more gracefully
    user_id = get_user_id(access_token, artist_cleaned, artist_url)
    if not user_id:
        logging.error(
            "Failed to retrieve user ID for artist %s",
            redact_identifier(artist_cleaned, "artist"),
        )
        
        # Mark the artist as having a bad link and save the failed artists log
        failed_artists_log[artist_cleaned] = datetime.datetime.now()
        save_failed_artists()
        return

    # Reuse existing query pattern for fetching artist_id with improved error handling
    artist_id_query = "SELECT id FROM clubfindr.artists WHERE soundcloud_link = %s;"
    logging.info(
        "Querying artist_id for artist_url: %s",
        redact_identifier(artist_url, "url"),
    )

    try:
        artist_id_result = extract_event_id_from_database(artist_id_query, (artist_url,))
        artist_id = artist_id_result[0][0] if artist_id_result else None

        if not artist_id:
            logging.error(
                "Could not find artist ID for %s.",
                redact_identifier(artist_cleaned, "artist"),
            )
            return

        # Fetch event_ids associated with the artist
        event_ids = get_event_id_for_artist(artist_id)
        if not event_ids:
            logging.error(
                "No associated event IDs found for artist %s.",
                redact_identifier(artist_cleaned, "artist"),
            )
            return

        genre_set = set()

        try:
            tracks_info = get_tracks_info(access_token, user_id)
            api_call_count += 1  # Increment the API call count
            save_api_call_count()  # Save the updated count

            for track in tracks_info:
                track_id = track["id"]
                genres = get_track_data(access_token, track_id)
                api_call_count += 1  # Increment the API call count for each track data call
                save_api_call_count()  # Save the updated count

                if genres:
                    genres = genre_cleaner(genres)
                    if genres:
                        genres = list(
                            filter(None, [genre.strip() for genre in genres.split(", ")])
                        )
                        genre_set.update(genres)
                else:
                    logging.warning(
                        "No genres found for track %s.",
                        redact_identifier(track_id, "track"),
                    )
        except Exception as e:
            logging.error(
                "Error processing tracks for %s: %s",
                redact_identifier(artist_cleaned, "artist"),
                e,
            )
            import traceback
            logging.error(traceback.format_exc())
            return
        
        # Update the genres for both the artist and the associated events
        for event_id in event_ids:  # Update genres for all associated events
            update_database_new_genres(artist_cleaned, artist_url, list(genre_set), city_name, event_id)

        api_call_log[artist_cleaned] = datetime.datetime.now()
        # Convert datetime objects to ISO format strings for JSON serialization
        api_call_log_serializable = {
            name: timestamp.isoformat()
            for name, timestamp in api_call_log.items()
        }
        with open("api_call_log.json", "w") as f:
            json.dump(api_call_log_serializable, f, indent=2)

        time.sleep(DELAY_BETWEEN_CALLS)  # Throttle API calls

    except Exception as e:
        logging.error(
            "Unexpected error processing %s: %s",
            redact_identifier(artist_cleaned, "artist"),
            e,
        )
        import traceback
        logging.error(traceback.format_exc())



if __name__ == "__main__":
    # Set up argument parsing
    parser = argparse.ArgumentParser(
    description="Fetch SoundCloud data and update the database.")
    parser.add_argument("city_name", type=str, help="Name of the city")
    args = parser.parse_args()

    # Use the city_name argument in your script
    city_name = args.city_name
    artists_table_name = 'clubfindr.artists'
    events_table_name = 'clubfindr.events'
    client_id = os.environ.get("SC_CLIENT_ID")
    client_secret = os.environ.get("SC_CLIENT_SECRET")
    logging.info(f"Starting Soundcloud API call for {city_name}...")

    artist_dict = get_data_base_info(city_name)
    access_token, refresh_token, token_expiry = get_access_token(client_id, client_secret)
    api_call_log = {}

    if os.path.exists("api_call_log.json"):
        with open("api_call_log.json", "r") as f:
            api_call_log_raw = json.load(f)
            # Convert ISO format strings back to datetime objects
            api_call_log = {
                name: datetime.datetime.fromisoformat(timestamp)
                for name, timestamp in api_call_log_raw.items()
            }

    # Process artists in batches
    BATCH_SIZE = 50
    artist_items = list(artist_dict.items())
    artist_batches = [artist_items[i:i+BATCH_SIZE] for i in range(0, len(artist_items), BATCH_SIZE)]

    for batch_idx, batch in enumerate(artist_batches):
        logging.info(f"Processing SoundCloud artist batch {batch_idx+1}/{len(artist_batches)}")
        
        for artist, artist_urls in batch:
            artist_url = artist_urls[0]
            call_api(artist, artist_url, access_token, refresh_token, token_expiry, api_call_log, city_name, client_id, client_secret)
        
        # Force garbage collection between batches
        import gc
        gc.collect()
        logging.info(f"Completed processing batch of {len(batch)} SoundCloud artists")
        time.sleep(2)  # Slightly longer pause between SoundCloud batches

    logging.info(f"Finished Soundcloud API call for {city_name}.")
