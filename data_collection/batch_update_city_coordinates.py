#!/usr/bin/env python

import requests
import json
import time
import logging
import sys
import os
import argparse
from datetime import datetime, timedelta
from utils import commit_to_database, execute_query, execute_query2
from graphql_utils import load_graphql_query_template, parse_graphql_response, get_graphql_template_path

# Configure logging
logging.basicConfig(
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("batch_coordinate_update.log"),
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

def get_existing_events_by_city(city_name):
    """Fetch events from the database for a specific city that need coordinate updates"""
    query = """
    SELECT e.id, e.event_id, e.event_name, e.event_date, e.club_name 
    FROM clubfindr.events e
    WHERE (e.latitude IS NULL OR e.longitude IS NULL)
    AND e.event_date >= CURRENT_DATE
    AND e.city = %s
    ORDER BY e.event_date;
    """
    
    events = execute_query(query, params=(city_name,), fetch=True)
    logging.info(f"Found {len(events)} events in {city_name} that need coordinate updates")
    return events

def get_city_info(city_name):
    """Get the area code and country code for a city"""
    try:
        with open('/home/nathan/clubfinder/data_collection/live_cities.txt', 'r') as file:
            for line in file:
                parts = line.strip().split(' - ')
                if len(parts) == 3 and parts[0].lower() == city_name.lower():
                    return {
                        "name": parts[0].strip(),
                        "code": int(parts[1].strip()),
                        "country_code": parts[2].strip()
                    }
        
        logging.error(f"City {city_name} not found in live_cities.txt")
        return None
    except Exception as e:
        logging.error(f"Error reading cities file: {e}")
        return None

def generate_headers(city_name, country_code):
    """Generate headers for the API request"""
    headers = HEADERS_TEMPLATE.copy()
    headers['Referer'] = headers['Referer'].format(
        country_code=country_code.lower(), 
        city_name=city_name.lower().replace(" ", "-")
    )
    return headers

def fetch_venue_coordinates(city_info):
    """Fetch all venues with coordinates for a city in batch"""
    # Generate dates for a 15-day window
    today_date = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")
    
    listing_date_gte = f"{today_date}T00:00:00.000Z"
    listing_date_lte = f"{end_date}T23:59:59.999Z"
    
    # Generate headers and load query template
    headers = generate_headers(city_info["name"], city_info["country_code"])
    
    try:
        payload = load_graphql_query_template()
        
        # Update payload with dates and area code
        payload["variables"]["filters"]["areas"]["eq"] = city_info["code"]
        payload["variables"]["filters"]["listingDate"]["gte"] = listing_date_gte
        payload["variables"]["filters"]["listingDate"]["lte"] = listing_date_lte
        payload["variables"]["page"] = 1
        payload["variables"]["pageSize"] = 100  # Fetch more events per page
        
        response = requests.post(URL, headers=headers, json=payload)
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError:
            logging.error("Failed to parse JSON response for venue coordinates")
            return {}

        events_data = parse_graphql_response(
            data,
            ["eventListings", "data"],
            context="Event listings response",
            logger=logging,
            expected_type=list,
        )
        if events_data is None:
            logging.error("Invalid response format for event listings")
            return {}
        
        venues = {}
        for event_data in events_data:
            event = event_data.get("event", {})
            venue = event.get("venue", {})
            venue_name = venue.get("name")
            
            if venue_name and "location" in venue:
                location = venue.get("location", {})
                latitude = location.get("latitude")
                longitude = location.get("longitude")
                
                if latitude and longitude:
                    venues[venue_name] = {
                        "latitude": latitude,
                        "longitude": longitude
                    }
        
        logging.info(f"Retrieved coordinates for {len(venues)} venues in {city_info['name']}")
        return venues
    
    except Exception as e:
        logging.error(f"Error fetching venues for city {city_info['name']}: {e}")
        return {}

def update_batch_coordinates(city_name):
    """Process events for a city and update coordinates in batch"""
    # Get city information
    city_info = get_city_info(city_name)
    if not city_info:
        logging.error(f"Could not find information for city {city_name}")
        return
    
    # Fetch events that need updating
    events = get_existing_events_by_city(city_name)
    if not events:
        logging.info(f"No events found in {city_name} that need coordinate updates")
        return
    
    # Fetch venue coordinates in batch
    venues = fetch_venue_coordinates(city_info)
    if not venues:
        logging.error(f"Could not retrieve venue coordinates for city {city_name}")
        return
    
    updated_count = 0
    failed_count = 0
    
    # Update database
    for event in events:
        db_id, event_id, event_name, event_date, venue_name = event
        
        if venue_name in venues:
            # Update event with venue coordinates
            latitude = venues[venue_name]["latitude"]
            longitude = venues[venue_name]["longitude"]
            
            query = """
            UPDATE clubfindr.events 
            SET latitude = %s, longitude = %s
            WHERE id = %s;
            """
            
            try:
                commit_to_database(query, (latitude, longitude, db_id))
                logging.info(f"Updated coordinates for event '{event_name}' at venue '{venue_name}'")
                updated_count += 1
            except Exception as e:
                logging.error(f"Error updating coordinates for event '{event_name}': {e}")
                failed_count += 1
        else:
            logging.warning(f"No coordinates found for venue '{venue_name}' (Event: '{event_name}')")
            failed_count += 1
    
    logging.info(f"Update complete for {city_name}. Updated {updated_count} events. Failed to update {failed_count} events.")

def main():
    parser = argparse.ArgumentParser(description="Batch update coordinates for existing events in a city")
    parser.add_argument("city", type=str, help="Name of the city to update")
    
    args = parser.parse_args()
    
    logging.info(f"Starting batch coordinate update process for {args.city}")
    update_batch_coordinates(args.city)
    logging.info(f"Batch coordinate update process completed for {args.city}")

if __name__ == "__main__":
    main()
