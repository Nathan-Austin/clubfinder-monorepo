#!/usr/bin/env python

import requests
import json
import time
import csv
import sys
import argparse
from datetime import datetime, timedelta
from utils import commit_to_database, name_cleaner, execute_query2, execute_query
from psycopg2 import sql
import logging
import uuid
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("event_fetcher.log"),
        logging.StreamHandler()
    ]
)

URL = 'https://ra.co/graphql'
HEADERS_TEMPLATE = {
    'Content-Type': 'application/json',
    'Referer': 'https://ra.co/events/{country_code}/{city_name}',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:106.0) Gecko/20100101 Firefox/106.0'
}

QUERY_TEMPLATE_PATH = "/home/nathan/clubfinder/data_collection/graphql_query_template.json"

class EventFetcher:
    """
    A class to fetch and save event details from RA.co
    """

    def __init__(self, areas, listing_date_gte, listing_date_lte, city_name, country_code):
        logging.info(f"Initializing EventFetcher for city: {city_name} and country: {country_code}")
        self.headers = self.generate_headers(city_name, country_code)
        self.payload = self.generate_payload(areas, listing_date_gte, listing_date_lte)
        self.city_name = city_name
        self.country_code = country_code
        self.area_code = areas
        self.venue_cache = {}  # Cache for venue coordinates

    @staticmethod
    def generate_headers(city_name, country_code):
        headers = HEADERS_TEMPLATE.copy()
        headers['Referer'] = headers['Referer'].format(
            country_code=country_code.lower(), 
            city_name=city_name.lower().replace(" ", "-")
        )
        return headers
    
    @staticmethod
    def generate_payload(areas, listing_date_gte, listing_date_lte):
        """Generate the payload for the GraphQL request."""
        with open(QUERY_TEMPLATE_PATH, "r") as file:
            payload = json.load(file)

        payload["variables"]["filters"]["areas"]["eq"] = areas
        payload["variables"]["filters"]["listingDate"]["gte"] = listing_date_gte
        payload["variables"]["filters"]["listingDate"]["lte"] = listing_date_lte
        return payload
    
    def save_response_to_json(self, response, filename='event_response.json'):
        """Save API response to a JSON file for debugging."""
        try:
            with open(filename, 'w') as f:
                json.dump(response, f, indent=4)
            logging.info(f"Response saved to {filename}")
        except Exception as e:
            logging.error(f"Failed to save response to JSON: {e}")
    
    def get_events(self, page_number):
        """Fetch events from the RA API."""
        self.payload["variables"]["page"] = page_number
        start_time = time.time()

        try:
            response = requests.post(URL, headers=self.headers, json=self.payload)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            logging.error(f"Error fetching events: {e}")
            return []
            
        end_time = time.time()
        logging.info(f"Request completed in {end_time - start_time:.2f} seconds")
        
        if 'data' not in data:
            logging.error(f"Error in API response: {data}")
            return []

        return data["data"]["eventListings"]["data"]
    
    def get_venue_coordinates(self, venue_name):
        """Get coordinates for a venue from the venues table or fetch them from RA."""
        # Check if coordinates are in the cache
        if venue_name in self.venue_cache:
            return self.venue_cache[venue_name]
        
        # Check if coordinates are in the venues table
        query = """
        SELECT latitude, longitude
        FROM clubfindr.venues
        WHERE name = %s AND city = %s;
        """
        
        result = execute_query(query, params=(venue_name, self.city_name), fetch=True)
        
        if result and result[0][0] is not None and result[0][1] is not None:
            # Coordinates found in venues table
            coordinates = {
                'latitude': result[0][0],
                'longitude': result[0][1]
            }
            self.venue_cache[venue_name] = coordinates
            return coordinates
        
        # If not in the database, fetch from RA
        return self.fetch_venue_coordinates(venue_name)
    
    def fetch_venue_coordinates(self, venue_name):
        """Fetch venue coordinates from RA Search API."""
        payload = {
            "operationName": "SearchVenues",
            "variables": {
                "searchQuery": venue_name,
                "areaId": self.area_code
            },
            "query": """
            query SearchVenues($searchQuery: String!, $areaId: Int) {
              venueSearch(searchQuery: $searchQuery, areaId: $areaId) {
                data {
                  id
                  name
                  address
                  location {
                    latitude
                    longitude
                  }
                }
              }
            }
            """
        }
        
        try:
            response = requests.post(URL, headers=self.headers, json=payload)
            response.raise_for_status()
            data = response.json()
            
            if 'data' in data and 'venueSearch' in data['data'] and 'data' in data['data']['venueSearch']:
                venues = data['data']['venueSearch']['data']
                
                if venues:
                    # Find the best match for the venue
                    best_match = None
                    for venue in venues:
                        if venue_name.lower() in venue['name'].lower() or venue['name'].lower() in venue_name.lower():
                            best_match = venue
                            break
                    
                    # If no direct match, use the first venue
                    if not best_match and venues:
                        best_match = venues[0]
                    
                    if best_match:
                        location = best_match.get('location', {})
                        if location and 'latitude' in location and 'longitude' in location:
                            coordinates = {
                                'latitude': location['latitude'],
                                'longitude': location['longitude']
                            }
                            
                            # Save to venues table for future use
                            self.save_venue_to_database(
                                best_match.get('id', ''), 
                                best_match['name'], 
                                best_match.get('address', ''), 
                                coordinates['latitude'], 
                                coordinates['longitude']
                            )
                            
                            # Cache the coordinates
                            self.venue_cache[venue_name] = coordinates
                            return coordinates
            
            # If we get here, we couldn't find coordinates
            logging.warning(f"Could not find coordinates for venue: {venue_name}")
            self.venue_cache[venue_name] = {'latitude': None, 'longitude': None}
            return {'latitude': None, 'longitude': None}
            
        except Exception as e:
            logging.error(f"Error fetching coordinates for venue {venue_name}: {e}")
            self.venue_cache[venue_name] = {'latitude': None, 'longitude': None}
            return {'latitude': None, 'longitude': None}
    
    def save_venue_to_database(self, venue_id, name, address, latitude, longitude):
        """Save venue information to the venues table."""
        # Make sure the venues table exists
        create_table_query = """
        CREATE TABLE IF NOT EXISTS clubfindr.venues (
            id SERIAL PRIMARY KEY,
            venue_id VARCHAR(50),
            name VARCHAR(255) NOT NULL,
            address TEXT,
            city VARCHAR(100) NOT NULL,
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, city)
        );
        """
        
        try:
            execute_query(create_table_query)
            
            # Insert venue information
            query = """
            INSERT INTO clubfindr.venues (venue_id, name, address, city, latitude, longitude)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (name, city) DO UPDATE SET
                venue_id = EXCLUDED.venue_id,
                address = EXCLUDED.address,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                last_updated = CURRENT_TIMESTAMP;
            """
            
            commit_to_database(query, (venue_id, name, address, self.city_name, latitude, longitude))
            logging.info(f"Saved venue information for {name}")
            return True
        except Exception as e:
            logging.error(f"Error saving venue information for {name}: {e}")
            return False
    
    def save_event_and_artists(self, events, city_name):
        """Saves events, artists, and their associations to the database with coordinates."""
        event_ids = {}
        events_with_coords = 0
        events_without_coords = 0

        for event in events:
            try:
                event_data = event.get("event", {})
                if isinstance(event_data, list):
                    logging.warning(f"Skipping event data because it's a list: {event_data}")
                    continue

                # Safely extract event details
                event_id = event_data.get('id', '')
                event_name = event_data.get('title', 'Unnamed Event')
                event_date = event_data.get('date', '').split('T')[0] if event_data.get('date') else None
                start_time = event_data.get('startTime', '').split('T')[1].split('.')[0] if 'startTime' in event_data and event_data.get('startTime') else None
                end_time = event_data.get('endTime', '').split('T')[1].split('.')[0] if 'endTime' in event_data and event_data.get('endTime') else None
                
                # Extract venue details
                venue = event_data.get('venue', {})
                club_name = venue.get('name', 'Unknown Venue')
                club_address = venue.get('address', 'Unknown Address')
                
                # Get coordinates for this venue
                coordinates = self.get_venue_coordinates(club_name)
                latitude = coordinates['latitude']
                longitude = coordinates['longitude']
                
                if latitude and longitude:
                    logging.info(f"Using coordinates for {club_name}: {latitude}, {longitude}")
                    events_with_coords += 1
                else:
                    logging.warning(f"No coordinates found for {club_name}")
                    events_without_coords += 1
                
                popularity = event_data.get('attending', '0')
                price = event_data.get('cost', 'N/A')
                genres_info = event_data.get('genres', [])
                images = event_data.get("images", [])
                event_image = images[0].get('filename', '') if images else ''

                # Safely extract genres
                genres = [genre.get('name', '') for genre in genres_info if genre.get('name')]
                genres = genres if genres else ['None']

                # Insert event into the database
                query = """
                    INSERT INTO clubfindr.events (
                        event_id, event_name, club_name, club_address, event_date, start_time, end_time, 
                        event_genres, popularity, price, event_image, city, latitude, longitude
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (event_id, event_date) DO UPDATE SET
                        event_name = EXCLUDED.event_name,
                        club_name = EXCLUDED.club_name,
                        club_address = EXCLUDED.club_address,
                        event_date = EXCLUDED.event_date,
                        start_time = EXCLUDED.start_time,
                        end_time = EXCLUDED.end_time,
                        event_genres = EXCLUDED.event_genres,
                        popularity = EXCLUDED.popularity,
                        price = EXCLUDED.price,
                        event_image = EXCLUDED.event_image,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude
                    RETURNING id;
                """

                query_params = (
                    event_id, event_name, club_name, club_address, event_date,
                    start_time, end_time, genres, popularity, price, event_image, city_name, latitude, longitude
                )

                result = execute_query2(query, query_params, return_results=True)

                if result:
                    event_db_id = result[0]  # This is the DB event ID
                    event_ids[event_name] = event_db_id

                    # Extract artist information
                    artists_info = event_data.get("artists", [])
                    artist_ids = []

                    for artist in artists_info:
                        artist_name = name_cleaner(artist.get('name', 'Unknown Artist'))
                        facebook = artist.get('facebook', None)
                        instagram = artist.get('instagram', None)
                        soundcloud = artist.get('soundcloud', None)
                        bandcamp = artist.get('bandcamp', None)
                        website = artist.get('website', None)

                        artist_query = """
                        INSERT INTO clubfindr.artists (
                            artist_name, facebook_link, instagram_link, genres, soundcloud_link, bandcamp_link, website, primary_city
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT (artist_name, primary_city) DO NOTHING
                        RETURNING id;
                        """

                        artist_query_params = (
                            artist_name, facebook, instagram, genres,
                            soundcloud, bandcamp, website, city_name
                        )

                        artist_result = execute_query2(artist_query, artist_query_params, return_results=True)

                        if artist_result:
                            artist_id = artist_result[0]  # Get the artist's DB ID
                            artist_ids.append(artist_id)  # Store artist ID for event_artists table

                    # Insert event-artist relationships into event_artists table
                    self.save_event_artists(event_db_id, artist_ids, city_name)

            except Exception as e:
                logging.error(f"Failed to process event {event_name if 'event_name' in locals() else 'unknown'}: {e}")
                import traceback
                logging.error(traceback.format_exc())
                continue

        logging.info(f"Processed {len(events)} events. Events with coordinates: {events_with_coords}, without coordinates: {events_without_coords}")
        return event_ids

    def save_event_artists(self, event_id, artist_ids, city_name):
        """Inserts or updates the event_artists table with the relationship between events and artists."""
        for artist_id in artist_ids:
            query = """
                INSERT INTO clubfindr.event_artists (
                    event_id, artist_id, city
                ) VALUES (%s, %s, %s)
                ON CONFLICT (event_id, artist_id) DO NOTHING;
            """

            query_params = (event_id, artist_id, city_name)
            commit_to_database(query, query_params)


def main():
    parser = argparse.ArgumentParser(description="Fetch events from ra.co and save them to a database with coordinates.")
    parser.add_argument("start_date", type=str, help="The start date for event listings (inclusive, format: YYYY-MM-DD).")
    parser.add_argument("end_date", type=str, help="The end date for event listings (inclusive, format: YYYY-MM-DD).")
    parser.add_argument('city_name', type=str, help="Name of the city")
    parser.add_argument('areas', type=int, help="Code of the city")
    parser.add_argument('country_code', type=str, help="Country code for the city")
    parser.add_argument('--save-response', action='store_true', help="Save the API response for debugging")

    args = parser.parse_args()

    # Format start and end dates as required by the API
    listing_date_gte = f"{args.start_date}T00:00:00.000Z"
    listing_date_lte = f"{args.end_date}T23:59:59.999Z"

    # Initialize event fetcher with the area, city, and country details
    event_fetcher = EventFetcher(args.areas, listing_date_gte, listing_date_lte, args.city_name, args.country_code)

    all_events = []
    current_start_date = datetime.strptime(args.start_date, "%Y-%m-%d")
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d")

    # Loop through dates to fetch events
    while current_start_date <= end_date:
        listing_date_gte = current_start_date.strftime("%Y-%m-%dT00:00:00.000Z")
        event_fetcher.payload = event_fetcher.generate_payload(args.areas, listing_date_gte, listing_date_lte)

        try:
            events = event_fetcher.get_events(1)
            
            # Save response for debugging if requested
            if args.save_response and events and current_start_date == datetime.strptime(args.start_date, "%Y-%m-%d"):
                event_fetcher.save_response_to_json({"events": events}, f"{args.city_name}_response.json")
                
        except Exception as e:
            logging.error(f"Error fetching events: {e}")
            current_start_date += timedelta(days=1)  # Move to the next day if the API call fails
            continue

        if events:
            all_events.extend(events)
            logging.info(f"Added {len(events)} events for {current_start_date.strftime('%Y-%m-%d')}")

        # Move to the next day
        current_start_date += timedelta(days=1)

    logging.info(f"Total events fetched: {len(all_events)}")
    
    try:
        # Save events and artists in one function
        logging.info(f"Saving {len(all_events)} events to database for {args.city_name}")
        event_fetcher.save_event_and_artists(all_events, args.city_name)
        logging.info(f"Finished saving events to database for {args.city_name}")
        
    except Exception as e:
        logging.error(f"Error saving events or artists: {e}")
        import traceback
        logging.error(traceback.format_exc())

if __name__ == "__main__":
    main()