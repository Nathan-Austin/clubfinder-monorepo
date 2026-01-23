# Description: Spotify service to get live music profile for a bar.
# Spotify_service.py
import asyncio
import os
import time
from collections import Counter
from datetime import datetime
from typing import Dict, List, Optional

import requests
import spotipy
import structlog
from spotipy.oauth2 import SpotifyOAuth

logger = structlog.get_logger()


class SpotifyService:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super(SpotifyService, cls).__new__(cls)
        return cls._instance

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        redirect_uri: Optional[str] = None,
        polling_interval: int = 300,
        active_hours: Dict[str, str] = None,
        token_info: Optional[Dict] = None,
    ):
        # Comprehensive scopes for maximum access
        self.scopes = [
            # Player controls and playback
            "user-read-playback-state",
            "user-read-currently-playing",
            # Recently played and history
            "user-read-recently-played",
            # User information
            "user-read-email",
            "user-read-private",
            "user-top-read",
            # Playlists and library
            "playlist-read-private",
            "playlist-read-collaborative",
            "user-library-read",
            # Artists and additional details
            "user-follow-read",
        ]

        # Only set attributes if explicit credentials are provided
        if client_id and client_secret and redirect_uri:
            self.client_id = client_id
            self.client_secret = client_secret
            self.redirect_uri = redirect_uri

            self.oauth = SpotifyOAuth(
                client_id=self.client_id,
                client_secret=self.client_secret,
                redirect_uri=self.redirect_uri,
                scope=" ".join(self.scopes),
            )

            logger.info(
                "Initializing SpotifyService",
                client_id=self.client_id,
                client_secret="*****",
                redirect_uri=self.redirect_uri,
            )
        else:
            # If no credentials, reset all attributes
            self.client_id = None
            self.client_secret = None
            self.redirect_uri = None
            self.oauth = None
            self.sp = None

        # Common attributes
        self.sp = None
        self.polling_interval = polling_interval
        self.active_hours = active_hours or {"start": "16:00", "end": "01:59"}
        self.token_info = token_info or {}

    def reset(self):
        """
        Reset the SpotifyService to its initial state.
        Useful for ensuring a clean slate between uses.
        """
        self.client_id = None
        self.client_secret = None
        self.redirect_uri = None
        self.oauth = None
        self.sp = None
        self.token_info = {}

    def set_credentials(self, client_id, client_secret, redirect_uri):
        """
        Set credentials dynamically after initialization
        """
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

        self.oauth = SpotifyOAuth(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=self.redirect_uri,
            scope=" ".join(self.scopes),
        )

        logger.info("Spotify OAuth initialized successfully.")

    def _is_within_active_hours(self):
        """
        Check if current time is within active hours for polling.
        Returns True if within active hours, False otherwise.

        Active hours are defined in self.active_hours as a dict with 'start' and 'end' keys
        containing time strings in format "HH:MM".
        """
        if not self.active_hours:
            return True  # If no active hours specified, always active

        # Get current time
        now = datetime.now().time()

        # Parse start and end times
        start_time = datetime.strptime(self.active_hours["start"], "%H:%M").time()
        end_time = datetime.strptime(self.active_hours["end"], "%H:%M").time()

        # Handle case where end time is on the next day (e.g., start 18:00, end 03:00)
        if end_time < start_time:
            # Current time is after start time OR before end time
            return now >= start_time or now <= end_time
        else:
            # Current time is between start and end time
            return start_time <= now <= end_time

    def refresh_token(self):
        """Refresh access token if expired or invalid."""
        if not self.oauth:
            raise Exception("OAuth not initialized. Cannot refresh token.")

        # If no token info or token is expired or invalid
        if not self.token_info or time.time() > self.token_info.get("expires_at", 0):
            if not self.token_info or "refresh_token" not in self.token_info:
                raise Exception("No refresh token available")

            try:
                logger.info("Attempting to refresh token")
                new_token_info = self.oauth.refresh_access_token(
                    self.token_info["refresh_token"]
                )

                # Update token info and create Spotify client
                self.token_info = new_token_info

                # Create Spotify client with new access token
                self.sp = spotipy.Spotify(auth=self.token_info["access_token"])

                logger.info("Token successfully refreshed and Spotify client created")

            except Exception as e:
                logger.error(f"Token refresh failed: {str(e)}")
                raise

        # Ensure Spotify client exists
        if not self.sp:
            self.sp = spotipy.Spotify(auth=self.token_info["access_token"])

        return self.token_info.get("access_token")

    def reset(self):
        """
        Reset the SpotifyService to its initial state.
        Useful for ensuring a clean slate between uses.
        """
        self.client_id = None
        self.client_secret = None
        self.redirect_uri = None
        self.oauth = None
        self.sp = None
        self.token_info = {}

    async def get_bar_music_profile(
        self,
        bar_id: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        access_token: str,
        refresh_token: str,
    ) -> Dict:
        """Get live music profile for a bar."""
        try:
            # Reset client for each bar to ensure no token leakage between bars
            self.reset()

            # Set credentials specific to this bar
            self.set_credentials(client_id, client_secret, redirect_uri)

            # Set token info specific to this bar
            self.token_info = {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_at": 0,  # Force token refresh
            }

            # Create a new Spotify client with this bar's token
            self.sp = None  # Clear any existing client
            self.refresh_token()
            # Ensure credentials are set
            if not self.oauth:
                self.set_credentials(client_id, client_secret, redirect_uri)

            # Ensure token info is set
            if not self.token_info:
                self.token_info = {
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "expires_at": 0,  # Force token refresh
                }

            # Attempt to refresh token
            try:
                self.refresh_token()
            except Exception as e:
                logger.warning(f"Token refresh failed: {str(e)}")
                # If refresh fails, raise the exception
                raise

            # Verify Spotify client is authenticated
            if not self.sp:
                raise Exception("Spotify client not authenticated")

            # Function to handle rate limiting
            async def make_spotify_request(url, headers):
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = requests.get(url, headers=headers)

                        if response.status_code == 429:
                            # Extract retry-after header or use default backoff
                            retry_after = int(response.headers.get("Retry-After", 30))
                            logger.warning(
                                f"Rate limited. Waiting {retry_after} seconds."
                            )
                            await asyncio.sleep(retry_after)
                            continue

                        return response
                    except Exception as e:
                        logger.error(f"Request error on attempt {attempt + 1}: {e}")
                        if attempt == max_retries - 1:
                            raise
                        await asyncio.sleep(2**attempt)  # Exponential backoff

                raise Exception("Max retries exceeded")

            # Prepare headers
            headers = {"Authorization": f'Bearer {self.token_info["access_token"]}'}

            # Try to get current track
            current_track = None
            try:
                current_track_response = await make_spotify_request(
                    "https://api.spotify.com/v1/me/player/currently-playing", headers
                )
                if current_track_response.status_code == 200:
                    current_track_data = current_track_response.json()
                    current_track = (
                        current_track_data.get("item") if current_track_data else None
                    )
            except Exception as e:
                logger.warning(f"Error getting current track: {str(e)}")

            # Try to get recent tracks
            recent_tracks_data = []
            try:
                recent_tracks_response = await make_spotify_request(
                    "https://api.spotify.com/v1/me/player/recently-played", headers
                )
                if recent_tracks_response.status_code == 200:
                    recent_tracks_data = recent_tracks_response.json().get("items", [])
            except Exception as e:
                logger.warning(f"Error getting recent tracks: {str(e)}")

            # Try to get queue tracks
            queue_tracks_data = []
            try:
                queue_tracks_response = await make_spotify_request(
                    "https://api.spotify.com/v1/me/player/queue", headers
                )
                if queue_tracks_response.status_code == 200:
                    queue_data = queue_tracks_response.json()
                    # logger.debug(f"Queue response data: {queue_data}")
                    queue_tracks_data = queue_data.get("queue", [])
                    logger.debug(f"Extracted queue tracks: {len(queue_tracks_data)}")
                else:
                    logger.warning(
                        f"Queue request returned status code: {queue_tracks_response.status_code}"
                    )
            except Exception as e:
                logger.warning(f"Error getting queue tracks: {str(e)}")

            # Process tracks and genres
            def extract_track_info(track):
                if not track:
                    return None
                return {
                    "id": track.get("id"),
                    "name": track.get("name"),
                    "artists": [artist["id"] for artist in track.get("artists", [])],
                }

            current_track_info = (
                extract_track_info(current_track) if current_track else None
            )
            recent_tracks_info = [
                extract_track_info(track.get("track"))
                for track in recent_tracks_data
                if track.get("track")
            ]
            queue_tracks_info = [
                extract_track_info(track) for track in queue_tracks_data
            ]

            # Get genres for tracks
            async def get_track_genres(track):
                if not track or not track.get("artists"):
                    return []
                try:
                    artist_genres_response = requests.get(
                        f"https://api.spotify.com/v1/artists?ids={','.join(track['artists'])}",
                        headers={
                            "Authorization": f'Bearer {self.token_info["access_token"]}'
                        },
                    )

                    if artist_genres_response.status_code == 200:
                        artists_data = artist_genres_response.json().get("artists", [])
                        return list(
                            set(
                                genre
                                for artist in artists_data
                                for genre in artist.get("genres", [])
                            )
                        )
                    return []
                except Exception as e:
                    logger.error(f"Error getting track genres: {str(e)}")
                    return []

            current_genres = (
                await get_track_genres(current_track_info) if current_track_info else []
            )
            recent_genres = []
            for track in recent_tracks_info:
                track_genres = await get_track_genres(track)
                recent_genres.extend(track_genres)

            queue_genres = []
            for track in queue_tracks_info:
                track_genres = await get_track_genres(track)
                queue_genres.extend(track_genres)

            # Calculate genre weights
            def calculate_genre_weights(genres):
                if not genres:
                    return {}
                genre_counts = Counter(genres)
                total = sum(genre_counts.values())
                return {
                    genre: count / total for genre, count in genre_counts.most_common()
                }

            profile = {
                "timestamp": datetime.utcnow().isoformat(),
                "current_track": current_track_info,
                "current_genres": current_genres,
                "rolling_genre_profile": calculate_genre_weights(recent_genres),
                "immediate_genre_profile": calculate_genre_weights(queue_genres),
                "track_counts": {
                    "recent": len(recent_tracks_info),
                    "queued": len(queue_tracks_info),
                },
            }
            return profile
        except Exception as e:
            logger.error("Error getting bar music profile", error=str(e))
            raise


# Create a single instance but without initializing credentials
spotify_service = SpotifyService()
