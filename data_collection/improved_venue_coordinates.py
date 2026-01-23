#!/usr/bin/env python

import requests
import json
import time
import logging
import sys
import os
from datetime import datetime, timedelta
from utils import execute_query, commit_to_database
from graphql_utils import parse_graphql_response, get_graphql_template_path
from log_utils import redact_identifier

# Configure logging
logging.basicConfig(
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("improved_venue_update.log"),
        logging.StreamHandler()
    ]
)

# Resident Advisor API constants
URL = 'https://ra.co/graphql'
HEADERS_TEMPLATE = {
    'Content-Type': 'application/json',
    'Referer': 'https://ra.co/events/{country_code}/{city_name}',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:106.0) Gecko/20100101 Firefox/106.0'
}
QUERY_TEMPLATE_PATH = get_graphql_template_path()
DELAY = 2  # Delay between API calls

# Manual coordinates for some popular venues (as backup)
MANUAL_COORDINATES = {
    "Berlin": {
        "://about blank": {"latitude": 52.506287, "longitude": 13.465188},
        "ÆDEN": {"latitude": 52.497959, "longitude": 13.453531},
        "Anomalie Art Club": {"latitude": 52.541507, "longitude": 13.420099},
        "AVA Club": {"latitude": 52.529964, "longitude": 13.404122},
        "Berghain": {"latitude": 52.510811, "longitude": 13.443084},
        "Tresor": {"latitude": 52.510346, "longitude": 13.422231},
        "Watergate": {"latitude": 52.501945, "longitude": 13.448349},
        "Club der Visionaere": {"latitude": 52.497246, "longitude": 13.450532},
        "Sisyphos": {"latitude": 52.482855, "longitude": 13.481553},
        "KitKatClub": {"latitude": 52.503959, "longitude": 13.393520}
    },
    "London": {
        "Ministry Of Sound": {"latitude": 51.496389, "longitude": -0.098899},
        "XOYO": {"latitude": 51.525520, "longitude": -0.086500},
        "Corsica Studios": {"latitude": 51.491634, "longitude": -0.100882},
        "Fabric": {"latitude": 51.520000, "longitude": -0.101600},
        "Printworks": {"latitude": 51.498900, "longitude": -0.045800}
    }
}

def get_city_info(city_name):
    """Get the area code and country code for a city"""
    try:
        with open('/home/nathan/clubfinder/data_collection/live_cities.txt', 'r') as file:
            for line in file:
                parts = line.strip().split(' - ')
                if len(parts) == 3 and parts[0].lower() == city_name.lower():
                    return {
                        "name": parts[0],
                        "code": int(parts[1]),
                        "country_code": parts[2]
                    }
        
        logging.error(f"City {city_name} not found in live_cities.txt")
        return None
    except Exception as e:
        logging.error(f"Error reading cities file: {e}")
        return None

def get_venues_from_database(city):
    """Get all venues from a city that need coordinate updates"""
    query = """
    SELECT DISTINCT club_name
    FROM clubfindr.events
    WHERE city = %s
    AND (latitude IS NULL OR longitude IS NULL)
    ORDER BY club_name;
    """
    
    venues = execute_query(query, params=(city,), fetch=True)
    venue_names = [venue[0] for venue in venues] if venues else []
    logging.info(f"Found {len(venue_names)} venues in {city} that need coordinate updates")
    return venue_names

def create_venues_table():
    """Create a table to store venue coordinates for future use"""
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

def save_venue_to_database(venue_name, city, latitude, longitude, venue_id=None, address=None):
    """Save venue information to the venues table"""
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
        commit_to_database(query, (venue_id, venue_name, address, city, latitude, longitude))
        logging.info("Saved venue information for %s", redact_identifier(venue_name, "venue"))
        return True
    except Exception as e:
        logging.error("Error saving venue information for %s: %s", redact_identifier(venue_name, "venue"), e)
        return False

def update_events_with_coordinates(venue_name, city, latitude, longitude):
    """Update all events for a venue with coordinates"""
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
            "Error updating events for venue %s: %s",
            redact_identifier(venue_name, "venue"),
            e,
        )
        return 0

def generate_headers(city_name, country_code):
    """Generate headers for the API request"""
    headers = HEADERS_TEMPLATE.copy()
    headers['Referer'] = headers['Referer'].format(
        country_code=country_code.lower(), 
        city_name=city_name.lower().replace(" ", "-")
    )
    return headers

def fetch_city_events(city_info):
    """Fetch upcoming events for a city to extract venue information including coordinates"""
    # Generate dates for a 30-day window
    today_date = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    
    listing_date_gte = f"{today_date}T00:00:00.000Z"
    listing_date_lte = f"{end_date}T23:59:59.999Z"
    
    headers = generate_headers(city_info["name"], city_info["country_code"])
    
    # We need to modify the query slightly to explicitly request venue location data
    query = """
    query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $page: Int, $pageSize: Int) {
      eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
        data {
          event {
            id
            title
            venue {
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
      }
    }
    """
    
    payload = {
        "operationName": "GET_EVENT_LISTINGS",
        "variables": {
            "filters": {
                "areas": {"eq": city_info["code"]},
                "listingDate": {
                    "gte": listing_date_gte,
                    "lte": listing_date_lte
                }
            },
            "pageSize": 100,  # Fetch more events per page
            "page": 1
        },
        "query": query
    }
    
    try:
        response = requests.post(URL, headers=headers, json=payload)
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError:
            logging.error("Failed to parse JSON response for event listings")
            return {}
        
        # Save response for debugging
        with open(f"{city_info['name'].lower()}_events_response.json", 'w') as f:
            json.dump(data, f, indent=2)
        
        venues = {}
        
        events_data = parse_graphql_response(
            data,
            ["eventListings", "data"],
            context="Event listings response",
            logger=logging,
            expected_type=list,
        )
        if events_data is None:
            return {}
            
            for event_data in events_data:
                event = event_data.get("event", {})
                venue = event.get("venue", {})
                
                if venue and "name" in venue:
                    venue_name = venue.get("name")
                    venue_id = venue.get("id")
                    venue_address = venue.get("address")
                    location = venue.get("location", {})
                    
                    latitude = location.get("latitude") if location else None
                    longitude = location.get("longitude") if location else None
                    
                    if latitude and longitude:
                        venues[venue_name] = {
                            "id": venue_id,
                            "address": venue_address,
                            "latitude": latitude, 
                            "longitude": longitude
                        }
            
            logging.info(f"Found {len(venues)} venues with coordinates for {city_info['name']}")
        
        return venues
    
    except Exception as e:
        logging.error(f"Error fetching events for {city_info['name']}: {e}")
        return {}

def get_coordinated_clubs_from_ra(city_info):
    """Get a list of clubs with coordinates from RA's club listings"""
    query = """
    query GET_TOP_CLUBS($areaId: Int) {
      area(id: $areaId) {
        venues(sort: FOLLOWERS_COUNT, first: 50) {
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
    }
    """
    
    headers = generate_headers(city_info["name"], city_info["country_code"])
    
    payload = {
        "operationName": "GET_TOP_CLUBS",
        "variables": {
            "areaId": city_info["code"]
        },
        "query": query
    }
    
    try:
        response = requests.post(URL, headers=headers, json=payload)
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError:
            logging.error("Failed to parse JSON response for clubs listing")
            return {}
        
        # Save response for debugging
        with open(f"{city_info['name'].lower()}_clubs_response.json", 'w') as f:
            json.dump(data, f, indent=2)
        
        venues = {}
        
        venues_data = parse_graphql_response(
            data,
            ["area", "venues", "data"],
            context="Clubs listing response",
            logger=logging,
            expected_type=list,
        )
        if venues_data is None:
            return {}
            
            for venue in venues_data:
                if "name" in venue:
                    venue_name = venue.get("name")
                    venue_id = venue.get("id")
                    venue_address = venue.get("address")
                    location = venue.get("location", {})
                    
                    latitude = location.get("latitude") if location else None
                    longitude = location.get("longitude") if location else None
                    
                    if latitude and longitude:
                        venues[venue_name] = {
                            "id": venue_id,
                            "address": venue_address,
                            "latitude": latitude, 
                            "longitude": longitude
                        }
            
            logging.info(f"Found {len(venues)} clubs with coordinates for {city_info['name']}")
        
        return venues
    
    except Exception as e:
        logging.error(f"Error fetching clubs for {city_info['name']}: {e}")
        return {}

def update_venues_for_city(city_name):
    """Update all venues for a city with coordinates"""
    # Get city information
    city_info = get_city_info(city_name)
    if not city_info:
        logging.error(f"Could not find city information for {city_name}")
        return
    
    # Make sure venues table exists
    create_venues_table()
    
    # Get venues that need coordinates
    venues_to_update = get_venues_from_database(city_info["name"])
    if not venues_to_update:
        logging.info(f"No venues need updating in {city_info['name']}")
        return
    
    # Get venues with coordinates from events listing
    events_venues = fetch_city_events(city_info)
    
    # Get venues with coordinates from clubs listing
    clubs_venues = get_coordinated_clubs_from_ra(city_info)
    
    # Combine the two sources
    all_venues = {**events_venues, **clubs_venues}
    
    # Add manual coordinates as fallback
    if city_info["name"] in MANUAL_COORDINATES:
        manual_coords = MANUAL_COORDINATES[city_info["name"]]
        
        for venue_name, coords in manual_coords.items():
            if venue_name not in all_venues:
                all_venues[venue_name] = {
                    "id": None,
                    "address": None,
                    "latitude": coords["latitude"],
                    "longitude": coords["longitude"]
                }
    
    logging.info(f"Found coordinates for {len(all_venues)} venues in {city_info['name']}")
    
    # Track statistics
    updated_venues = 0
    total_events_updated = 0
    failed_venues = []
    
    # Process each venue
    for venue_name in venues_to_update:
        logging.info("Processing venue: %s", redact_identifier(venue_name, "venue"))
        
        # Check for exact match
        if venue_name in all_venues:
            venue_data = all_venues[venue_name]
            
            # Save to venues table
            save_venue_to_database(
                venue_name,
                city_info["name"],
                venue_data["latitude"],
                venue_data["longitude"],
                venue_data["id"],
                venue_data["address"]
            )
            
            # Update events
            events_updated = update_events_with_coordinates(
                venue_name,
                city_info["name"],
                venue_data["latitude"],
                venue_data["longitude"]
            )
            
            if events_updated > 0:
                updated_venues += 1
                total_events_updated += events_updated
            else:
                failed_venues.append(venue_name)
                
        else:
            # Try fuzzy matching
            found_match = False
            for ra_venue_name, venue_data in all_venues.items():
                # Simple fuzzy match - check if one is contained in the other
                if (venue_name.lower() in ra_venue_name.lower() or
                    ra_venue_name.lower() in venue_name.lower()):
                    
                    logging.info(
                        "Found fuzzy match: %s -> %s",
                        redact_identifier(venue_name, "venue"),
                        redact_identifier(ra_venue_name, "venue"),
                    )
                    
                    # Save to venues table
                    save_venue_to_database(
                        venue_name,  # Use the original name in our database
                        city_info["name"],
                        venue_data["latitude"],
                        venue_data["longitude"],
                        venue_data["id"],
                        venue_data["address"]
                    )
                    
                    # Update events
                    events_updated = update_events_with_coordinates(
                        venue_name,
                        city_info["name"],
                        venue_data["latitude"],
                        venue_data["longitude"]
                    )
                    
                    if events_updated > 0:
                        updated_venues += 1
                        total_events_updated += events_updated
                        found_match = True
                        break
            
            if not found_match:
                logging.warning(
                    "Could not find coordinates for venue: %s",
                    redact_identifier(venue_name, "venue"),
                )
                failed_venues.append(venue_name)
        
        # Small delay to avoid overwhelming the database
        time.sleep(0.2)
    
    # Report results
    logging.info(f"Venue update complete for {city_info['name']}")
    logging.info(f"Updated {updated_venues} venues with coordinates")
    logging.info(f"Updated {total_events_updated} events total")
    
    if failed_venues:
        logging.warning("Failed to update %d venues:", len(failed_venues))
        for venue in failed_venues:
            logging.warning("  - %s", redact_identifier(venue, "venue"))

def main():
    if len(sys.argv) < 2:
        print("Usage: python improved_venue_coordinates.py [city_name]")
        print("Example: python improved_venue_coordinates.py berlin")
        return
    
    city_name = sys.argv[1].lower()
    
    logging.info(f"Starting venue coordinate update for {city_name}")
    update_venues_for_city(city_name)
    logging.info(f"Venue coordinate update complete for {city_name}")

if __name__ == "__main__":
    main()
