import structlog
from typing import Optional
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool
from ..config import config

logger = structlog.get_logger()


class DatabaseManager:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, "initialized"):
            self.connection_string = config.DATABASE_URL
            if not self.connection_string:
                raise RuntimeError(
                    "DATABASE_URL is not set; add it to spotify_service/.env "
                    "(see .env.example)"
                )
            if self.connection_string.startswith("postgres://"):
                self.connection_string = self.connection_string.replace(
                    "postgres://", "postgresql://", 1
                )

            # Extract host/db for logging (best effort)
            try:
                if "@" in self.connection_string:
                    self.host = self.connection_string.split("@")[1].split(":")[0]
                else:
                    self.host = "unknown"
                self.database = self.connection_string.split("/")[-1]
            except Exception:
                self.host = "unknown"
                self.database = "unknown"

            try:
                self.engine = create_engine(
                    self.connection_string,
                    poolclass=QueuePool,
                    pool_size=5,
                    max_overflow=2,
                    pool_timeout=30,
                    pool_recycle=1800,
                    echo=False,
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


# Singleton instance
database_manager = DatabaseManager()
