# src/barfindr/tasks.py
#
# The Spotify playback polling (spotify_genre_polling dispatching process_bar_batch) was
# retired on 2026-11-12 (ROADMAP section 1): venues describe themselves through the taste
# picker and their events, and SPOTIFY_CONNECT_ENABLED=false is live in production. The two
# remaining tasks wind the polled data down on their own: with no new rows arriving,
# update_genre_aggregates leaves bar_genre_aggregates empty after 24 hours and
# database_cleanup drains bar_genre_profiles, after which both run against empty tables.
from datetime import datetime, timedelta

import structlog
from celery import shared_task
from dotenv import load_dotenv
from sqlalchemy import text

from .database import database_manager

logger = structlog.get_logger()
load_dotenv()


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

                profile_cleanup_query = text(
                    """
                    DELETE FROM clubfindr.bar_genre_profiles
                    WHERE timestamp < :cutoff_date
                """
                )

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

                aggregation_query = text(
                    """
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
                """
                )

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
