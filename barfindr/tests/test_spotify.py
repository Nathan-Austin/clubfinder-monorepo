import asyncio
import traceback
import requests
from src.barfindr.spotify_service import spotify_service
from src.barfindr.database import database_manager
from src.barfindr.encryption import encryption_service
from sqlalchemy import text

async def test_spotify():
    print("Testing Spotify service...")
    
    # Reset the service to ensure a clean slate
    spotify_service.reset()
    
    with database_manager.get_session() as session:
        try:
            # Get the specific bar with Spotify integration for nath.austin@gmail.com
            bar_query = text("""
                SELECT b.id, b.spotify_access_token, b.spotify_refresh_token, 
                       b.spotify_app_name, b.music_service,
                       a.client_id, a.client_secret
                FROM clubfindr.bars b
                JOIN clubfindr.spotify_apps a ON b.spotify_app_name = a.app_name
                WHERE b.general_email = 'nath.austin@gmail.com'
                AND LOWER(b.music_service) = 'spotify' 
                AND b.spotify_access_token IS NOT NULL
            """)

            bar = session.execute(bar_query).mappings().fetchone()

            if not bar:
                print("No bar with Spotify integration found for nath.austin@gmail.com")
                return

            if not bar.client_id or not bar.client_secret:
                print("Error: client_id or client_secret is missing from the database")
                return
                
            print(f"Testing with bar ID: {bar.id}")
            print(f"Spotify app name: {bar.spotify_app_name}")
            print(f"Music service: {bar.music_service}")
            print(f"Client ID: {bar.client_id}")
            
            # Decrypt tokens
            try:
                access_token = encryption_service.decrypt_token(bar.spotify_access_token)
                refresh_token = encryption_service.decrypt_token(bar.spotify_refresh_token)
                print("Successfully decrypted tokens")
            except Exception as e:
                print(f"Failed to decrypt tokens: {str(e)}")
                return
                
            # Test getting music profile
            try:
                # Convert bytes to string if needed
                access_token_str = access_token.decode() if isinstance(access_token, bytes) else access_token
                refresh_token_str = refresh_token.decode() if isinstance(refresh_token, bytes) else refresh_token
                
                # Get music profile
                try:
                    profile = await spotify_service.get_bar_music_profile(
                        bar.id,
                        bar.client_id, 
                        bar.client_secret,
                        "https://www.clubfindr.com/spotify/login",
                        access_token_str,
                        refresh_token_str
                    )
                    
                    print("Successfully retrieved music profile:")
                    print(f"- Timestamp: {profile.get('timestamp')}")
                    
                    # Only print track details if they exist
                    if profile.get('current_track'):
                        print(f"- Current track: {profile['current_track'].get('name', 'Unknown')}")
                    
                    if profile.get('current_genres'):
                        print(f"- Genres: {', '.join(profile['current_genres'])[:100]}...")
                    
                    print(f"- Recent tracks: {profile.get('track_counts', {}).get('recent', 0)}")
                    print(f"- Queued tracks: {profile.get('track_counts', {}).get('queued', 0)}")
                    
                except Exception as profile_error:
                    print(f"Error getting music profile: {str(profile_error)}")
                    traceback.print_exc()
                    
            except Exception as e:
                print(f"Error setting up Spotify service: {str(e)}")
                traceback.print_exc()
        
        except Exception as e:
            print(f"Database error: {str(e)}")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_spotify())