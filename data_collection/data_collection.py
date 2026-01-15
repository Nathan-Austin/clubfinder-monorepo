#!/usr/bin/env python

from subprocess import Popen, PIPE, TimeoutExpired
import datetime
from utils import execute_query
import time
import logging
import sys
import os
import signal
import traceback
import gc

LOCK_FILE = "/tmp/clubfinder_running.lock"

# Configure logging at the beginning of the script
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    handlers=[
                        logging.FileHandler("clubfinder_data_collection.log"),
                        logging.StreamHandler()  # Added to print logs to console
                    ])

def handle_sigterm(signum, frame):
    """Handle SIGTERM signal gracefully."""
    logging.info("Received termination signal. Cleaning up...")
    release_lock()
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)

def check_lock():
    if os.path.exists(LOCK_FILE):
        # Check if the lock is stale (older than 4 hours)
        lock_time = os.path.getmtime(LOCK_FILE)
        current_time = time.time()
        if current_time - lock_time < 14400:  # 4 hours in seconds
            logging.info("Another instance is already running. Exiting.")
            sys.exit(0)
    
    # Create the lock file
    with open(LOCK_FILE, 'w') as f:
        f.write(str(time.time()))
    logging.info(f"Lock file created: {LOCK_FILE}")

def release_lock():
    if os.path.exists(LOCK_FILE):
        os.remove(LOCK_FILE)
        logging.info(f"Lock file removed: {LOCK_FILE}")
    else:
        logging.info("No lock file to remove.")

# Step 1: Read the cities from live_cities.txt
def load_cities_from_file(file_path):
    cities = []
    logging.info(f"Loading cities from {file_path}")
    try:
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
        logging.info(f"Loaded {len(cities)} cities from file")
        return cities
    except Exception as e:
        logging.error(f"Error loading cities: {e}")
        return []

# Define the path to your cities file
cities_file_path = '/home/nathan/clubfinder/data_collection/live_cities.txt'

# Function to generate the dates
def get_dates():
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.datetime.now() + datetime.timedelta(days=15)).strftime("%Y-%m-%d")
    return today_date, end_date

def build_database_tables(city_name):
    time.sleep(5)
    
    clear_past_events_query = "DELETE FROM clubfindr.events WHERE event_date < %s;"
    commit_genres_to_dataBase(clear_past_events_query, (datetime.datetime.now().date(),))

def run_with_timeout(script_path, args, timeout=600):
    """Run a Python script with a timeout and capture output."""
    try:
        cmd = ["python3", script_path] + args
        logging.info(f"Starting: {' '.join(cmd)}")
        
        # Use Popen to capture output and enable timeout
        process = Popen(cmd, stdout=PIPE, stderr=PIPE, text=True)
        
        try:
            stdout, stderr = process.communicate(timeout=timeout)
            exit_code = process.returncode
            
            if exit_code != 0:
                logging.error(f"Script {script_path} exited with code {exit_code}")
                if stderr:
                    logging.error(f"Error output: {stderr[:500]}...")  # Log first 500 chars of error
            else:
                logging.info(f"Script {script_path} completed successfully")
                
            return True
        except TimeoutExpired:
            process.kill()
            # Try to clean up any remaining output
            try:
                stdout, stderr = process.communicate(timeout=5)
            except:
                pass
            logging.error(f"Script {script_path} timed out after {timeout} seconds")
            return False
        except KeyboardInterrupt:
            logging.warning(f"Script {script_path} interrupted by user")
            process.kill()
            try:
                # Give it a moment to terminate
                process.wait(timeout=5)
            except:
                pass
            return False
            
    except Exception as e:
        logging.error(f"Error running {script_path}: {e}")
        logging.error(traceback.format_exc())
        return False

def open_event_fetcher(today_date, end_date, city_name, city_code, country_code):
    script_path = "/home/nathan/clubfinder/data_collection/event_fetcher.py"
    args = [today_date, end_date, city_name, str(city_code), country_code]
    return run_with_timeout(script_path, args, timeout=300)  # 5 minute timeout

def open_soundcloud_search(city_name):
    script_path = "/home/nathan/clubfinder/data_collection/soundcloud_api.py"
    args = [city_name]
    return run_with_timeout(script_path, args, timeout=900)  # 15 minute timeout

def open_spotipy_search(city_name):
    script_path = "/home/nathan/clubfinder/data_collection/simple_spotipy.py"
    args = [city_name]
    return run_with_timeout(script_path, args, timeout=600)  # 10 minute timeout (reduced from 20)

def remove_no_genre_data_events():
    """Remove events that have no genre data."""
    try:
        query = "DELETE FROM clubfindr.events WHERE event_genres IS NULL OR cardinality(event_genres) = 0;"
        execute_query(query)
        logging.info("Successfully removed events with no genre data")
    except Exception as e:
        logging.error(f"Error removing events with no genre data: {e}")

if __name__ == '__main__':
    # Use these functions
    check_lock()
    
    try:
        start_time = time.time()
        start_datetime = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"Script started at: {start_datetime}")
        logging.info(f"Script started at: {start_datetime}")
        
        cities = load_cities_from_file(cities_file_path)
        
        if not cities:
            logging.error("No cities loaded. Exiting.")
            sys.exit(1)
        
        for city in cities:
            city_name = city['name'].lower()
            areas = city['code']  # Use the city-specific code
            country_code = city['country']
            today_date, end_date = get_dates()  # Get the dates for each iteration
            
            print(f"Processing city: {city_name}")
            logging.info(f"Processing city: {city_name}")
            
            try:
                # Get event data
                event_fetcher_success = open_event_fetcher(today_date, end_date, city_name, areas, country_code)
                
                if not event_fetcher_success:
                    logging.warning(f"Event fetcher failed for city: {city_name}, skipping API enrichment")
                    continue

                # Wait for event fetcher to complete before starting API enrichment
                time.sleep(5)  # Add a small buffer
                
                # Process Spotify first - faster with multiple API keys
                print(f"Processing Spotify for city: {city_name}")
                logging.info(f"Processing Spotify for city: {city_name}")
                spotify_success = open_spotipy_search(city_name)
                
                if not spotify_success:
                    logging.warning(f"Spotify search failed for city: {city_name}")
                
                # Only process SoundCloud if Spotify was successful
                if spotify_success:
                    print(f"Processing SoundCloud for city: {city_name}")
                    logging.info(f"Processing SoundCloud for city: {city_name}")
                    soundcloud_success = open_soundcloud_search(city_name)
                    
                    if not soundcloud_success:
                        logging.warning(f"SoundCloud search failed for city: {city_name}")
                
                # Optional: Add explicit cleanup
                gc.collect()

            except KeyboardInterrupt:
                logging.warning(f"Keyboard interrupt during processing of city: {city_name}")
                release_lock()
                sys.exit(1)
            except Exception as e:
                logging.error(f"Error processing city {city_name}: {e}")
                logging.error(traceback.format_exc())
                continue  # Continue with the next city
        
        # Final cleanup - remove events with no genre data
        print("Removing events with no genre data")
        remove_no_genre_data_events()
        
        end_time = time.time()
        end_datetime = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        elapsed_time = end_time - start_time
        minutes, seconds = divmod(elapsed_time, 60)
        
        print(f"Script finished at: {end_datetime}")
        logging.info(f"Script finished at: {end_datetime}")
        
        print(f"Execution time: {int(minutes)} minutes and {seconds:.2f} seconds")
        logging.info(f"Execution time: {int(minutes)} minutes and {seconds:.2f} seconds")
    
    except KeyboardInterrupt:
        logging.warning("Script interrupted by user. Cleaning up...")
    except Exception as e:
        logging.error(f"Unhandled exception: {e}")
        logging.error(traceback.format_exc())
    finally:
        release_lock()