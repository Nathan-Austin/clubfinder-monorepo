import requests
import json
import time
import csv
import sys
import argparse
from datetime import datetime, timedelta
from utils import commit_to_database, name_cleaner
from psycopg2 import sql
import logging

import os
URL = 'https://ra.co/graphql'
HEADERS_TEMPLATE = {
    'Content-Type': 'application/json',
    'Referer': 'https://ra.co/events/{country_code}/{city_name}',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:106.0) Gecko/20100101 Firefox/106.0'
}


QUERY_TEMPLATE_PATH = "/home/nathan/clubfinder/data_collection/graphql_query_template.json"

def generate_payload():
    print(f"Attempting to open file at: {QUERY_TEMPLATE_PATH}")
    if not os.path.isfile(QUERY_TEMPLATE_PATH):
        print("File does not exist or path is incorrect")
    else:
        try:
            with open(QUERY_TEMPLATE_PATH, "r") as file:
                print("File opened successfully")
                # Add your file reading logic here
        except FileNotFoundError as e:
            print(f"Error: {e}")

DELAY = 2  # Adjust this value as needed


class EventFetcher:
    """
    A class to fetch and print event details from RA.co
    """

    def __init__(self, areas, listing_date_gte, listing_date_lte, city_name, country_code):
        print(f"Initializing EventFetcher for city: {city_name} and country: {country_code}")
        self.headers = self.generate_headers(city_name, country_code)
        self.payload = self.generate_payload(areas, listing_date_gte, listing_date_lte)

    @staticmethod
    def generate_headers(city_name, country_code):
        headers = HEADERS_TEMPLATE.copy()
        headers['Referer'] = headers['Referer'].format(country_code=country_code.lower(), city_name=city_name.lower().replace(" ", "-"))
        #print(f"Generated headers: {headers}")
        return headers
    
    @staticmethod
    def generate_payload(areas, listing_date_gte, listing_date_lte):
        """
        Generate the payload for the GraphQL request.

        :param areas: The area code to filter events.
        :param listing_date_gte: The start date for event listings (inclusive).
        :param listing_date_lte: The end date for event listings (inclusive).
        :return: The generated payload.
        """
        with open(QUERY_TEMPLATE_PATH, "r") as file:
            payload = json.load(file)

        payload["variables"]["filters"]["areas"]["eq"] = areas
        payload["variables"]["filters"]["listingDate"]["gte"] = listing_date_gte
        payload["variables"]["filters"]["listingDate"]["lte"] = listing_date_lte
        #print(f"Generated payload: {payload}")
        return payload

 

    def get_events(self, page_number):
        self.payload["variables"]["page"] = page_number
        start_time = time.time()

        try:
            response = requests.post(URL, headers=self.headers, json=self.payload)
            response.raise_for_status()
            data = response.json()
        except (requests.exceptions.RequestException, ValueError):
            logging.error(f"Error: {response.status_code}")
            return []
        end_time = time.time()
        print(f"Request completed in {end_time - start_time} seconds")
        if 'data' not in data:
            logging.error(f"Error: {data}")
            return []

        return data["data"]["eventListings"]["data"]

    



    def save_events_to_postgres(self, events, city_name):
        print(f"Saving {len(events)} events to database for city: {city_name}")
        """
        Export event data to postgres

        :param events: A list of events.
        
        """
        """     "Event id", "Event name", "Date", "Start Time", "End Time",
                "Artists", "Genres", "Venue", "Event URL", "Number of guests attending",
        """
        unique_event_names = set()  # Keep track of unique event names
        
        table_name = f"event_{city_name.lower().replace(' ', '_')}"
        for event in events:
                event_data = event.get("event", {})
                artists_info = event_data.get("artists", [])
                genres_info = event_data.get("genres", [])
                genres = [genre.get('name', '') for genre in genres_info if genre.get('name')]
                images = event_data.get("images", {})

                eventName = event_data.get('title', '')
                if eventName in unique_event_names:
                    continue
                
                unique_event_names.add(eventName)

                eventId = event_data.get('id', '')
                eventName = event_data.get('title', '')
                eventDate = event_data.get('date', '').split('T')[0]
                startTime = event_data.get('startTime', '').split('T')[1].split('.')[0]
                endTime = event_data.get('endTime', '').split('T')[1].split('.')[0]
                artists = ', '.join([artist_info.get('name', '') for artist_info in artists_info])
                clubName = event_data.get('venue', {}).get('name', '')
                popularity = event_data.get('attending', '')
                clubAddress = event_data.get('venue', {}).get('address', '')
                price = event_data.get('cost', '')
                event_image = images[0].get('filename', 'Event flyerfront image not available') if images else 'Event flyerfront image not available'
                
                
                
                query = sql.SQL("""
                    INSERT INTO {table} (
                        event_name, event_id, club_name, club_address,
                        event_date, start_time, end_time, artists, popularity, price, event_genres, event_image
                    ) VALUES (
                        {eventName}, {eventId},{clubName}, {clubAddress}, {eventDate}, {startTime},
                        {endTime}, {artists}, {popularity}, {price}, ARRAY[{genres}]::TEXT[], {event_image}
                    )ON CONFLICT (event_name) DO NOTHING;
                """).format(
                    table=sql.Identifier(table_name),
                    eventId=sql.Literal(eventId),
                    eventName=sql.Literal(eventName),
                    clubName=sql.Literal(clubName),
                    clubAddress=sql.Literal(clubAddress),
                    eventDate=sql.Literal(eventDate),
                    startTime=sql.Literal(startTime),
                    endTime=sql.Literal(endTime),
                    artists=sql.SQL("ARRAY[{}]::TEXT[]").format(sql.Literal(artists)),
                    popularity=sql.Literal(popularity),
                    price=sql.Literal(price),
                    genres=sql.SQL(', ').join(map(sql.Literal, genres)) if genres else sql.Literal('None'),
                    event_image=sql.Literal(event_image)
                )

                
                try:
                    #print(f"Event {query} saved to database.")
                    commit_to_database(query)
                except Exception as e:
                    print(f"Failed to commit query for event {query}: {e}")
                    #logging.error(f"Failed to commit query: {query} with error: {e}")

    
    def save_artists_to_postgres(self, events, city_name):   
        """
        Export event data to postgres

        :param events: A list of events.
        
        """
        """       
            "Artist ID", "Artist Country ID", "Artist Name",
            "Artist First Name", "Artist Last Name", "Artist Facebook",
            "Artist Instagram", "Artist Twitter", "Artist Soundcloud",
            "Artist Discogs", "Artist Bandcamp", "Artist Website", 
        """     
        table_name = f"artists_{city_name.lower().replace(' ', '_')}"                      
        for event in events:
            event_data = event.get("event", {})
            artists_info = event_data.get("artists", [])
            genres_info = event_data.get("genres", [])
            genres = [genre.get('name', '') for genre in genres_info]
            genres = ','.join("'" + item + "'" for item in genres if item) or "'None'"
            if genres == []:
                genres = "'None'"
            if genres == '':
                genres = "'None'"


            for artist in artists_info:
                artistName = name_cleaner(artist.get('name', ''))
                facebook = artist.get('facebook', '')
                instagram = artist.get('instagram', '')
                soundcloud = artist.get('soundcloud', '')
                discogs = artist.get('discogs', '')
                bandcamp = artist.get('bandcamp', '')
                website = artist.get('website', '')

                table_name = f"artists_{city_name.lower().replace(' ', '_')}"

                query2 = sql.SQL("""
                                   INSERT INTO {table}(
                                       artist_name, facebook_link, instagram_link, genres, soundcloud_link, bandcamp_link, website, other_link
                                   ) VALUES (
                                       {artistName}, {facebook}, {instagram}, ARRAY[{genres}]::TEXT[], {soundcloud}, {bandcamp}, {website}, {discogs}
                                   ) ON CONFLICT (artist_name) DO NOTHING;
                               """).format(
                                   table=sql.Identifier(table_name),
                                   artistName=sql.Literal(artistName),
                                   facebook=sql.Literal(facebook),
                                   instagram=sql.Literal(instagram),
                                   genres=sql.SQL(', ').join(map(sql.Literal, genres.split(','))),  # Split genres string back into list
                                   soundcloud=sql.Literal(soundcloud),
                                   bandcamp=sql.Literal(bandcamp),
                                   website=sql.Literal(website),
                                   discogs=sql.Literal(discogs)
                               )



                
                try:
                    #print(f"Artist {query2} saved to database.")
                    commit_to_database(query2)
                except Exception as e:
                    print(f"Failed to commit query for artist {query2}: {e}")
                    #logging.error(f"Failed to commit query: {query2} with error: {e}")

                     

   



def main():
    parser = argparse.ArgumentParser(description="Fetch events from ra.co and save them to a database.")
    parser.add_argument("start_date", type=str, help="The start date for event listings (inclusive, format: YYYY-MM-DD).")
    parser.add_argument("end_date", type=str, help="The end date for event listings (inclusive, format: YYYY-MM-DD).")
    parser.add_argument('city_name', type=str, help="Name of the city")
    parser.add_argument('areas', type=int, help="Code of the city")
    parser.add_argument('country_code', type=str, help="Country code for the city")

    args = parser.parse_args()

    listing_date_gte = f"{args.start_date}T00:00:00.000Z"
    listing_date_lte = f"{args.end_date}T23:59:59.999Z"

    event_fetcher = EventFetcher(args.areas, listing_date_gte, listing_date_lte, args.city_name, args.country_code)

    all_events = []
    current_start_date = datetime.strptime(args.start_date, "%Y-%m-%d")
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d")

    while current_start_date <= end_date:
        listing_date_gte = current_start_date.strftime("%Y-%m-%dT00:00:00.000Z")
        event_fetcher.payload = event_fetcher.generate_payload(args.areas, listing_date_gte, listing_date_lte)

        events = event_fetcher.get_events(1)
        all_events.extend(events)

        # Ensure the loop progresses even if no events are returned
        if len(events) > 0:
            # If events are found, move the date forward by the number of events found
            current_start_date += timedelta(days=len(events))
        else:
            # If no events are found, move the date forward by one day to avoid an infinite loop
            current_start_date += timedelta(days=1)

    event_fetcher.save_events_to_postgres(all_events, args.city_name)
    event_fetcher.save_artists_to_postgres(all_events, args.city_name)



if __name__ == "__main__":
    main()
