import os
import time
import json
import requests
import datetime
import pickle
import logging
import argparse
import re
from dotenv import load_dotenv
from psycopg2 import sql
from utils import extract_from_database, commit_to_database


load_dotenv()
logging.basicConfig(
    level=logging.ERROR,
    filename="soundcloud_api.log",
    filemode="a",
    format="%(asctime)s - %(levelname)s - %(message)s",
)

fallback_logger = logging.getLogger("fallbackLogger")
fallback_handler = logging.FileHandler("soundcloud_fallback.log", mode="a")
fallback_handler.setLevel(logging.INFO)
fallback_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
fallback_handler.setFormatter(fallback_formatter)
fallback_logger.addHandler(fallback_handler)

MAX_API_CALLS = 15000
DELAY_BETWEEN_CALLS = 1  # 1 second delay between calls

# Initialize or load API call count from file
API_CALL_COUNT_FILE = "api_call_count.json"
if os.path.exists(API_CALL_COUNT_FILE):
    with open(API_CALL_COUNT_FILE, "r") as f:
        api_call_count_data = json.load(f)
        last_reset_time = datetime.datetime.fromisoformat(
            api_call_count_data["last_reset_time"]
        )
        api_call_count = api_call_count_data["api_call_count"]

        # Reset count if 24 hours have passed
        if datetime.datetime.now() - last_reset_time > datetime.timedelta(days=1):
            api_call_count = 0
            last_reset_time = datetime.datetime.now()
else:
    api_call_count = 0
    last_reset_time = datetime.datetime.now()


def save_api_call_count():
    with open(API_CALL_COUNT_FILE, "w") as f:
        json.dump(
            {
                "api_call_count": api_call_count,
                "last_reset_time": last_reset_time.isoformat(),
            },
            f,
        )


def has_been_called_recently(name):
    seven_days_ago = datetime.datetime.now() - datetime.timedelta(days=7)

    if name in api_call_log and api_call_log[name] > seven_days_ago:
        return True

    return False


def get_data_base_info(city_name):
    artists_names_query = f"""SELECT artist_name, soundcloud_link FROM artists_{city_name} WHERE soundcloud_link != 'None';"""
    links_dict = extract_from_database(artists_names_query)
    return links_dict


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


def get_user_id(access_token, artist_name, artist_url):
    username = artist_url.split("/")[-1]
    resolve_url = f"https://api.soundcloud.com/resolve?url=http://soundcloud.com/{username}&format=json"
    headers = {"Authorization": f"Bearer {access_token}"}

    try:
        response = requests.get(resolve_url, headers=headers)
        response.raise_for_status()
        user_info = response.json()
        user_id = user_info.get("id", None)
        if user_id:
            return user_id
        else:
            fallback_logger.info(
                f"Resolve failed: Artist={artist_name}, URL={artist_url}, Username={username}"
            )
    except requests.exceptions.RequestException as e:
        fallback_logger.warning(
            f"Request error during resolve: Artist={artist_name}, URL={artist_url}, Error={e}"
        )

    search_url = f"https://api.soundcloud.com/users?q={artist_name}"
    try:
        response = requests.get(search_url, headers=headers)
        response.raise_for_status()
        search_results = response.json()

        if (
            search_results
            and "collection" in search_results
            and search_results["collection"]
        ):
            best_match = search_results["collection"][0]
            correct_url = best_match.get("permalink_url", "")
            correct_username = best_match.get("username", "")
            fallback_logger.info(
                f"Fallback search: Artist={artist_name}, Original URL={artist_url}, "
                f"Corrected URL={correct_url}, Corrected Username={correct_username}"
            )
            return best_match.get("id", None)
        else:
            fallback_logger.warning(
                f"No search results found: Artist={artist_name}, Searched Username={username}"
            )

    except requests.exceptions.RequestException as e:
        fallback_logger.error(f"Search failed: Artist={artist_name}, Error={e}")

    return None


def get_tracks_info(access_token, user_id):
    tracks_url = f"https://api.soundcloud.com/users/{user_id}/tracks?format=json"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(tracks_url, headers=headers)
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


def update_database_new_genres(artist_name, soundcloud_link, genres, city_name):
    # Prepare the genres list for parameterized query
    genres = [genre.replace("'", "''") for genre in genres]

    # Create dynamic table names
    artists_table_name = sql.Identifier(f"artists_{city_name}")
    events_table_name = sql.Identifier(f"event_data_{city_name}")

    # Construct SQL queries using parameterized queries
    update_artists_genres_query = sql.SQL(
        """
        UPDATE {artists_table_name}
        SET genres = (
            SELECT array_agg(x) 
            FROM (
                SELECT DISTINCT unnest(array_cat(genres, {genres}::text[])) AS x
            ) a
        )
        WHERE soundcloud_link = {soundcloud_link};
    """
    ).format(
        artists_table_name=artists_table_name,
        genres=sql.Literal(genres),
        soundcloud_link=sql.Literal(soundcloud_link),
    )

    update_event_data_genres_query = sql.SQL(
        """
        UPDATE {events_table_name}
        SET event_genres = (
            SELECT array_agg(x)
            FROM (
                SELECT DISTINCT unnest(array_cat(event_genres, {genres}::text[])) AS x
            ) a
        )
        WHERE {artist_name} = ANY(artists);
    """
    ).format(
        events_table_name=events_table_name,
        genres=sql.Literal(genres),
        artist_name=sql.Literal(artist_name),
    )

    try:
        # Execute the queries with parameters
        commit_to_database(update_artists_genres_query)
        commit_to_database(update_event_data_genres_query)
    except Exception as e:
        logging.error(
            f"Failed to update database for artist {artist_name} with error: {e}"
        )


def genre_cleaner(s):
    if s is None:
        return None
    symbols = "-&/\\+"
    pattern = "[" + symbols + "]"
    result = re.sub(pattern, ",", s)
    result = re.sub(r",+", ",", result)
    result = result.strip(", ").lower()
    return result


def call_api(
    artist,
    artist_url,
    access_token,
    refresh_token,
    token_expiry,
    api_call_log,
    city_name,
    client_id,
    client_secret,
):
    global api_call_count
    artist_cleaned = artist.replace(",", " ")

    if has_been_called_recently(artist_cleaned):
        logging.info(f"Skipping API call for {artist_cleaned}, recently fetched.")
        return

    if api_call_count >= MAX_API_CALLS:
        logging.error(
            "Reached the maximum API call limit for the day. Stopping execution."
        )
        return

    if time.time() >= token_expiry:
        access_token, refresh_token, token_expiry = refresh_access_token(
            client_id, client_secret, refresh_token
        )

    user_id = get_user_id(access_token, artist_cleaned, artist_url)
    if not user_id:
        logging.error(f"Skipping artist {artist_cleaned} due to missing user ID.")
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
                genres = list(
                    filter(None, [genre.strip() for genre in genres.split(", ")])
                )
                genre_set.update(genres)
            else:
                logging.warning(f"No genres found for track {track_id}.")
    except Exception as e:
        logging.error(f"Error processing tracks for {artist_cleaned}: {e}")
        return

    update_database_new_genres(artist_cleaned, artist_url, list(genre_set), city_name)

    api_call_log[artist_cleaned] = datetime.datetime.now()
    with open("api_call_log.pkl", "wb") as f:
        pickle.dump(api_call_log, f)

    time.sleep(DELAY_BETWEEN_CALLS)  # Throttle API calls


if __name__ == "__main__":
    # Set up argument parsing
    parser = argparse.ArgumentParser(
        description="Fetch SoundCloud data and update the database."
    )
    parser.add_argument("city_name", type=str, help="Name of the city")
    args = parser.parse_args()

    # Use the city_name argument in your script
    city_name = args.city_name
    artists_table_name = f"artists_{city_name.lower()}"
    events_table_name = f"event_data_{city_name.lower()}"
    client_id = os.environ.get("SC_CLIENT_ID")
    client_secret = os.environ.get("SC_CLIENT_SECRET")
    logging.info(f"Starting Soundcloud API call for {city_name}...")

    artist_dict = get_data_base_info(city_name)
    access_token, refresh_token, token_expiry = get_access_token(
        client_id, client_secret
    )
    api_call_log = {}

    if os.path.exists("api_call_log.pkl"):
        with open("api_call_log.pkl", "rb") as f:
            api_call_log = pickle.load(f)

    for artist, artist_urls in artist_dict.items():
        artist_url = artist_urls[0]
        call_api(
            artist,
            artist_url,
            access_token,
            refresh_token,
            token_expiry,
            api_call_log,
            city_name,
            client_id,
            client_secret,
        )

    logging.info(f"Finished Soundcloud API call for {city_name}.")
