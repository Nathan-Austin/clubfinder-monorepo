#!/usr/bin/env python

import requests
import json
import logging
import time
import sys
from utils import execute_query, commit_to_database
from graphql_utils import parse_graphql_response
from log_utils import redact_identifier

# Configure logging
logging.basicConfig(
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("venue_coordinates.log"),
        logging.StreamHandler()
    ]
)

# RA API constants
URL = 'https://ra.co/graphql'
HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:106.0) Gecko/20100101 Firefox/106.0'
}

# City to area code mapping
CITY_CODES = {
    "berlin": 34,
    "london": 13,
    "amsterdam": 29,
    "paris": 44,
    "barcelona": 20,
    "madrid": 41,
    "ibiza": 25,
    "rotterdam": 174
}

def get_venues_by_city(city):
    """Get all unique venues from a specific city in the database"""
    query = """
    SELECT DISTINCT club_name
    FROM clubfindr.events
    WHERE city = %s
    ORDER BY club_name;
    """
    
    venues = execute_query(query, params=(city,), fetch=True)
    return [venue[0] for venue in venues] if venues else []

def get_venue_details(venue_name, area_code):
    """Get venue details including coordinates using venue search"""
    payload = {
        "operationName": "SearchVenues",
        "variables": {
            "searchQuery": venue_name,
            "areaId": area_code
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
              area {
                id
                name
              }
            }
          }
        }
        """
    }
    
    try:
        response = requests.post(URL, headers=HEADERS, json=payload)
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError:
            logging.error("Failed to parse JSON response for venue search")
            return None

        venues = parse_graphql_response(
            data,
            ["venueSearch", "data"],
            context="Venue search response",
            logger=logging,
            expected_type=list,
        )
        if venues is None:
            return None
            
            if venues:
                # Find best match
                best_match = None
                for venue in venues:
                    venue_name_lower = venue.get('name', '').lower()
                    if venue_name.lower() in venue_name_lower or venue_name_lower in venue_name.lower():
                        best_match = venue
                        break
                
                # If no direct match found, use the first result
                if not best_match and venues:
                    best_match = venues[0]
                
                if best_match:
                    location = best_match.get('location', {})
                    latitude = location.get('latitude')
                    longitude = location.get('longitude')
                    
                    if latitude and longitude:
                        return {
                            'id': best_match.get('id'),
                            'name': best_match.get('name'),
                            'address': best_match.get('address'),
                            'latitude': latitude,
                            'longitude': longitude
                        }
        
        return None
    
    except Exception as e:
        logging.error(
            "Error getting venue details for %s: %s",
            redact_identifier(venue_name, "venue"),
            e,
        )
        return None

def update_venue_coordinates(venue_name, latitude, longitude, city):
    """Update venue coordinates in the database"""
    query = """
    UPDATE clubfindr.events
    SET latitude = %s, longitude = %s
    WHERE club_name = %s AND city = %s;
    """
    
    try:
        commit_to_database(query, (latitude, longitude, venue_name, city))
        
        # Check how many events were updated
        count_query = """
        SELECT COUNT(*) FROM clubfindr.events
        WHERE club_name = %s AND city = %s AND latitude IS NOT NULL;
        """
        result = execute_query(count_query, params=(venue_name, city), fetch=True)
        count = result[0][0] if result else 0
        
        logging.info(
            "Updated %d events for venue %s in %s",
            count,
            redact_identifier(venue_name, "venue"),
            city,
        )
        return count
    
    except Exception as e:
        logging.error(
            "Error updating venue %s in database: %s",
            redact_identifier(venue_name, "venue"),
            e,
        )
        return 0

def create_venues_table():
    """Create a separate table to store venue coordinates for future use"""
    query = """
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
        commit_to_database(query)
        logging.info("Venues table created or already exists")
        return True
    except Exception as e:
        logging.error(f"Error creating venues table: {e}")
        return False

def save_venue_to_table(venue_data, city):
    """Save venue data to the venues table"""
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
    
    try:
        commit_to_database(query, (
            venue_data.get('id'),
            venue_data.get('name'),
            venue_data.get('address'),
            city,
            venue_data.get('latitude'),
            venue_data.get('longitude')
        ))
        logging.info(
            "Saved venue %s to venues table",
            redact_identifier(venue_data.get('name'), "venue"),
        )
        return True
    except Exception as e:
        logging.error(f"Error saving venue to table: {e}")
        return False

def process_venues_for_city(city, area_code):
    """Process all venues for a city and update coordinates"""
    venues = get_venues_by_city(city)
    logging.info(f"Found {len(venues)} venues for {city}")
    
    if not venues:
        logging.info(f"No venues found for {city}")
        return
    
    # Create venues table if it doesn't exist
    create_venues_table()
    
    # Track statistics
    successful = 0
    failed = 0
    total_events_updated = 0
    
    for venue_name in venues:
        logging.info("Processing venue: %s", redact_identifier(venue_name, "venue"))
        
        # Get venue details
        venue_data = get_venue_details(venue_name, area_code)
        
        if venue_data and venue_data.get('latitude') and venue_data.get('longitude'):
            # Save venue to venues table
            save_venue_to_table(venue_data, city)
            
            # Update events with coordinates
            events_updated = update_venue_coordinates(
                venue_name,
                venue_data.get('latitude'),
                venue_data.get('longitude'),
                city
            )
            
            if events_updated > 0:
                successful += 1
                total_events_updated += events_updated
            else:
                failed += 1
        else:
            logging.warning(
                "Could not get coordinates for venue %s",
                redact_identifier(venue_name, "venue"),
            )
            failed += 1
        
        # Add delay to avoid rate limiting
        time.sleep(1)
    
    logging.info(f"Venue processing complete for {city}")
    logging.info(f"Successfully processed: {successful}/{len(venues)} venues")
    logging.info(f"Failed to process: {failed}/{len(venues)} venues")
    logging.info(f"Total events updated: {total_events_updated}")

def main():
    if len(sys.argv) < 2 or sys.argv[1].lower() not in CITY_CODES:
        print("Usage: python fetch_venue_coordinates.py [city_name]")
        print(f"Available cities: {', '.join(CITY_CODES.keys())}")
        return
    
    city = sys.argv[1].lower()
    area_code = CITY_CODES[city]
    
    logging.info(f"Starting venue coordinate fetching for {city} (area code: {area_code})")
    process_venues_for_city(city, area_code)
    logging.info(f"Finished venue coordinate fetching for {city}")

if __name__ == "__main__":
    main()
