import asyncio
import base64
import json
import logging
import os
import traceback

import requests
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from sqlalchemy import text

from src.barfindr.database import database_manager
from src.barfindr.encryption import encryption_service

# Configure detailed logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


def verify_spotify_credentials():
    """Retrieve and verify Spotify credentials from the database."""
    with database_manager.get_session() as session:
        try:
            # Query to get Spotify app details
            query = text("""
                SELECT 
                    app_name, 
                    client_id, 
                    client_secret
                FROM clubfindr.spotify_apps
                WHERE app_name = 'Clubfindr Bars 1'
            """)

            result = session.execute(query).fetchone()

            if result:
                print("\n--- Spotify Credentials Verification ---")
                print(f"App Name: {result.app_name}")
                print(f"Client ID: {result.client_id}")
                print(f"Client Secret: {'*' * len(result.client_secret)}")
                print(
                    f"Hardcoded Redirect URI: https://www.clubfindr.com/spotify/login"
                )
                return result
            else:
                print("No Spotify app found with name 'Clubfindr Bars 1'")
                return None

        except Exception as e:
            print(f"Error retrieving Spotify credentials: {str(e)}")
            return None


def manual_token_validation(client_id, client_secret, refresh_token):
    """
    Perform a comprehensive validation of Spotify credentials and refresh token
    """
    print("\n--- Detailed Token Validation ---")

    # Base64 encode client credentials
    credentials = f"{client_id}:{client_secret}"
    encoded_credentials = base64.b64encode(credentials.encode("utf-8")).decode("utf-8")

    # Prepare headers and data for token validation
    headers = {
        "Authorization": f"Basic {encoded_credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    data = {"grant_type": "refresh_token", "refresh_token": refresh_token}

    # Comprehensive debug print
    print("Validation Details:")
    print(f"Client ID: {client_id}")
    print(f"Client ID Length: {len(client_id)}")
    print(f"Client Secret Length: {len(client_secret)}")
    print(f"Refresh Token Length: {len(refresh_token)}")

    try:
        # Make the token validation request
        response = requests.post(
            "https://accounts.spotify.com/api/token", headers=headers, data=data
        )

        # Detailed response analysis
        print("\nResponse Analysis:")
        print(f"Status Code: {response.status_code}")
        print("Response Headers:")
        for key, value in response.headers.items():
            print(f"  {key}: {value}")

        print("\nResponse Content:")
        try:
            content = response.json()
            print(json.dumps(content, indent=2))
        except ValueError:
            print(response.text)

        # Raise exception for non-200 responses
        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        print(f"\nRequest Exception: {e}")
        if hasattr(e, "response"):
            print("Response Headers:")
            for key, value in e.response.headers.items():
                print(f"  {key}: {value}")

            print("\nResponse Content:")
            try:
                print(json.dumps(e.response.json(), indent=2))
            except ValueError:
                print(e.response.text)

        raise


async def comprehensive_spotify_debug():
    """Perform comprehensive Spotify integration debugging"""
    print("Starting Comprehensive Spotify Debug")

    # Verify credentials from database
    credentials = verify_spotify_credentials()
    if not credentials:
        print("Cannot proceed without valid credentials")
        return

    # Retrieve encrypted tokens for a bar
    with database_manager.get_session() as session:
        try:
            # Extended query to get bar details
            bar_query = text("""
                SELECT 
                    id, 
                    spotify_access_token, 
                    spotify_refresh_token, 
                    spotify_app_name,
                    general_email,
                    spotify_email,
                    spotify_id,
                    spotify_connected,
                    spotify_app_name,
                    created_at,
                    updated_at
                FROM clubfindr.bars
                WHERE LOWER(music_service) = 'spotify' 
                AND spotify_access_token IS NOT NULL
                AND general_email = 'nath.austin@gmail.com'
                LIMIT 1
            """)

            bar = session.execute(bar_query).mappings().fetchone()

            if not bar:
                print("No bar with Spotify integration found for nath.austin@gmail.com")

                # Fallback query if email-specific query fails
                bar_query = text("""
                    SELECT 
                        id, 
                        spotify_access_token, 
                        spotify_refresh_token, 
                        spotify_app_name,
                        general_email,
                        spotify_email,
                        spotify_id,
                        spotify_connected,
                        spotify_app_name,
                        created_at,
                        updated_at
                    FROM clubfindr.bars
                    WHERE LOWER(music_service) = 'spotify' 
                    AND spotify_access_token IS NOT NULL
                    LIMIT 1
                """)
                bar = session.execute(bar_query).mappings().fetchone()

            if not bar:
                print("No bar with Spotify integration found")
                return

            # Print extended bar details
            print("\n--- Bar Spotify Integration Details ---")
            print(f"Bar ID: {bar.id}")
            print(f"General Email: {bar.general_email}")
            print(f"Spotify Email: {bar.spotify_email}")
            print(f"Spotify ID: {bar.spotify_id}")
            print(f"Spotify Connected: {bar.spotify_connected}")
            print(f"Spotify App Name: {bar.spotify_app_name}")
            print(f"Created At: {bar.created_at}")
            print(f"Updated At: {bar.updated_at}")

            # Verify Spotify app credentials
            spotify_app_query = text("""
                SELECT 
                    app_name, 
                    client_id, 
                    client_secret
                FROM clubfindr.spotify_apps
                WHERE app_name = :app_name
            """)
            spotify_app = session.execute(
                spotify_app_query, {"app_name": bar.spotify_app_name}
            ).fetchone()

            if spotify_app:
                print("\n--- Spotify App Credentials ---")
                print(f"App Name: {spotify_app.app_name}")
                print(f"Client ID: {spotify_app.client_id}")
                print(f"Client Secret: {'*' * len(spotify_app.client_secret)}")

                # Decrypt tokens
                try:
                    access_token = encryption_service.decrypt_token(
                        bar.spotify_access_token
                    )
                    refresh_token = encryption_service.decrypt_token(
                        bar.spotify_refresh_token
                    )

                    print("\n--- Token Decryption ---")
                    print(f"Access Token Length: {len(access_token)}")
                    print(f"Refresh Token Length: {len(refresh_token)}")
                except Exception as e:
                    print(f"Failed to decrypt tokens: {str(e)}")
                    return

                # Validate tokens
                try:
                    # Convert bytes to string if needed
                    access_token_str = (
                        access_token.decode()
                        if isinstance(access_token, bytes)
                        else access_token
                    )
                    refresh_token_str = (
                        refresh_token.decode()
                        if isinstance(refresh_token, bytes)
                        else refresh_token
                    )

                    # Perform manual token validation
                    manual_token_validation(
                        spotify_app.client_id,
                        spotify_app.client_secret,
                        refresh_token_str,
                    )

                except Exception as e:
                    print(f"\nToken Validation Failed: {str(e)}")
                    traceback.print_exc()
            else:
                print(f"No Spotify app found for name: {bar.spotify_app_name}")

        except Exception as e:
            print(f"\nDatabase error: {str(e)}")
            traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(comprehensive_spotify_debug())
