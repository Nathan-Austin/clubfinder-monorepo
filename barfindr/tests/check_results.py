# Create a test script: check_results.py
from barfindr.database import database_manager
from sqlalchemy import text
from datetime import datetime, timedelta


def check_results():
    print("Checking database for task results...")

    with database_manager.get_session() as session:
        try:
            # Check for recent profile entries
            cutoff = datetime.utcnow() - timedelta(hours=1)

            query = text(
                """
                SELECT COUNT(*) 
                FROM clubfindr.bar_genre_profiles
                WHERE timestamp > :cutoff
            """
            )

            count = session.execute(query, {"cutoff": cutoff}).scalar()
            print(f"Found {count} profiles created in the last hour")

            if count > 0:
                # Get some details about recent entries
                detail_query = text(
                    """
                    SELECT bar_id, timestamp, current_track_name, current_genres
                    FROM clubfindr.bar_genre_profiles
                    WHERE timestamp > :cutoff
                    ORDER BY timestamp DESC
                    LIMIT 5
                """
                )

                results = session.execute(detail_query, {"cutoff": cutoff}).fetchall()

                print("\nMost recent profiles:")
                for row in results:
                    print(
                        f"Bar {row.bar_id} at {row.timestamp}: {row.current_track_name}"
                    )
                    print(f"  Genres: {row.current_genres}")

        except Exception as e:
            print(f"Database query error: {str(e)}")


if __name__ == "__main__":
    check_results()
