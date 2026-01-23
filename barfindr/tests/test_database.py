# tests/test_database.py
from src.barfindr.database import database_manager
from sqlalchemy import text
import os


def test_database():
    # Print connection information
    print("Database Connection Details:")
    print(f"DATABASE_URL: {os.environ.get('DATABASE_URL', 'Not set in environment')}")

    # Test basic connectivity
    try:
        print("\nTesting database health check...")
        health = database_manager.health_check()
        print(f"Database health check: {'PASSED' if health else 'FAILED'}")

        if not health:
            print("Health check failed - aborting further tests")
            return

        # Test more specific database operations
        with database_manager.get_session() as session:
            try:
                # Try to execute a simple query
                print("\nTesting simple query execution...")
                result = session.execute(text("SELECT 1 as test_value")).fetchone()
                print(f"Query result: {result.test_value}")

                # Check if key tables exist
                print("\nChecking for required tables...")
                try:
                    tables_query = text(
                        """
                        SELECT table_name 
                        FROM information_schema.tables 
                        WHERE table_schema = 'clubfindr'
                    """
                    )
                    tables = session.execute(tables_query).fetchall()
                    if tables:
                        print(f"Found {len(tables)} tables in clubfindr schema:")
                        for table in tables:
                            print(f"  - {table.table_name}")
                    else:
                        print("No tables found in clubfindr schema")

                except Exception as e:
                    print(f"Error checking tables: {str(e)}")

            except Exception as e:
                print(f"Session query error: {str(e)}")
                raise

    except Exception as e:
        print(f"Database test error: {str(e)}")
        raise

    print("\nDatabase tests completed")


if __name__ == "__main__":
    test_database()
