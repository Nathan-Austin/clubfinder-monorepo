# tests/test_genre_aggregates.py
import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text

from src.barfindr.database import database_manager
from src.barfindr.tasks import update_genre_aggregates


def check_profiles_data():
    """
    Check if the bar_genre_profiles table has data that can be aggregated.
    """
    print("Checking bar_genre_profiles table for recent data...")

    with database_manager.get_session() as session:
        try:
            # Check for recent profiles
            cutoff = datetime.utcnow() - timedelta(hours=24)

            query = text(
                """
                SELECT COUNT(*) 
                FROM clubfindr.bar_genre_profiles
                WHERE timestamp > :cutoff
                AND rolling_genre_profile IS NOT NULL
            """
            )

            count = session.execute(query, {"cutoff": cutoff}).scalar()
            print(
                f"Found {count} profiles created in the last 24 hours with genre data"
            )

            if count > 0:
                # Get a sample profile to inspect
                sample_query = text(
                    """
                    SELECT bar_id, timestamp, rolling_genre_profile
                    FROM clubfindr.bar_genre_profiles
                    WHERE timestamp > :cutoff
                    AND rolling_genre_profile IS NOT NULL
                    ORDER BY timestamp DESC
                    LIMIT 1
                """
                )

                sample = session.execute(sample_query, {"cutoff": cutoff}).fetchone()

                if sample:
                    print("\nSample recent profile:")
                    print(f"Bar ID: {sample.bar_id}")
                    print(f"Timestamp: {sample.timestamp}")
                    print(
                        f"Genre Profile: {json.dumps(sample.rolling_genre_profile, indent=2)}"
                    )

                    return True

            return count > 0

        except Exception as e:
            print(f"Error checking profiles: {str(e)}")
            return False


def check_aggregates_table():
    """Check if the bar_genre_aggregates table exists and has any data."""
    print("\nChecking bar_genre_aggregates table...")

    with database_manager.get_session() as session:
        try:
            # Check if table exists
            table_query = text(
                """
                SELECT EXISTS (
                    SELECT 1 
                    FROM information_schema.tables 
                    WHERE table_schema = 'clubfindr' 
                    AND table_name = 'bar_genre_aggregates'
                )
            """
            )

            table_exists = session.execute(table_query).scalar()

            if not table_exists:
                print("Table bar_genre_aggregates does not exist!")
                return False

            # Check row count
            count_query = text("SELECT COUNT(*) FROM clubfindr.bar_genre_aggregates")
            count = session.execute(count_query).scalar()

            print(f"Found {count} records in bar_genre_aggregates table")

            if count > 0:
                # Get a sample
                sample_query = text(
                    """
                    SELECT bar_id, genre, weight, last_updated 
                    FROM clubfindr.bar_genre_aggregates
                    LIMIT 5
                """
                )

                samples = session.execute(sample_query).fetchall()

                print("\nSample records:")
                for row in samples:
                    print(
                        f"Bar {row.bar_id} | Genre: {row.genre} | Weight: {row.weight} | Updated: {row.last_updated}"
                    )

            return True

        except Exception as e:
            print(f"Error checking aggregates table: {str(e)}")
            return False


def run_aggregate_task():
    """Run the update_genre_aggregates task directly."""
    print("\nRunning update_genre_aggregates task manually...")

    try:
        update_genre_aggregates()
        print("Task completed successfully")
        return True
    except Exception as e:
        print(f"Task failed: {str(e)}")
        import traceback

        traceback.print_exc()
        return False


def create_test_data():
    """Create test data if needed."""
    print("\nChecking if we need to create test data...")

    with database_manager.get_session() as session:
        try:
            # Check if we have any profiles
            profiles_query = text("SELECT COUNT(*) FROM clubfindr.bar_genre_profiles")
            profile_count = session.execute(profiles_query).scalar()

            if profile_count > 0:
                print(
                    f"Found {profile_count} existing profiles, no need to create test data"
                )
                return False

            print("No profiles found, creating test data...")

            # Get some bar IDs to use
            bars_query = text(
                """
                SELECT id FROM clubfindr.bars 
                WHERE music_service = 'spotify'
                LIMIT 3
            """
            )

            bars = session.execute(bars_query).fetchall()

            if not bars:
                print(
                    "No bars found with music_service = 'spotify'. Cannot create test data."
                )
                return False

            # Create test profiles for each bar
            for bar in bars:
                bar_id = bar.id

                # Create sample genre profiles
                genres = {
                    "rock": 0.3,
                    "pop": 0.2,
                    "electronic": 0.15,
                    "hip-hop": 0.25,
                    "jazz": 0.1,
                }

                # Create profile from 2 hours ago
                timestamp1 = datetime.utcnow() - timedelta(hours=2)

                create_query = text(
                    """
                    INSERT INTO clubfindr.bar_genre_profiles
                    (id, bar_id, timestamp, current_track_id, current_track_name, 
                     current_genres, rolling_genre_profile, immediate_genre_profile, track_counts)
                    VALUES
                    (:id, :bar_id, :timestamp, :track_id, :track_name,
                     :current_genres, :rolling_profile, :immediate_profile, :track_counts)
                """
                )

                session.execute(
                    create_query,
                    {
                        "id": uuid.uuid4(),
                        "bar_id": bar_id,
                        "timestamp": timestamp1,
                        "track_id": f"track_{bar_id}_1",
                        "track_name": "Test Track 1",
                        "current_genres": json.dumps(["rock", "pop"]),
                        "rolling_profile": json.dumps(genres),
                        "immediate_profile": json.dumps(genres),
                        "track_counts": json.dumps({"recent": 10, "queued": 5}),
                    },
                )

                # Create a more recent profile with slightly different genres
                genres2 = {
                    "rock": 0.35,
                    "pop": 0.15,
                    "electronic": 0.2,
                    "hip-hop": 0.2,
                    "jazz": 0.1,
                }

                timestamp2 = datetime.utcnow() - timedelta(minutes=30)

                session.execute(
                    create_query,
                    {
                        "id": uuid.uuid4(),
                        "bar_id": bar_id,
                        "timestamp": timestamp2,
                        "track_id": f"track_{bar_id}_2",
                        "track_name": "Test Track 2",
                        "current_genres": json.dumps(["rock", "electronic"]),
                        "rolling_profile": json.dumps(genres2),
                        "immediate_profile": json.dumps(genres2),
                        "track_counts": json.dumps({"recent": 12, "queued": 3}),
                    },
                )

            session.commit()
            print(f"Created test profiles for {len(bars)} bars")
            return True

        except Exception as e:
            session.rollback()
            print(f"Error creating test data: {str(e)}")
            import traceback

            traceback.print_exc()
            return False


if __name__ == "__main__":
    print("Genre Aggregates Task Diagnostic Tool")
    print("=====================================")

    # Step 1: Check for existing data
    has_profiles = check_profiles_data()

    # Step 2: Create test data if needed
    if not has_profiles:
        created = create_test_data()
        if created:
            print("\nCreated test data, checking again...")
            has_profiles = check_profiles_data()

    # Step 3: Check if aggregates table is properly set up
    check_aggregates_table()

    # Step 4: Run the task if we have profiles
    if has_profiles:
        run_aggregate_task()

        # Step 5: Check results after running
        print("\nChecking results after running task:")
        check_aggregates_table()
    else:
        print("\nNo profile data available. Cannot test aggregation.")
