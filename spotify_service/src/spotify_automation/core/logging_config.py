import logging
import os
import sys
import traceback
from logging.handlers import RotatingFileHandler

def setup_logging(log_file="spotify_service.log"):
    """Configure logging with rotation and custom filter"""
    try:
        max_bytes = 10 * 1024 * 1024  # 10MB
        backup_count = 5

        # Get existing logger
        logger = logging.getLogger("spotify_service")

        # Define a filter for user-related logs
        class UserActionFilter(logging.Filter):
            def filter(self, record):
                # Always allow WARNING and ERROR logs
                if record.levelno >= logging.WARNING:
                    return True

                # For INFO logs, only allow specific user-related messages
                user_related_keywords = [
                    "Adding user",
                    "Successfully added user",
                    "Updated app info for user",
                    "Successfully added bar",
                    "Adding bar",
                    "Updated app info for bar",
                ]
                return any(keyword in record.msg for keyword in user_related_keywords)

        # Only set up if no handlers exist
        if not logger.handlers:
            # Ensure log directory exists
            log_dir = os.path.dirname(os.path.abspath(log_file))
            os.makedirs(log_dir, exist_ok=True)

            # Create handler with rotation
            handler = RotatingFileHandler(
                log_file, maxBytes=max_bytes, backupCount=backup_count
            )

            formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
            handler.setFormatter(formatter)
            handler.addFilter(UserActionFilter())

            # Add a console handler too
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(formatter)
            console_handler.addFilter(UserActionFilter())

            logger.setLevel(logging.INFO)
            logger.addHandler(handler)
            logger.addHandler(console_handler)

        return logger
    except Exception as e:
        print(f"Error setting up logging: {str(e)}")
        traceback.print_exc()
        return logging.getLogger("spotify_service")
