#!/usr/bin/env python

from subprocess import call
import datetime
from utils import commit_to_database,clean_and_replace_genres, update_events_table_genres_query, backup_table, create_array_check_function 
from utils import remove_no_data_events, remove_no_genre_data_events, get_create_events_table_query, get_create_artists_table_query, commit_genres_to_dataBase 
import time
import logging
import sys
import os

# Configure logging at the beginning of the script
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    handlers=[
                        logging.FileHandler("clean_and_update_genres.log")
                    ])

# Step 1: Read the cities from live_cities.txt
def load_cities_from_file(file_path):
    cities = []
    with open(file_path, 'r') as file:
        for line in file:
            parts = line.strip().split(' - ')
            if len(parts) == 3:
                name, code, country = parts
                cities.append({
                    "name": name.strip().lower(),
                    "code": int(code.strip()),
                    "country": country.strip().lower()
                })
    return cities


# Define the path to your cities file
cities_file_path = '/home/nathan/clubfinder/data_collection/live_cities.txt'

cities = load_cities_from_file(cities_file_path)

# Function to generate the dates
def get_dates():
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.datetime.now() + datetime.timedelta(days=15)).strftime("%Y-%m-%d")
    return today_date, end_date

def build_database_tables(city_name):
    time.sleep(5)
    table_name = f"event_data_{city_name.lower().replace(' ', '_')}"
    clear_past_events_query = f"DELETE FROM {table_name} WHERE event_date < %s;"
    commit_genres_to_dataBase(clear_past_events_query, (datetime.datetime.now().date(),))

def open_event_fetcher( today_date, end_date, city_name, city_code,country_code):
    call(["python3", "/home/nathan/clubfinder/data_collection/event_fetcher.py",   today_date, end_date,city_name, str(areas),country_code])

def open_soundcloud_search(city_name):
    call(["python3", "/home/nathan/clubfinder/data_collection/soundcloud_api.py", city_name])

def open_spotipy_search(city_name):
    call(["python3", "/home/nathan/clubfinder/data_collection/spotipy_search.py", city_name])

if __name__ == '__main__':
    start_time = time.time()
    start_datetime = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"Script started at: {start_datetime}")
    logging.info(f"Script started at: {start_datetime}")
    
    for city in cities:
        city_name = city['name'].lower()
        areas = city['code']  # Use the city-specific code
        country_code = city['country']
        today_date, end_date = get_dates()  # Get the dates for each iteration
        
        print(f"Processing city: {city_name}")
        logging.info(f"Processing city: {city_name}")
        
        # Create event table
        print("Creating event table...")
        create_event_table_query = get_create_events_table_query(city_name)
        commit_to_database(create_event_table_query)

        # Create artist table
        print("Creating artist table...")
        create_artist_table_query = get_create_artists_table_query(city_name)
        commit_to_database(create_artist_table_query)
        
        # Build database tables and remove past events
        build_database_tables(city_name)
        
        # Proceed with other steps like fetching data, etc.
        print("Getting event data...")
        open_event_fetcher( today_date, end_date, city_name, areas,country_code)
        print("Event data collected..")
        
        remove_no_data_events(city_name)
        print("Starting Soundcloud API")
        open_soundcloud_search(city_name)
        print("Starting spotify API")
        open_spotipy_search(city_name)
        
        print("Cleaning genres")
        clean_and_replace_genres(city_name, "full_genre_list.csv")
        
        print("Removing events with no genre data")
        remove_no_genre_data_events(city_name)
        
        print("Updating event genres")
        update_genre_query = update_events_table_genres_query(city_name)
        commit_to_database(update_genre_query)
    
    end_time = time.time()
    end_datetime = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    elapsed_time = end_time - start_time
    minutes, seconds = divmod(elapsed_time, 60)
    
    print(f"Script finished at: {end_datetime}")
    logging.info(f"Script finished at: {end_datetime}")
    
    print(f"Execution time: {int(minutes)} minutes and {seconds:.2f} seconds")
    logging.info(f"Execution time: {int(minutes)} minutes and {seconds:.2f} seconds")
