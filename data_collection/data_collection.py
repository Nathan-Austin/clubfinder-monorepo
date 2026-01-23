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
import fcntl
import json

EVENT_FETCHER_TIMEOUT = int(os.getenv("EVENT_FETCHER_TIMEOUT", "300"))
SPOTIFY_TIMEOUT = int(os.getenv("SPOTIFY_TIMEOUT", "600"))
SOUNDCLOUD_TIMEOUT = int(os.getenv("SOUNDCLOUD_TIMEOUT", "900"))

LOCK_FILE = "/tmp/clubfinder_running.lock"
lock_file_handle = None  # Global variable to store lock file handle

STATE_FILE = os.getenv(
    "DATA_COLLECTION_STATE_FILE",
    "/home/nathan/clubfinder-monorepo/data_collection/run_state.json",
)
RESUME_MODE = os.getenv("DATA_COLLECTION_RESUME", "").lower() in {"1", "true", "yes"}
START_CITY = os.getenv("DATA_COLLECTION_START_CITY")

# Configure logging at the beginning of the script
logging.basicConfig(level=logging.ERROR,
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
    """
    Acquire an exclusive lock using fcntl for atomic file locking.
    This prevents race conditions where multiple processes try to run simultaneously.
    """
    global lock_file_handle

    try:
        # Open or create the lock file
        lock_file_handle = open(LOCK_FILE, 'w')

        # Try to acquire an exclusive lock (non-blocking)
        # LOCK_EX = exclusive lock
        # LOCK_NB = non-blocking (fail immediately if lock can't be acquired)
        fcntl.flock(lock_file_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

        # Write PID and timestamp to lock file for debugging
        lock_file_handle.write(f"PID: {os.getpid()}\n")
        lock_file_handle.write(f"Started: {datetime.datetime.now().isoformat()}\n")
        lock_file_handle.flush()

        logging.info(f"Successfully acquired lock: {LOCK_FILE}")
        return True

    except IOError as e:
        # Lock is already held by another process
        logging.info("Another instance is already running. Exiting.")
        if lock_file_handle:
            lock_file_handle.close()
            lock_file_handle = None
        sys.exit(0)
    except Exception as e:
        logging.error(f"Error acquiring lock: {e}")
        if lock_file_handle:
            lock_file_handle.close()
            lock_file_handle = None
        sys.exit(1)

def release_lock():
    """Release the exclusive lock and clean up the lock file."""
    global lock_file_handle

    if lock_file_handle:
        try:
            # Release the lock
            fcntl.flock(lock_file_handle.fileno(), fcntl.LOCK_UN)
            lock_file_handle.close()
            logging.info("Lock released")
        except Exception as e:
            logging.error(f"Error releasing lock: {e}")
        finally:
            lock_file_handle = None

    # Clean up the lock file
    if os.path.exists(LOCK_FILE):
        try:
            os.remove(LOCK_FILE)
            logging.info(f"Lock file removed: {LOCK_FILE}")
        except Exception as e:
            logging.error(f"Error removing lock file: {e}")
    else:
        logging.debug("No lock file to remove.")

def load_state():
    if not os.path.exists(STATE_FILE):
        return {"cities": {}}

    try:
        with open(STATE_FILE, "r") as f:
            state = json.load(f)
        if not isinstance(state, dict):
            return {"cities": {}}
        state.setdefault("cities", {})
        return state
    except Exception as e:
        logging.error(f"Error loading state file {STATE_FILE}: {e}")
        return {"cities": {}}


def save_state(state):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logging.error(f"Error saving state file {STATE_FILE}: {e}")


def mark_city_state(state, city_name, updates):
    entry = state.get("cities", {}).get(city_name, {})
    entry.update(updates)
    entry["updated_at"] = datetime.datetime.now().isoformat()
    state["cities"][city_name] = entry
    state["updated_at"] = entry["updated_at"]
    save_state(state)

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
# TEMPORARY: Using single city for testing
cities_file_path = '/home/nathan/clubfinder-monorepo/data_collection/live_cities.txt'

# Function to generate the dates
def get_dates():
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.datetime.now() + datetime.timedelta(days=15)).strftime("%Y-%m-%d")
    return today_date, end_date

def build_database_tables(city_name):
    time.sleep(5)
    
    clear_past_events_query = "DELETE FROM clubfindr.events WHERE event_date < %s;"
    commit_genres_to_dataBase(clear_past_events_query, (datetime.datetime.now().date(),))

def run_with_timeout(script_path, args, timeout):
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
    script_path = "/home/nathan/clubfinder-monorepo/data_collection/event_fetcher.py"
    args = [today_date, end_date, city_name, str(city_code), country_code]
    return run_with_timeout(script_path, args, timeout=EVENT_FETCHER_TIMEOUT)

def open_soundcloud_search(city_name):
    script_path = "/home/nathan/clubfinder-monorepo/data_collection/soundcloud_api.py"
    args = [city_name]
    return run_with_timeout(script_path, args, timeout=SOUNDCLOUD_TIMEOUT)

def open_spotipy_search(city_name):
    script_path = "/home/nathan/clubfinder-monorepo/data_collection/spotipy_search.py"
    args = [city_name]
    return run_with_timeout(script_path, args, timeout=SPOTIFY_TIMEOUT)

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
        state = load_state()
        
        if not cities:
            logging.error("No cities loaded. Exiting.")
            sys.exit(1)
        
        if START_CITY:
            start_index = next(
                (idx for idx, city in enumerate(cities) if city["name"] == START_CITY.lower()),
                None,
            )
            if start_index is None:
                logging.error(f"Start city not found in list: {START_CITY}")
                sys.exit(1)
            cities = cities[start_index:]

        for city in cities:
            city_name = city['name'].lower()
            areas = city['code']  # Use the city-specific code
            country_code = city['country']
            today_date, end_date = get_dates()  # Get the dates for each iteration
            city_state = state.get("cities", {}).get(city_name, {})

            if RESUME_MODE and city_state.get("completed"):
                logging.info(f"Skipping completed city: {city_name}")
                continue
            
            print(f"Processing city: {city_name}")
            logging.info(f"Processing city: {city_name}")

            initial_updates = {
                "status": "in_progress",
                "started_at": datetime.datetime.now().isoformat(),
                "completed": False,
            }
            if not city_state:
                initial_updates.update(
                    {
                        "event_fetcher": "pending",
                        "spotify": "pending",
                        "soundcloud": "pending",
                    }
                )

            mark_city_state(
                state,
                city_name,
                initial_updates,
            )
            
            try:
                # Get event data
                run_event_fetcher = not (RESUME_MODE and city_state.get("event_fetcher") == "success")
                if run_event_fetcher:
                    event_fetcher_success = open_event_fetcher(today_date, end_date, city_name, areas, country_code)
                else:
                    event_fetcher_success = True
                    logging.info(f"Skipping event fetcher for city: {city_name}")
                
                if not event_fetcher_success:
                    mark_city_state(
                        state,
                        city_name,
                        {
                            "status": "failed",
                            "event_fetcher": "failed",
                            "spotify": "skipped",
                            "soundcloud": "skipped",
                            "completed": False,
                        },
                    )
                    logging.warning(f"Event fetcher failed for city: {city_name}, skipping API enrichment")
                    continue
                if run_event_fetcher:
                    mark_city_state(state, city_name, {"event_fetcher": "success"})

                # Wait for event fetcher to complete before starting API enrichment
                time.sleep(5)  # Add a small buffer
                
                # Process Spotify first - faster with multiple API keys
                print(f"Processing Spotify for city: {city_name}")
                logging.info(f"Processing Spotify for city: {city_name}")
                run_spotify = not (RESUME_MODE and city_state.get("spotify") == "success")
                if run_spotify:
                    spotify_success = open_spotipy_search(city_name)
                else:
                    spotify_success = True
                    logging.info(f"Skipping Spotify for city: {city_name}")
                
                if not spotify_success:
                    mark_city_state(
                        state,
                        city_name,
                        {
                            "status": "failed",
                            "spotify": "failed",
                            "soundcloud": "skipped",
                            "completed": False,
                        },
                    )
                    logging.warning(f"Spotify search failed for city: {city_name}")
                elif run_spotify:
                    mark_city_state(state, city_name, {"spotify": "success"})
                
                # Only process SoundCloud if Spotify was successful
                if spotify_success:
                    print(f"Processing SoundCloud for city: {city_name}")
                    logging.info(f"Processing SoundCloud for city: {city_name}")
                    run_soundcloud = not (RESUME_MODE and city_state.get("soundcloud") == "success")
                    if run_soundcloud:
                        soundcloud_success = open_soundcloud_search(city_name)
                    else:
                        soundcloud_success = True
                        logging.info(f"Skipping SoundCloud for city: {city_name}")
                    
                    if not soundcloud_success:
                        mark_city_state(
                            state,
                            city_name,
                            {
                                "status": "partial",
                                "soundcloud": "failed",
                                "completed": False,
                            },
                        )
                        logging.warning(f"SoundCloud search failed for city: {city_name}")
                    elif run_soundcloud:
                        mark_city_state(
                            state,
                            city_name,
                            {
                                "status": "completed",
                                "soundcloud": "success",
                                "completed": True,
                                "last_completed_city": city_name,
                            },
                        )
                
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
