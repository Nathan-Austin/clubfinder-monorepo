import os
import logging
from typing import Optional

import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, scoped_session, declarative_base
from sqlalchemy.exc import SQLAlchemyError, OperationalError
from sqlalchemy.pool import QueuePool

# Create the declarative base
Base = declarative_base()

# Configure structured logging
logger = structlog.get_logger()


class DatabaseManager:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
        return cls._instance

    def __init__(
        self,
        host: str = None,
        port: int = None,
        database: str = None,
        user: str = None,
        password: str = None,
    ):
        if not hasattr(self, "initialized"):
            # Check for database URL in environment variable first
            db_url = os.getenv("DATABASE_URL")

            if db_url:
                # Use environment variable if available
                self.connection_string = db_url
                # Extract host for logging
                # Simple parsing, assumes format postgresql://user:pass@host:port/db
                try:
                    self.host = db_url.split("@")[1].split(":")[0]
                    self.database = db_url.split("/")[-1]
                except (IndexError, ValueError):
                    self.host = "unknown"
                    self.database = "unknown"
            else:
                # Fallback to parameters or defaults
                self.host = host or "localhost"
                self.port = port or 5432
                self.database = database or "clubfindr"
                self.user = user or "nathan"
                self.password = password or "nathan"

                self.connection_string = f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

            try:
                self.engine = create_engine(
                    self.connection_string,
                    poolclass=QueuePool,
                    pool_size=5,  # Adjust based on resource constraints
                    max_overflow=2,
                    pool_timeout=30,
                    pool_recycle=1800,  # 30 minutes
                    echo=False,  # Set to True for SQL logging
                )

                self.session_factory = sessionmaker(bind=self.engine)
                self.Session = scoped_session(self.session_factory)

                logger.info(
                    "Database connection initialized successfully",
                    host=self.host,
                    database=self.database,
                )

                self.initialized = True
            except Exception as e:
                logger.error("Failed to initialize database connection", error=str(e))
                raise

    def get_session(self):
        """Get a database session."""
        return self.Session()

    def health_check(self) -> bool:
        """Perform a health check on the database connection."""
        try:
            with self.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("Database health check passed")
            return True
        except OperationalError as e:
            logger.error("Database health check failed", error=str(e))
            return False

    def execute_query(self, query: str, params: Optional[dict] = None):
        """Execute a raw SQL query."""
        try:
            with self.engine.connect() as connection:
                result = connection.execute(text(query), params or {})
                return result
        except SQLAlchemyError as e:
            logger.error("Query execution failed", query=query, error=str(e))
            raise

    def close(self):
        """Close all database connections."""
        self.Session.remove()
        self.engine.dispose()
        logger.info("Database connections closed")


# Singleton instance for easy import
database_manager = DatabaseManager()
