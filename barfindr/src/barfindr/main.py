# src/barfindr/main.py
import os
from dotenv import load_dotenv
load_dotenv()
import structlog
from .database import database_manager

logger = structlog.get_logger()

def main():
    """Initialize services and verify connections"""
    logger.info("Initializing barfindr service")
    
    # Test database connection
    if database_manager.health_check():
        logger.info("Database connection successful")
    else:
        logger.error("Database connection failed")
        return False
    
    try:
        # Try importing spotify service
        from .spotify_service import spotify_service
        logger.info("Spotify service initialized",
                    polling_interval=spotify_service.polling_interval,
                    active_hours=spotify_service.active_hours)
    except ImportError as e:
        logger.error(f"Failed to import spotify_service: {str(e)}")
        # Continue without Spotify service for now
    
    try:
        # Try importing task scheduler
        from .task_scheduler import task_scheduler
        logger.info("Task scheduler ready",
                    worker_count=task_scheduler.worker_count)
    except ImportError as e:
        logger.error(f"Failed to import task_scheduler: {str(e)}")
        # Continue without task scheduler for now
    
    return True

if __name__ == "__main__":
    # Initialize all services
    success = main()
    
    if success:
        # Keep the process running
        import time
        try:
            logger.info("barfindr service is running")
            while True:
                time.sleep(60)
        except KeyboardInterrupt:
            logger.info("Shutting down...")
    else:
        logger.error("barfindr service failed to initialize")