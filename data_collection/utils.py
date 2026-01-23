import re
from configparser import ConfigParser
import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2 import sql
from psycopg2 import pool as pg_pool
import pandas as pd
import logging
from sqlalchemy import create_engine
import os
import logging


def get_create_artists_table_query():

    create_artists_table = f"""
    CREATE TABLE clubfindr.artists (
    id UUID DEFAULT gen_random_uuid(),
    artist_name VARCHAR(150) UNIQUE NOT NULL,  -- Globally unique artist name
    spotify_uri VARCHAR(255),  -- URL lengths standardized
    soundcloud_link VARCHAR(255),  -- URL lengths standardized
    bandcamp_link VARCHAR(255),  -- URL lengths standardized
    facebook_link VARCHAR(255),  -- URL lengths standardized
    instagram_link VARCHAR(255),  -- URL lengths standardized
    ra_link VARCHAR(255),
    genres TEXT[],  -- Genre array to store artist's genres
    email TEXT UNIQUE,  -- Ensure globally unique email
    website TEXT,
    primary_city VARCHAR(100) NOT NULL,  -- City without partitioning
    PRIMARY KEY (id)
    );
    """
    return create_artists_table


def get_create_events_table_query():

    create_events_table = f"""
    CREATE TABLE clubfindr.events (
    id UUID DEFAULT gen_random_uuid(),
    club_id INT,  -- Optionally reference a `clubs` table for normalization
    event_name VARCHAR(256) NOT NULL,
    club_name VARCHAR(256),  -- Consider normalization
    club_address VARCHAR(300),  -- Consider normalization
    event_date DATE,
    start_time TIMESTAMP WITH TIME ZONE,  -- Consider using time zone
    end_time TIMESTAMP WITH TIME ZONE,  -- Consider using time zone
    event_genres TEXT[],  -- Array to store aggregated genres for the event
    popularity VARCHAR(6),
    price VARCHAR(30),
    event_image VARCHAR(256),
    city VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
    );
    """
    return create_events_table


def update_events_table_genres_query():
    update_events_table_genres = """
    UPDATE clubfindr.events
    SET event_genres = subquery2.event_genres
    FROM (
      SELECT event_name, array_agg(genre) AS event_genres
      FROM (
        SELECT event_name, unnest(unique_genres) AS genre
        FROM (
          SELECT event_name, array_agg(distinct genre) AS unique_genres
          FROM clubfindr.events, unnest(event_genres) AS genre
          GROUP BY event_name
        ) AS subquery
      ) AS subquery2
      GROUP BY event_name
    ) AS subquery2
    WHERE clubfindr.events.event_name = subquery2.event_name;
    """
    return update_events_table_genres


def update_primary_keys():
    # Define the tables and the new primary keys
    tables_to_update = {
        "event_data_{}": ("event_id", "event_date"),
        # Add more tables here if needed
    }

    # Fetch all the table names in the database
    fetch_tables_query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public';
    """

    tables = execute_query(fetch_tables_query, fetch=True)

    for table_template, primary_keys in tables_to_update.items():
        for table in tables:
            table_name = table[0]
            if table_name.startswith(table_template.split("_{}")[0]):
                # Drop the existing primary key constraint
                drop_constraint_query = sql.SQL(
                    """
                    ALTER TABLE {} DROP CONSTRAINT IF EXISTS {}_pkey;
                """
                ).format(sql.Identifier(table_name), sql.Identifier(table_name))
                try:
                    commit_to_database(drop_constraint_query)
                    print(f"Primary key constraint dropped for table {table_name}")
                except Exception as e:
                    print(f"Failed to drop primary key for table {table_name}: {e}")

                # Add the new primary key constraint
                add_primary_key_query = sql.SQL(
                    """
                    ALTER TABLE {} ADD PRIMARY KEY ({}, {});
                """
                ).format(
                    sql.Identifier(table_name),
                    sql.Identifier(primary_keys[0]),
                    sql.Identifier(primary_keys[1]),
                )
                try:
                    commit_to_database(add_primary_key_query)
                    print(f"Primary key updated for table {table_name}")
                except Exception as e:
                    print(f"Failed to update primary key for table {table_name}: {e}")

    print("Primary key updates completed.")


##############################################################################################
############################## DATABASE CONNECTION FUNCTIONS #################################


def config(
    filename="/home/nathan/clubfinder/data_collection/database.ini",
    section="postgresql",
):
    """Takes secret login info from database.ini to connect to PostgreSQL."""
    parser = ConfigParser()
    parser.read(filename)

    if not parser.read(filename):
        raise FileNotFoundError(f"Could not find file: {filename}")

    if parser.has_section(section):
        logging.debug(f"Configuration section '{section}' found.")
        return {param[0]: param[1] for param in parser.items(section)}
    else:
        raise Exception(f"Section {section} not found in the {filename} file")


_DB_POOL = None
_DB_POOL_CONFIG = None


def _get_db_pool():
    global _DB_POOL, _DB_POOL_CONFIG

    if os.getenv("DB_POOL_DISABLE") == "1":
        return None

    params = config()
    config_key = tuple(sorted(params.items()))
    if _DB_POOL is None or _DB_POOL_CONFIG != config_key:
        minconn = int(os.getenv("DB_POOL_MINCONN", "1"))
        maxconn = int(os.getenv("DB_POOL_MAXCONN", "5"))
        if maxconn < minconn:
            maxconn = minconn
        _DB_POOL = pg_pool.ThreadedConnectionPool(minconn, maxconn, **params)
        _DB_POOL_CONFIG = config_key

    return _DB_POOL


def get_connection():
    db_pool = _get_db_pool()
    if db_pool:
        return db_pool.getconn()
    return psycopg2.connect(**config())


def release_connection(conn):
    if conn is None:
        return

    if _DB_POOL and os.getenv("DB_POOL_DISABLE") != "1":
        try:
            _DB_POOL.putconn(conn)
            return
        except Exception:
            pass

    conn.close()


def execute_query(query, params=None, fetch=False, autocommit=True):
    """Execute a SQL query and optionally fetch results."""
    conn = None
    result = None

    try:
        # Establish connection (pooled if available)
        conn = get_connection()

        with conn.cursor() as cur:
            cur.execute(query, params)

            if fetch:
                result = cur.fetchall()  # Fetch the result if required
            elif autocommit:
                conn.commit()  # Commit only if autocommit is True

    except (Exception, psycopg2.DatabaseError) as error:
        error_message = str(error)

        # Check if it's a duplicate key error and suppress logging if expected
        if "duplicate key value violates unique constraint" in error_message:
            pass  # Suppress logging for duplicate key errors
        else:
            logging.error("Error executing query: %s", error)

        if conn is not None:
            conn.rollback()  # Rollback in case of error

    finally:
        if conn is not None:
            release_connection(conn)  # Return to pool or close

    return result


def commit_to_database(query, params=None):
    """Commit changes to the database."""

    execute_query(query, params=params)


def execute_query2(query, params=None, fetch=False, return_results=False):
    """Execute a SQL query, optionally commit and return results."""
    conn = None
    result = None

    try:
        # Establish connection (pooled if available)
        conn = get_connection()

        with conn.cursor() as cur:
            # Execute the query with optional parameters
            cur.execute(query, params)

            # Fetch the result if requested
            if fetch:
                result = cur.fetchall()
            elif return_results:
                result = (
                    cur.fetchone()
                )  # Fetch one row; use fetch=True for multiple rows

            # Commit the transaction (useful for INSERT, UPDATE, DELETE)
            conn.commit()

        logging.info("Query executed successfully: %s", query)

    except (Exception, psycopg2.DatabaseError) as error:
        error_message = str(error)

        # Check if it's a duplicate key error and suppress logging if expected
        if "duplicate key value violates unique constraint" in error_message:
            pass  # Suppress logging for duplicate key errors
        else:
            logging.error("Error executing query: %s", error)

        if conn is not None:
            conn.rollback()  # Rollback in case of error

    finally:
        if conn is not None:
            release_connection(conn)  # Return to pool or close

    return result


def commit_genres_to_dataBase(query, params=None):
    """Commit changes to the database related to genres."""
    execute_query(query, params=params)


def call_club_data(query, params=None):
    """Fetch data from the database."""
    return execute_query(query, params=params, fetch=True)


def extract_from_database(query, params=None):
    """Extract data from the database and format it."""
    conn = None
    artdict = {}

    try:
        # Establish connection (pooled if available)
        conn = get_connection()
        # Create a cursor
        cur = conn.cursor()
        # Execute the query with optional parameters
        cur.execute(query, params)  # Pass the params to the query

        result = cur.fetchall()

        # Check if result has tuples with the expected structure
        if not result:
            logging.error("No data returned from query.")
            return {}

        # Process results
        for i in result:
            if len(i) < 2:
                logging.error(f"Unexpected tuple structure: {i}")
                continue
            # Ensure the second element is not None and is a string
            if i[1] is not None and isinstance(i[1], str):
                x = i[1].split(",")
                artdict[i[0]] = x
            else:
                logging.error(f"Unexpected format for genres: {i[1]}")

        conn.commit()
        cur.close()

    except (Exception, psycopg2.DatabaseError) as error:
        logging.error("Error in database operation: %s", error)

    finally:
        if conn is not None:
            release_connection(conn)

    return artdict


def extract_event_id_from_database(query, params=None):
    """Extract data from the database and return the result as a list of tuples or IDs."""
    conn = None
    result = []

    try:
        # Establish connection (pooled if available)
        conn = get_connection()

        # Create a cursor
        cur = conn.cursor()

        # Execute the query with optional parameters
        cur.execute(query, params)

        # Fetch all results
        result = cur.fetchall()

        # Check if result is empty
        if not result:
            logging.warning("No data returned from query.")
            return []

        # Commit and close the cursor
        conn.commit()
        cur.close()

    except (Exception, psycopg2.DatabaseError) as error:
        logging.error(f"Error in database operation: {error}")

    finally:
        if conn is not None:
            release_connection(conn)

    # Return the raw result set (can be a list of tuples or a single list, depending on the query)
    return result


def extract_from_database_spotify(query, params=None):
    """Extract data from the database and format it."""
    conn = None
    artist_dict = {}

    try:
        # Establish connection (pooled if available)
        conn = get_connection()
        # Create a cursor
        cur = conn.cursor()
        # Execute the query with parameters
        cur.execute(query, params)
        result = cur.fetchall()

        # Check if result has tuples with the expected structure
        if not result:
            logging.info("No data returned from query.")
            return {}

        # Process results
        for i in result:
            if len(i) < 3:
                logging.error(f"Unexpected tuple structure: {i}")
                continue

            artist_id, artist_name, spotify_uri = i

            # Debug: Log the artist_id to ensure it's valid
            logging.debug(
                f"Fetched artist_id: {artist_id}, artist_name: {artist_name}, spotify_uri: {spotify_uri}"
            )

            # Ensure artist_id is a non-empty valid UUID
            if not artist_id:
                logging.error(f"Invalid artist_id: {artist_id}. Skipping this entry.")
                continue

            # Ensure artist_name is a non-empty string
            if artist_name is not None and isinstance(artist_name, str):
                artist_name_list = artist_name.split(",")
                artist_dict[artist_id] = (artist_name_list, spotify_uri)
            else:
                logging.error(f"Unexpected format for artist_name: {artist_name}")

        conn.commit()
        cur.close()

    except (Exception, psycopg2.DatabaseError) as error:
        logging.error(f"Error in database operation: {error}")

    finally:
        if conn is not None:
            release_connection(conn)

    return artist_dict


_GENRE_CACHE = {}


def load_genres_from_csv(file_path, use_cache=True):
    """Loads genres from a CSV file into a set for fast lookup."""
    if use_cache and file_path in _GENRE_CACHE:
        return _GENRE_CACHE[file_path]

    genres = set()
    try:
        with open(file_path, mode="r") as csv_file:
            reader = csv.reader(csv_file)
            for row in reader:
                if len(row) > 1:  # Ensure the row has at least two columns
                    genre = (
                        row[1].strip().lower()
                    )  # Use the second column for genre names
                    genres.add(genre)
    except FileNotFoundError:
        logging.error(f"CSV file not found: {file_path}")
    except Exception as e:
        logging.error(f"Error loading genres from CSV: {e}")

    logging.info(f"Loaded {len(genres)} genres from {file_path}")
    if use_cache:
        _GENRE_CACHE[file_path] = genres
    return genres


def extract_array_from_database(query, params=None):
    """Connect to the PostgreSQL database server to allow for artist names to be inputed to
    spotify api search"""
    conn = None
    artdict = {}

    try:
        # Establish connection (pooled if available)
        conn = get_connection()
        # create a cursor
        cur = conn.cursor()
        # execute a statement
        cur.execute(query, params)
        result = cur.fetchall()

        conn.commit()
        cur.close()

    except (Exception, psycopg2.DatabaseError) as error:
        logging.error(error)

    finally:
        if conn is not None:
            release_connection(conn)

    # Convert the array strings to actual lists
    artdict = [
        (
            item[0],
            (
                item[1][1:-1].split(",")
                if len(item) > 1 and isinstance(item[1], str)
                else item[1]
            ),
            (
                item[2][1:-1].split(",")
                if len(item) > 2 and isinstance(item[2], str)
                else item[2]
            ),
        )
        for item in result
        if len(item) > 1
    ]

    return artdict


def extract_genres_from_database(query):
    """Connect to the PostgreSQL database server to allow for artist names to be inputted to Spotify API search."""
    conn = None
    result = None  # Initialize result here
    artdict = {}

    try:
        # Establish connection (pooled if available)
        conn = get_connection()
        # Create a cursor
        cur = conn.cursor()
        # Execute the query
        cur.execute(query)
        result = cur.fetchall()  # Fetch the result

        conn.commit()
        cur.close()

    except (Exception, psycopg2.DatabaseError) as error:
        logging.error(f"Database error: {error}")
        # Ensure the result is assigned an empty list in case of failure
        result = []

    finally:
        if conn is not None:
            release_connection(conn)

    # Ensure result is not None before processing it
    artdict = [
        (item[0], item[1].split(",") if isinstance(item[1], str) else item[1])
        for item in result
    ]

    return artdict


def split_and_clean_genres(genres, valid_genres):
    """Splits and cleans genres based on valid genres."""
    if not genres:
        return []

    # Convert valid_genres to set for O(1) lookup and normalize to lowercase
    valid_genres_set = {genre.strip().lower() for genre in valid_genres if genre}

    # Handle list or string input
    if isinstance(genres, list):
        genre_list = genres
    else:
        # Split on common delimiters and handle edge cases
        genre_list = re.split(r"\s*[,|/]\s*", str(genres))

    cleaned_genres = set()  # Use set to automatically deduplicate

    for genre in genre_list:
        if not genre or genre.lower() == "none":
            continue

        # Normalize the genre
        normalized = genre.strip().lower()

        # Remove quotes and special characters
        normalized = re.sub(r'["\']', "", normalized)
        normalized = re.sub(r"[^\w\s-]", " ", normalized)

        # Prefer exact matches before fuzzy compound matching.
        if normalized in valid_genres_set:
            cleaned_genres.add(normalized)
            continue

        # Handle compound genres (e.g., "TechHouse" -> "Tech House")
        normalized_compact = re.sub(r"[\s-]+", "", normalized)
        compound_matches = []
        for valid_genre in valid_genres_set:
            valid_compact = re.sub(r"[\s-]+", "", valid_genre)
            if not valid_compact:
                continue
            if (
                valid_compact in normalized_compact
                or normalized_compact in valid_compact
            ):
                compound_matches.append(valid_genre)

        if compound_matches:
            # Sort by length descending to prefer longer matches
            compound_matches.sort(key=len, reverse=True)
            cleaned_genres.add(compound_matches[0])

    return list(cleaned_genres)


def filter_genres(genres, valid_genres):
    """
    Filters out genres that are not in the list of valid genres.

    Parameters:
        genres (list): The list of genres to filter.
        valid_genres (list): The list of valid genres to compare against.

    Returns:
        list: A list of genres that are in the valid genres list.
    """
    valid_genre_set = {genre.lower() for genre in valid_genres}
    return [
        genre.lower() for genre in genres if genre and genre.lower() in valid_genre_set
    ]


import csv


def clean_and_replace_genres(genre_csv_path):
    # Load genres from CSV
    genres_list = load_genres_from_csv(genre_csv_path)

    if not genres_list:
        logging.error("Failed to load genres from the CSV file")
        return

    # Correctly format the table name using an f-string
    get_genres_query = f"SELECT artist_name, genres FROM clubfindr.artists"
    result = extract_genres_from_database(get_genres_query)

    if not result:
        logging.error("Failed to retrieve genres from the database")
        return

    # Clean and map the genres
    artist_genres_dict = {name_cleaner(item[0]): item[1] for item in result if item[1]}

    if not artist_genres_dict:
        logging.info("No valid genres found for artists in the database.")
        return

    for artist_name, existing_genres in artist_genres_dict.items():
        logging.info(f"Original genres for artist {artist_name}: {existing_genres}")

        # Clean and filter genres
        cleaned_genres = split_and_clean_genres(existing_genres, genres_list)

        if cleaned_genres:
            formatted_genres = "{" + ",".join(cleaned_genres) + "}"
            logging.info(
                f"Cleaned and formatted genres for artist {artist_name}: {formatted_genres}"
            )

            # Format the replace query correctly
            replace_genres_query = (
                f"UPDATE clubfindr.artists SET genres = %s WHERE artist_name = %s"
            )
            try:
                commit_to_database(
                    replace_genres_query, (formatted_genres, artist_name)
                )
                logging.info(f"Genres updated in database for artist {artist_name}")
            except Exception as e:
                logging.error(f"Failed to update genres for artist {artist_name}: {e}")
        else:
            logging.info(
                f"No valid genres found for artist {artist_name}. No update performed."
            )


def update_event_genres():
    get_events_query = (
        f"""SELECT event_name, artists, event_genres FROM clubfindr.events"""
    )
    events = extract_array_from_database(get_events_query)

    for event_name, artists_data, current_genres in events:
        logging.info(f"Original genres for event {event_name}: {current_genres}")

        # Clean artist names and split appropriately
        artists = [
            name_cleaner(artist.strip())
            for artist in (
                artists_data[0].split(",")
                if isinstance(artists_data, list) and len(artists_data) == 1
                else artists_data[1:-1].split(",")
            )
        ]
        existing_genres = set(current_genres)

        for artist in artists:
            get_artist_genres_query = (
                """SELECT genres FROM clubfindr.artists WHERE artist_name = %s """
            )
            artist_genres = call_club_data(get_artist_genres_query, (artist,))

            if artist_genres:
                genres_list = (
                    artist_genres[0][0]
                    if artist_genres
                    and artist_genres[0]
                    and isinstance(artist_genres[0][0], list)
                    else artist_genres[0]
                )
                if genres_list:
                    existing_genres.update(
                        [name_cleaner(genre.lower()) for genre in genres_list if genre]
                    )

        existing_genres.discard("")
        existing_genres = {
            name_cleaner(genre.lower()).replace('"', "") for genre in existing_genres
        }

        logging.info(
            f"Final genres for event {event_name} after update: {existing_genres}"
        )

        update_event_data_genres_query = (
            f"""UPDATE clubfindr.events SET event_genres = %s WHERE event_name = %s;"""
        )
        try:
            commit_to_database(
                update_event_data_genres_query, (list(existing_genres), event_name)
            )
            logging.info(f"Event genres updated in database for event {event_name}")
        except Exception as e:
            logging.error(f"Failed to update event genres for event {event_name}: {e}")


def backup_table(table_name, backup_name):
    """Create a backup of a table."""
    backup_query = f"""CREATE TABLE {backup_name} AS TABLE {table_name};"""
    commit_to_database(backup_query)


def create_array_check_function():
    create_function_query = """
    CREATE OR REPLACE FUNCTION array_is_empty_or_null(anyarray)
    RETURNS BOOLEAN AS $$
    DECLARE
        arr ALIAS FOR $1;
        result BOOLEAN := TRUE;
    BEGIN
        FOR i IN array_lower(arr, 1)..array_upper(arr, 1) LOOP
            IF arr[i] IS NOT NULL AND TRIM(arr[i]) <> '' THEN
                result := FALSE;
                EXIT;
            END IF;
        END LOOP;
        RETURN result;
    END;
    $$ LANGUAGE plpgsql;
    """
    commit_to_database(create_function_query)


def remove_no_data_events():
    remove_no_data_events_query = f"""
    DELETE FROM clubfindr.events
    WHERE array_is_empty_or_null(artists)
    AND array_is_empty_or_null(event_genres);
    """
    commit_to_database(remove_no_data_events_query)


def remove_no_genre_data_events():
    remove_no_genre_data_events_query = f"""
    DELETE FROM clubfindr.events
    WHERE event_genres IS NULL OR cardinality(event_genres) = 0;
    """
    commit_to_database(remove_no_genre_data_events_query)


def extract_for_models(query):
    """Extract data for modeling."""
    conn = None
    try:
        logging.info("Connecting to the PostgreSQL database...")
        conn = get_connection()
        df = pd.read_sql_query(query, conn)
        df["event_genres"] = df["event_genres"].apply(
            lambda x: ", ".join(x) if isinstance(x, list) else x
        )
    except (Exception, psycopg2.DatabaseError) as error:
        logging.error(error)
    finally:
        if conn is not None:
            release_connection(conn)
            logging.info("Database connection closed.")
    return df


def get_all_genres():
    """Retrieves all valid genres from the Musicalyst website."""
    url = "https://musicalyst.com/genres"
    response = requests.get(url)
    genre_html = response.text
    soup = BeautifulSoup(genre_html, "html.parser")
    genres = [genre.text.lower() for genre in soup.find_all("li")]
    return genres


def name_cleaner(name):
    """Cleans unwanted words and symbols from names scraped."""
    if name is None or name == "None":
        return ""

    # Convert to string and lowercase
    name = str(name).lower().strip()

    # Remove common noise words
    noise_words = r"\b(room|tba|friends|opening|closing|residents?|none)\b"
    name = re.sub(noise_words, "", name, flags=re.IGNORECASE)

    # Clean special characters while preserving meaningful spaces
    name = re.sub(
        r"\n|\xa0|\t", " ", name
    )  # Convert newlines and special spaces to space
    name = re.sub(r"\(.*?\)", " ", name)  # Remove parenthetical content
    name = re.sub(r"&|[\/]{2}", " ", name)  # Convert & and // to space
    name = re.sub(r'[\[\]\'\'_"]', "", name)  # Remove brackets, quotes, underscores
    name = re.sub(r"\b(b2b|B2B)\b", "", name)  # Remove b2b
    name = re.sub(r"\b\d{2}\b", "", name)  # Remove 2-digit numbers

    # Clean up whitespace
    name = re.sub(r"\s+", " ", name)  # Collapse multiple spaces
    name = re.sub(
        r"^[,\s]+|[,\s]+$", "", name
    )  # Remove leading/trailing commas and spaces

    return name.strip()


def collect_genres_for_event(event_id):
    """
    Collects genres for all artists associated with the event
    and returns a consolidated list of genres.
    """
    try:
        # Fetch artists associated with the event from the 'event_artists' table
        query = """
        SELECT a.id, a.genres 
        FROM clubfindr.artists a
        JOIN clubfindr.event_artists ea ON a.id = ea.artist_id
        WHERE ea.event_id = %s;
        """
        artist_genres = execute_query(query, params=(event_id,), fetch=True)

        if not artist_genres:
            # Log a warning and return an empty list if no artists are found
            logging.warning(f"No artists found for event {event_id}.")
            return []

        # Create a set to store unique genres across all artists for the event
        genre_set = set()

        for artist in artist_genres:
            genres = artist[1]  # Assuming the second item in the result tuple is genres
            if genres:  # Ensure genres is not None or empty
                # Ensure each genre is valid (not None and not 'None')
                valid_genres = {
                    genre.lower()
                    for genre in genres
                    if genre and genre.lower() != "none"
                }
                genre_set.update(valid_genres)

        return list(genre_set)  # Convert set back to list

    except Exception as e:
        # Log the error and return an empty list to prevent crashing
        logging.error(f"Error collecting genres for event {event_id}: {e}")
        return []


def update_event_genres_id(event_id, genres):
    """
    Updates the event with a consolidated list of genres.
    """
    try:
        # Join the genres into a string or store as a list if using JSONB
        query = """
        UPDATE clubfindr.events
        SET event_genres = %s
        WHERE event_id = %s;
        """
        commit_to_database(query, params=(genres, event_id))
        logging.info(f"Successfully updated genres for event {event_id}.")

    except Exception as e:
        # Log the error if updating the event fails
        logging.error(f"Error updating genres for event {event_id}: {e}")
