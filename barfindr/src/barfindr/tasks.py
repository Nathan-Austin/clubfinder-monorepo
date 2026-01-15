# src/barfindr/tasks.py
from celery import shared_task
import structlog
import asyncio
import os
from sqlalchemy import text
from datetime import datetime, timedelta
from .spotify_service import spotify_service
from .database import database_manager
from .models.bar_profile import BarGenreProfile, BarGenreAggregate
from .encryption import encryption_service
from dotenv import load_dotenv
logger = structlog.get_logger()
load_dotenv()

@shared_task(name='barfindr.tasks.spotify_genre_polling')
def spotify_genre_polling():
    """
    Poll Spotify for current, recent, and queued tracks for active bars.
    Analyzes genres and updates bar music profiles.
    """
    try:
        # Check if within active hours
        if not hasattr(spotify_service, '_is_within_active_hours'):
            logger.warning("spotify_service missing _is_within_active_hours method")
            # Default to True if method doesn't exist
            is_active = True
        else:
            is_active = spotify_service._is_within_active_hours()
            
        if not is_active:
            logger.info("Outside active hours, skipping Spotify polling")
            return

        logger.info("Starting Spotify genre polling task")
        
        with database_manager.get_session() as session:
            try:
                # Query active bars with their Spotify tokens and app credentials
                active_bars_query = text("""
                    SELECT b.id, b.spotify_access_token, b.spotify_refresh_token, 
                           b.spotify_app_name, b.music_service,
                           a.client_id, a.client_secret
                    FROM clubfindr.bars b
                    JOIN clubfindr.spotify_apps a ON b.spotify_app_name = a.app_name
                    WHERE LOWER(b.music_service) = 'spotify' 
                    AND b.spotify_access_token IS NOT NULL
                """)
                
                # Get the redirect URI from environment
                redirect_uri = os.getenv('SPOTIFY_REDIRECT_URI', 'https://www.clubfindr.com/spotify/login')
                
                active_bars = session.execute(active_bars_query).fetchall()
                logger.info(f"Found {len(active_bars)} active bars for Spotify polling")

                # Group bars by app_name to minimize credential swapping
                bars_by_app = {}
                for bar in active_bars:
                    app_name = bar.spotify_app_name
                    if app_name not in bars_by_app:
                        bars_by_app[app_name] = []
                    bars_by_app[app_name].append(bar)
                
                # Process each app group
                for app_name, bars in bars_by_app.items():
                    logger.info(f"Processing {len(bars)} bars for app {app_name}")
                    
                    for bar in bars:
                        try:
                            # Decrypt tokens
                            access_token = encryption_service.decrypt_token(bar.spotify_access_token).decode()
                            refresh_token = encryption_service.decrypt_token(bar.spotify_refresh_token).decode()

                            # Get comprehensive music profile using specific app credentials
                            profile_data = asyncio.run(spotify_service.get_bar_music_profile(
                                bar.id,
                                bar.client_id,
                                bar.client_secret,
                                redirect_uri,
                                access_token,
                                refresh_token
                            ))

                            if not profile_data:
                                logger.info(f"No profile data for bar {bar.id}")
                                continue
                         
                        
                            # Update tokens if refreshed
                            if profile_data.get('new_token_info'):
                                # Encrypt new tokens before storing
                                try:
                                    encrypted_access = encryption_service.encrypt_token(
                                        profile_data['new_token_info']['access_token']
                                    )
                                    encrypted_refresh = encryption_service.encrypt_token(
                                        profile_data['new_token_info']['refresh_token']
                                    )

                                    token_update_query = text("""
                                        UPDATE clubfindr.bars 
                                        SET spotify_access_token = :access_token,
                                            spotify_refresh_token = :refresh_token,
                                            updated_at = CURRENT_TIMESTAMP
                                        WHERE id = :bar_id
                                    """)

                                    session.execute(
                                        token_update_query,
                                        {
                                            'access_token': encrypted_access,
                                            'refresh_token': encrypted_refresh,
                                            'bar_id': bar.id
                                        }
                                    )
                                except ValueError as e:
                                    logger.error(f"Failed to encrypt new tokens for bar {bar.id}", error=str(e))



                            # Create new profile record
                            new_profile = BarGenreProfile(
                                bar_id=bar.id,
                                timestamp=datetime.fromisoformat(profile_data['timestamp']),
                                current_track_id=profile_data['current_track']['id'] if profile_data['current_track'] else None,
                                current_track_name=profile_data['current_track']['name'] if profile_data['current_track'] else None,
                                current_genres=profile_data['current_genres'],
                                rolling_genre_profile=profile_data['rolling_genre_profile'],
                                immediate_genre_profile=profile_data['immediate_genre_profile'],
                                track_counts=profile_data['track_counts']
                            )

                            session.add(new_profile)
                            session.commit()

                            logger.info(f"Successfully recorded genre profile for bar {bar.id}",
                                      current_track=new_profile.current_track_name,
                                      genre_count=len(new_profile.current_genres))

                        except Exception as bar_error:
                                session.rollback()
                                logger.error(f"Error processing bar {bar.id}", 
                                           error=str(bar_error))
                                continue

            except Exception as session_error:
                session.rollback()
                logger.error("Error in Spotify polling session", error=str(session_error))
                raise

    except Exception as task_error:
        logger.error("Spotify polling task failed", error=str(task_error))
        raise


@shared_task(name='barfindr.tasks.database_cleanup')
def database_cleanup():
    """
    Clean up bar genre profiles older than 24 hours.
    Helps manage database size and performance.
    """
    try:
        logger.info("Starting database cleanup task")
        
        with database_manager.get_session() as session:
            try:
                # Clean up bar genre profiles older than 24 hours
                profiles_cutoff_date = datetime.utcnow() - timedelta(hours=24)
                
                profile_cleanup_query = text("""
                    DELETE FROM clubfindr.bar_genre_profiles
                    WHERE timestamp < :cutoff_date
                """)
                
                profile_result = session.execute(profile_cleanup_query, {'cutoff_date': profiles_cutoff_date})
                
                session.commit()
                
                logger.info("Database cleanup completed", 
                            deleted_profiles=profile_result.rowcount)

            except Exception as session_error:
                session.rollback()
                logger.error("Error during database cleanup", error=str(session_error))
                raise

    except Exception as task_error:
        logger.error("Database cleanup task failed", error=str(task_error))
        raise

@shared_task(name='barfindr.tasks.update_genre_aggregates')
def update_genre_aggregates():
    """
    Update aggregated genre weights for bars based on recent genre profiles.
    This task calculates weighted averages of genres from recent profiles and
    updates the bar_genre_aggregates table.
    """
    try:
        logger.info("Starting genre aggregates update task")
        
        with database_manager.get_session() as session:
            try:
                # First, let's get some diagnostics
                profiles_check = text("""
                    SELECT COUNT(*) FROM clubfindr.bar_genre_profiles
                    WHERE timestamp > NOW() - INTERVAL '24 hours'
                    AND rolling_genre_profile IS NOT NULL
                """)
                
                profile_count = session.execute(profiles_check).scalar()
                logger.info(f"Found {profile_count} recent profiles with genre data")
                
                if profile_count == 0:
                    logger.warning("No recent profiles found, skipping genre aggregation")
                    return
                
                # Simplified approach: First get all recent profiles
                profiles_query = text("""
                    SELECT bar_id, rolling_genre_profile 
                    FROM clubfindr.bar_genre_profiles
                    WHERE timestamp > NOW() - INTERVAL '24 hours'
                    AND rolling_genre_profile IS NOT NULL
                """)
                
                profiles = session.execute(profiles_query).fetchall()
                
                # Process each bar's genres manually to avoid complex SQL
                bar_genres = {}
                
                for profile in profiles:
                    bar_id = profile.bar_id
                    if bar_id not in bar_genres:
                        bar_genres[bar_id] = {}
                    
                    # Extract genres and weights
                    genre_profile = profile.rolling_genre_profile
                    for genre, weight in genre_profile.items():
                        if genre not in bar_genres[bar_id]:
                            bar_genres[bar_id][genre] = []
                        
                        # Add this weight to the list for averaging
                        bar_genres[bar_id][genre].append(float(weight))
                
                # Process each bar and calculate averages
                for bar_id, genres in bar_genres.items():
                    for genre, weights in genres.items():
                        # Calculate average weight
                        avg_weight = sum(weights) / len(weights)
                        
                        # Only keep significant genres
                        if avg_weight >= 0.1:
                            # Check if this bar-genre pair already exists
                            check_query = text("""
                                SELECT id FROM clubfindr.bar_genre_aggregates
                                WHERE bar_id = :bar_id AND genre = :genre
                            """)
                            
                            existing = session.execute(check_query, {
                                'bar_id': bar_id,
                                'genre': genre
                            }).fetchone()
                            
                            if existing:
                                # Update existing record
                                update_query = text("""
                                    UPDATE clubfindr.bar_genre_aggregates
                                    SET weight = :weight, last_updated = CURRENT_TIMESTAMP
                                    WHERE bar_id = :bar_id AND genre = :genre
                                """)
                                
                                session.execute(update_query, {
                                    'bar_id': bar_id,
                                    'genre': genre,
                                    'weight': avg_weight
                                })
                                
                                logger.debug(f"Updated genre {genre} for bar {bar_id} with weight {avg_weight}")
                            else:
                                # Create new aggregate record
                                new_aggregate = BarGenreAggregate(
                                    bar_id=bar_id,
                                    genre=genre,
                                    weight=avg_weight,
                                    last_updated=datetime.utcnow()
                                )
                                session.add(new_aggregate)
                                
                                logger.debug(f"Added new genre {genre} for bar {bar_id} with weight {avg_weight}")
                
                # Clean up old/irrelevant genres (weight below threshold)
                cleanup_query = text("""
                    DELETE FROM clubfindr.bar_genre_aggregates
                    WHERE weight < 0.1
                """)
                
                cleanup_result = session.execute(cleanup_query)
                deleted_count = cleanup_result.rowcount
                
                # Commit all changes
                session.commit()
                
                logger.info("Genre aggregates update completed successfully", 
                            bars_processed=len(bar_genres),
                            old_records_removed=deleted_count)

            except Exception as session_error:
                session.rollback()
                logger.error("Error during genre aggregates update", error=str(session_error))
                raise

    except Exception as task_error:
        logger.error("Genre aggregates update task failed", error=str(task_error))
        raise