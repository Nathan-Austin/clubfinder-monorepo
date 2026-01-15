import re
from configparser import ConfigParser
import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2 import sql
import pandas as pd
import logging
from sqlalchemy import create_engine
import os
import logging

def get_create_artists_table_query(city_name):
    table_name = f"artists_{city_name.lower().replace(' ', '_')}"
    create_artists_table = f"""
    CREATE TABLE IF NOT EXISTS {table_name} (
    artist_id SERIAL,
    artist_name VARCHAR(150) PRIMARY KEY,
    spotify_uri VARCHAR(70),
    soundcloud_link VARCHAR(200),
    bandcamp_link VARCHAR(200),
    facebook_link VARCHAR(200),
    instagram_link VARCHAR(200),
    other_link VARCHAR(200),
    ra_link VARCHAR(255),
    genres TEXT[],
    email TEXT UNIQUE,
    website TEXT
    );
    """
    return create_artists_table


def get_create_events_table_query(city_name):
    table_name = f"event_data_{city_name.lower().replace(' ', '_')}"
    create_events_table = f"""
    CREATE TABLE IF NOT EXISTS {table_name} (
    event_id NUMERIC,
    event_name VARCHAR(256),
    club_name VARCHAR(256),
    club_address VARCHAR(300),
    event_date DATE,
    start_time TIME,
    end_time TIME,
    artists TEXT[],
    popularity VARCHAR(6),
    price VARCHAR(30),
    event_genres TEXT[],
    event_image VARCHAR(256),
    PRIMARY KEY (event_id, event_date)
    );
    """
    return create_events_table


def update_events_table_genres_query(city_name):
    table_name = f"event_data_{city_name.lower().replace(' ', '_')}"
    update_events_table_genres = f"""
    UPDATE {table_name}
    SET event_genres = subquery2.event_genres
    FROM (
      SELECT event_name, array_agg(genre) AS event_genres
      FROM (
        SELECT event_name, unnest(unique_genres) AS genre
        FROM (
          SELECT event_name, array_agg(distinct genre) AS unique_genres
          FROM {table_name}, unnest(event_genres) AS genre
          GROUP BY event_name, genre
        ) AS subquery
        GROUP BY event_name, unique_genres
      ) AS subquery2
      GROUP BY event_name
    ) AS subquery2
    WHERE {table_name}.event_name = subquery2.event_name;
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
            if table_name.startswith(table_template.split('_{}')[0]):
                # Drop the existing primary key constraint
                drop_constraint_query = sql.SQL("""
                    ALTER TABLE {} DROP CONSTRAINT IF EXISTS {}_pkey;
                """).format(
                    sql.Identifier(table_name),
                    sql.Identifier(table_name)
                )
                try:
                    commit_to_database(drop_constraint_query)
                    print(f"Primary key constraint dropped for table {table_name}")
                except Exception as e:
                    print(f"Failed to drop primary key for table {table_name}: {e}")

                # Add the new primary key constraint
                add_primary_key_query = sql.SQL("""
                    ALTER TABLE {} ADD PRIMARY KEY ({}, {});
                """).format(
                    sql.Identifier(table_name),
                    sql.Identifier(primary_keys[0]),
                    sql.Identifier(primary_keys[1])
                )
                try:
                    commit_to_database(add_primary_key_query)
                    print(f"Primary key updated for table {table_name}")
                except Exception as e:
                    print(f"Failed to update primary key for table {table_name}: {e}")

    print("Primary key updates completed.")

##############################################################################################
############################## DATABASE CONNECTION FUNCTIONS #################################

def config(filename='/home/nathan/clubfinder/data_collection/database.ini', section='postgresql'):
    """Takes secret login info from database.ini to connect to PostgreSQL."""
    parser = ConfigParser()
    parser.read(filename)
    
    if not parser.read(filename):
        raise FileNotFoundError(f"Could not find file: {filename}")
    
    if parser.has_section(section):
        logging.info(f"Configuration section '{section}' found.")
        return {param[0]: param[1] for param in parser.items(section)}
    else:
        raise Exception(f'Section {section} not found in the {filename} file')


def execute_query(query, params=None, fetch=False):
    """Execute a SQL query and optionally fetch results."""
    conn = None
    result = None
    
    try:
        params_config = config()
        
        conn = psycopg2.connect(**params_config)
        
        with conn.cursor() as cur:
            cur.execute(query, params)
            if fetch:
                result = cur.fetchall()
            else:
                conn.commit()
    except (Exception, psycopg2.DatabaseError) as error:
        logging.error("Error executing query: %s", error)
    finally:
        if conn is not None:
            conn.close()
            
    
    return result

def commit_to_database(query, params=None):
    """Commit changes to the database."""
    
    execute_query(query, params=params)

def commit_genres_to_dataBase(query, params=None):
    """Commit changes to the database related to genres."""
    execute_query(query, params=params)


def call_club_data(query, params=None):
    """Fetch data from the database."""
    return execute_query(query, params=params, fetch=True)

def extract_from_database(query):
    """Extract data from the database and format it."""
    conn = None
    artdict = {}
    
    try:
        # Read connection parameters
        params = config()
        

        conn = psycopg2.connect(**params)
        # Create a cursor
        cur = conn.cursor()
        # Execute the query
        cur.execute(query)
        result = cur.fetchall()
        
        # Check if result has tuples with the expected structure
        if not result:
            logging.error("No data returned from query.")
            return {}

        #logging.info(f"Raw query result: {result}")

        # Process results
        for i in result:
            if len(i) < 2:
                logging.error(f"Unexpected tuple structure: {i}")
                continue
            # Ensure the second element is not None and is a string
            if i[1] is not None and isinstance(i[1], str):
                x = i[1].split(',')
                artdict[i[0]] = x
            else:
                logging.error(f"Unexpected format for genres: {i[1]}")

        conn.commit()
        cur.close()

    except (Exception, psycopg2.DatabaseError) as error:
        logging.error("Error in database operation: %s", error)
    
    finally:
        if conn is not None:
            conn.close()
            
    
    return artdict

def extract_from_database_spotify(query):
    """Extract data from the database and format it."""
    conn = None
    artdict = {}
    
    try:
        # Read connection parameters
        params = config()
        
        conn = psycopg2.connect(**params)
        # Create a cursor
        cur = conn.cursor()
        # Execute the query
        cur.execute(query)
        result = cur.fetchall()
        
        # Check if result has tuples with the expected structure
        if not result:
            logging.error("No data returned from query.")
            return {}

        # Process results
        for i in result:
            if len(i) < 3:
                logging.error(f"Unexpected tuple structure: {i}")
                continue
            artist_id, artist_name, spotify_uri = i
            # Ensure the second element is not None and is a string
            if artist_name is not None and isinstance(artist_name, str):
                artist_name_list = artist_name.split(',')
                artdict[artist_id] = (artist_name_list, spotify_uri)
                #logging.info(f"database query output: {artdict}")
            else:
                logging.error(f"Unexpected format for artist_name: {artist_name}")

        conn.commit()
        cur.close()

    except (Exception, psycopg2.DatabaseError) as error:
        logging.error("Error in database operation: %s", error)
    
    finally:
        if conn is not None:
            conn.close()
    
    return artdict



def extract_genres_from_database(query):
    """ Connect to the PostgreSQL database server to allow for artist names to be inputed to
    spotify api search"""
    conn = None

    artdict = {}
    
    try:
        # read connection parameters
        params = config()
        # connect to the PostgreSQL server
        

        conn = psycopg2.connect(**params)
        # create a cursor
        cur = conn.cursor()
        # execute a statement
        cur.execute(query)
        result = cur.fetchall()
        
        conn.commit()
        cur.close()



    except (Exception, psycopg2.DatabaseError) as error:
        logging.error(error)
        # close the communication with the PostgreSQL


    finally:
        if conn is not None:
            conn.close()
            
    
    artdict = [(item[0], item[1].split(',') if isinstance(item[1], str) else item[1]) for item in result]

    return artdict


def extract_array_from_database(query, params=None):
    """ Connect to the PostgreSQL database server to allow for artist names to be inputed to
    spotify api search"""
    conn = None
    artdict = {}
    
    try:
        # read connection parameters
        params_config = config()
        # connect to the PostgreSQL server
        

        conn = psycopg2.connect(**params_config)
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
            conn.close()
            
    
    # Convert the array strings to actual lists
    artdict = [(item[0], item[1][1:-1].split(',') if len(item) > 1 and isinstance(item[1], str) else item[1], item[2][1:-1].split(',') if len(item) > 2 and isinstance(item[2], str) else item[2]) for item in result if len(item) > 1]

    return artdict


def split_and_clean_genres(genres, valid_genres):
    """Splits and cleans genres based on valid genres."""
    # If genres is a list, join it into a single string separated by commas
    if isinstance(genres, list):
        genres = ', '.join(genres)
    
    # Convert the genres string to lowercase
    genres = genres.lower()
    
    # Sort valid genres by length in descending order to prioritize compound genres
    valid_genres_sorted = sorted(valid_genres, key=len, reverse=True)
    
    genres_split = []
    
    for genre in re.split(r'\s*[,|/]\s*', genres):
        genre = genre.strip()
        if not genre:
            continue
        matched = False
        for valid_genre in valid_genres_sorted:
            if valid_genre in genre:
                genres_split.append(valid_genre)
                matched = True
                break
        if not matched:
            # If no valid genre match found, split by spaces as a fallback
            genres_split.extend(genre.split())

    # Clean each genre
    cleaned_genres = [name_cleaner(genre) for genre in genres_split if genre]

    return cleaned_genres

def filter_genres(genres, valid_genres):
    """
    Filters out genres that are not in the list of valid genres.

    Parameters:
        genres (list): The list of genres to filter.
        valid_genres (list): The list of valid genres to compare against.

    Returns:
        list: A list of genres that are in the valid genres list.
    """
    valid_genre_set = set(valid_genres)
    filtered_genres = [genre for genre in genres if genre in valid_genre_set]
    return filtered_genres

import csv

def load_genres_from_csv(file_path):
    """Loads genres from a CSV file into a set for fast lookup."""
    genres = set()
    try:
        with open(file_path, mode='r') as csv_file:
            reader = csv.reader(csv_file)
            for row in reader:
                if len(row) > 1:  # Ensure the row has at least two columns
                    genre = row[1].strip().lower()  # Use the second column for genre names
                    genres.add(genre)
    except FileNotFoundError:
        logging.error(f"CSV file not found: {file_path}")
    except Exception as e:
        logging.error(f"Error loading genres from CSV: {e}")
    
    logging.info(f"Loaded {len(genres)} genres from {file_path}")
    return genres


def clean_and_replace_genres(name, genre_csv_path):
    # Load genres from CSV
    genres_list = load_genres_from_csv(genre_csv_path)
    
    if not genres_list:
        logging.error("Failed to load genres from the CSV file")
        return

    # Correctly format the table name using an f-string
    get_genres_query = f"SELECT artist_name, genres FROM artists_{name}"
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
            formatted_genres = '{' + ','.join(cleaned_genres) + '}'
            logging.info(f"Cleaned and formatted genres for artist {artist_name}: {formatted_genres}")
            
            # Format the replace query correctly
            replace_genres_query = f"UPDATE artists_{name} SET genres = %s WHERE artist_name = %s"
            try:
                commit_to_database(replace_genres_query, (formatted_genres, artist_name))
                logging.info(f"Genres updated in database for artist {artist_name}")
            except Exception as e:
                logging.error(f"Failed to update genres for artist {artist_name}: {e}")
        else:
            logging.info(f"No valid genres found for artist {artist_name}. No update performed.")


def update_event_genres(city_name):
    get_events_query = f"""SELECT event_name, artists, event_genres FROM event_data_{city_name.lower().replace(' ', '_')}"""
    events = extract_array_from_database(get_events_query)

    for event_name, artists_data, current_genres in events:
        logging.info(f"Original genres for event {event_name}: {current_genres}")

        # Clean artist names and split appropriately
        artists = [name_cleaner(artist.strip()) for artist in (artists_data[0].split(',') if isinstance(artists_data, list) and len(artists_data) == 1 else artists_data[1:-1].split(','))]
        existing_genres = set(current_genres)

        for artist in artists:
            get_artist_genres_query = """SELECT genres FROM artists WHERE artist_name = %s """  
            artist_genres = call_club_data(get_artist_genres_query, (artist,))
            
            if artist_genres:
                genres_list = artist_genres[0][0] if artist_genres and artist_genres[0] and isinstance(artist_genres[0][0], list) else artist_genres[0]
                if genres_list:
                    existing_genres.update([name_cleaner(genre.lower()) for genre in genres_list if genre])

        existing_genres.discard('')
        existing_genres = {name_cleaner(genre.lower()).replace('"', '') for genre in existing_genres}
        
        logging.info(f"Final genres for event {event_name} after update: {existing_genres}")

        update_event_data_genres_query = f"""UPDATE event_data_{city_name.lower().replace(' ', '_')} SET event_genres = %s WHERE event_name = %s;"""
        try:
            commit_to_database(update_event_data_genres_query, (list(existing_genres), event_name))
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

def remove_no_data_events(city_name):
    remove_no_data_events_query = f"""
    DELETE FROM event_data_{city_name.lower().replace(' ', '_')}
    WHERE array_is_empty_or_null(artists)
    AND array_is_empty_or_null(event_genres);
    """
    commit_to_database(remove_no_data_events_query)


def remove_no_genre_data_events(city_name):
    remove_no_genre_data_events_query = f"""
    DELETE FROM event_data_{city_name.lower().replace(' ', '_')}
    WHERE event_genres IS NULL OR cardinality(event_genres) = 0;
    """
    commit_to_database(remove_no_genre_data_events_query)


def extract_for_models(query):
    """Extract data for modeling."""
    conn = None
    try:
        params = config()
        logging.info("Connecting to the PostgreSQL database...")
        conn = psycopg2.connect(**params)
        df = pd.read_sql_query(query, conn)
        df['event_genres'] = df['event_genres'].apply(lambda x: ', '.join(x) if isinstance(x, list) else x)
    except (Exception, psycopg2.DatabaseError) as error:
        logging.error(error)
    finally:
        if conn is not None:
            conn.close()
            logging.info("Database connection closed.")
    return df


def filter_genres(genres, valid_genres):
    """
    Filters out genres that are not in the list of valid genres.

    Parameters:
        genres (list): The list of genres to filter.
        valid_genres (list): The list of valid genres to compare against.

    Returns:
        list: A list of genres that are in the valid genres list.
    """
    # Use a set for faster membership checking
    valid_genre_set = set(genre.lower() for genre in valid_genres)
    filtered_genres = [genre.lower() for genre in genres if genre.lower() in valid_genre_set]
    return filtered_genres

def get_all_genres():
    """Retrieves all valid genres from the Musicalyst website."""
    url = 'https://musicalyst.com/genres'
    response = requests.get(url)
    genre_html = response.text
    soup = BeautifulSoup(genre_html, 'html.parser')
    genres = [genre.text.lower() for genre in soup.find_all('li')]
    return genres
    



def name_cleaner(name):
    """Cleans unwanted words and symbols from names scraped."""
    
    if name is None:
        return ""
    
    # Replace newline characters with spaces instead of commas
    name = re.sub(r'\n', ' ', name)
    
    # Replace certain keywords with empty strings
    name = re.sub(r'\b(room|ROOM|TBA|tba|Friends|friends|opening|Opening|OPENING|closing|Closing|CLOSING|Residents|residents|Resident|resident)\b', '', name)
    
    # Remove non-breaking spaces and unwanted parentheses content
    name = re.sub(r'\xa0', '', name)
    name = re.sub(r'\(.*?\)', ' ', name)
    
    # Replace '&' and '//' with a space instead of commas
    name = re.sub(r'&|[\/]{2}', ' ', name)
    
    # Replace multiple spaces with a single space
    name = re.sub(r'\s+', ' ', name)
    
    # Remove leading/trailing spaces or commas
    name = re.sub(r'^,+|,+$', '', name)
    name = re.sub(r'^\s+|\s+$', '', name)
    
    # Remove numerical patterns and 'b2b' occurrences
    name = re.sub(r'\b\d{2}\b|b2b|B2B', '', name)
    
    # Final cleanup of any remaining unwanted characters
    name = re.sub(r'[\[\]\'\'_]', '', name)
    
    return name.strip()

def split_and_clean_genres(genres, valid_genres):
    """Cleans the genres list from the database to match the valid genres set."""
    cleaned_genres = []
    
    for genre in genres:
        # Normalize the genre: strip spaces, convert to lowercase, and remove special characters
        normalized_genre = re.sub(r'[^a-zA-Z0-9\s]', '', genre).strip().lower()
        
        if normalized_genre in valid_genres:
            cleaned_genres.append(normalized_genre)
        else:
            logging.warning(f"Genre '{genre}' normalized to '{normalized_genre}' not found in valid genres list.")

    return cleaned_genres
