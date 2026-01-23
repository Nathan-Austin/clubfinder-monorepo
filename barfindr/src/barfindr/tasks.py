# src/barfindr/tasks.py
import asyncio
import os
from datetime import datetime, timedelta

import structlog
from celery import shared_task
from dotenv import load_dotenv
from sqlalchemy import text

from .database import database_manager
from .encryption import encryption_service
from .models.bar_profile import BarGenreAggregate, BarGenreProfile
from .spotify_service import spotify_service

logger = structlog.get_logger()
load_dotenv()


@shared_task(name="barfindr.tasks.process_bar_batch")
def process_bar_batch(bar_ids):
    """
    Worker Task: Process a batch of bars.
    Fetches details, polls Spotify, and updates profiles.
    """
    logger.info(f"Processing batch of {len(bar_ids)} bars")

    # Get redirect URI here
    redirect_uri = os.getenv(
        "SPOTIFY_REDIRECT_URI", "https://www.clubfindr.com/spotify/login"
    )

    with database_manager.get_session() as session:
        try:
            # Fetch details only for this batch
            # We need the JOIN to get app credentials
            batch_query = text("""
                SELECT b.id, b.spotify_access_token, b.spotify_refresh_token, 
                       b.spotify_app_name, b.music_service,
                       a.client_id, a.client_secret
                FROM clubfindr.bars b
                JOIN clubfindr.spotify_apps a ON b.spotify_app_name = a.app_name
                WHERE b.id = ANY(:bar_ids)
            """)

            # Convert UUID strings back to UUID objects if needed,
            # but SQLAlchemy often handles string lists for UUID columns nicely.
            # Safe bet is to pass them as they come (usually strings from Celery).
            bars = session.execute(batch_query, {"bar_ids": bar_ids}).fetchall()

            for bar in bars:
                try:
                    # Decrypt tokens
                    access_token = encryption_service.decrypt_token(
                        bar.spotify_access_token
                    ).decode()
                    refresh_token = encryption_service.decrypt_token(
                        bar.spotify_refresh_token
                    ).decode()

                    # Get comprehensive music profile
                    profile_data = asyncio.run(
                        spotify_service.get_bar_music_profile(
                            bar.id,
                            bar.client_id,
                            bar.client_secret,
                            redirect_uri,
                            access_token,
                            refresh_token,
                        )
                    )

                    if not profile_data:
                        logger.info(f"No profile data for bar {bar.id}")
                        continue

                    # Update tokens if refreshed
                    if profile_data.get("new_token_info"):
                        try:
                            encrypted_access = encryption_service.encrypt_token(
                                profile_data["new_token_info"]["access_token"]
                            )
                            encrypted_refresh = encryption_service.encrypt_token(
                                profile_data["new_token_info"]["refresh_token"]
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
                                    "access_token": encrypted_access,
                                    "refresh_token": encrypted_refresh,
                                    "bar_id": bar.id,
                                },
                            )
                        except ValueError as e:
                            logger.error(
                                f"Failed to encrypt new tokens for bar {bar.id}",
                                error=str(e),
                            )

                    # Create new profile record
                    new_profile = BarGenreProfile(
                        bar_id=bar.id,
                        timestamp=datetime.fromisoformat(profile_data["timestamp"]),
                        current_track_id=(
                            profile_data["current_track"]["id"]
                            if profile_data["current_track"]
                            else None
                        ),
                        current_track_name=(
                            profile_data["current_track"]["name"]
                            if profile_data["current_track"]
                            else None
                        ),
                        current_genres=profile_data["current_genres"],
                        rolling_genre_profile=profile_data["rolling_genre_profile"],
                        immediate_genre_profile=profile_data["immediate_genre_profile"],
                        track_counts=profile_data["track_counts"],
                    )

                    session.add(new_profile)
                    # Commit per bar to ensure partial batch success
                    session.commit()

                    logger.info(
                        f"Successfully recorded genre profile for bar {bar.id}",
                        current_track=new_profile.current_track_name,
                    )

                except Exception as bar_error:
                    session.rollback()
                    logger.error(f"Error processing bar {bar.id}", error=str(bar_error))
                    continue

        except Exception as e:
            logger.error("Error in process_bar_batch", error=str(e))
            raise


@shared_task(name="barfindr.tasks.spotify_genre_polling")
def spotify_genre_polling():
    """
    Dispatcher Task:
    1. Finds all active bars.
    2. Chunks them into batches.
    3. Dispatches `process_bar_batch` tasks.
    """
    try:
        # Check if within active hours
        if (
            hasattr(spotify_service, "_is_within_active_hours")
            and not spotify_service._is_within_active_hours()
        ):
            logger.info("Outside active hours, skipping Spotify polling")
            return

        logger.info("Starting Spotify genre polling dispatcher")

        with database_manager.get_session() as session:
            # Query just the IDs of active bars
            active_bars_query = text("""
                SELECT b.id
                FROM clubfindr.bars b
                WHERE LOWER(b.music_service) = 'spotify' 
                AND b.spotify_access_token IS NOT NULL
            """)

            result = session.execute(active_bars_query).fetchall()
            bar_ids = [str(row.id) for row in result]

            total_bars = len(bar_ids)
            logger.info(f"Found {total_bars} active bars")

            if total_bars == 0:
                return

            # Chunk size configuration (default 10)
            chunk_size = 10

            # Dispatch batches
            for i in range(0, total_bars, chunk_size):
                chunk = bar_ids[i : i + chunk_size]
                process_bar_batch.delay(chunk)

            logger.info(f"Dispatched {len(range(0, total_bars, chunk_size))} batches")

    except Exception as task_error:
        logger.error("Spotify polling dispatcher failed", error=str(task_error))
        raise


@shared_task(name="barfindr.tasks.database_cleanup")
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

                profile_result = session.execute(
                    profile_cleanup_query, {"cutoff_date": profiles_cutoff_date}
                )

                session.commit()

                logger.info(
                    "Database cleanup completed",
                    deleted_profiles=profile_result.rowcount,
                )

            except Exception as session_error:
                session.rollback()
                logger.error("Error during database cleanup", error=str(session_error))
                raise

    except Exception as task_error:
        logger.error("Database cleanup task failed", error=str(task_error))
        raise


@shared_task(name="barfindr.tasks.update_genre_aggregates")
def update_genre_aggregates():
    """
    Update aggregated genre weights using SQL-based aggregation.
    Replaces the entire table content with fresh averages from the last 24h.
    """
    try:
        logger.info("Starting SQL-based genre aggregates update")

        with database_manager.get_session() as session:
            try:
                # 1. Clear existing aggregates (Full Refresh strategy is safer/cleaner here)
                #    Alternatively, we could do UPSERT, but full refresh ensures
                #    we don't keep stale genres that dropped below 0.1
                session.execute(text("DELETE FROM clubfindr.bar_genre_aggregates"))

                # 2. Insert new aggregates directly from JSONB data
                #    Logic:
                #    - Filter profiles from last 24h
                #    - Expand JSONB keys/values (genre/weight)
                #    - Group by bar_id and genre
                #    - Calculate AVG weight
                #    - Filter HAVING avg_weight >= 0.1

                aggregation_query = text("""
                    INSERT INTO clubfindr.bar_genre_aggregates (bar_id, genre, weight)
                    SELECT 
                        p.bar_id,
                        key as genre,
                        AVG(value::float) as weight
                    FROM 
                        clubfindr.bar_genre_profiles p,
                        jsonb_each_text(p.rolling_genre_profile)
                    WHERE 
                        p.timestamp > NOW() - INTERVAL '24 hours'
                    GROUP BY 
                        p.bar_id, key
                    HAVING 
                        AVG(value::float) >= 0.1
                """)

                result = session.execute(aggregation_query)
                row_count = result.rowcount

                session.commit()

                logger.info(
                    "Genre aggregates update completed", rows_inserted=row_count
                )

            except Exception as session_error:
                session.rollback()
                logger.error(
                    "Error during genre aggregates update", error=str(session_error)
                )
                raise

    except Exception as task_error:
        logger.error("Genre aggregates update task failed", error=str(task_error))
        raise
