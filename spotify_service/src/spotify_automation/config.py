import os
from dotenv import load_dotenv

# Load environment variables from .env file
# Try current directory first, then spotify_service root
load_dotenv()
if not os.getenv("SPOTIFY_EMAIL"):
    # Try looking in the spotify_service directory specifically
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up from src/spotify_automation to spotify_service/
    service_root = os.path.abspath(os.path.join(current_dir, "../../"))
    env_path = os.path.join(service_root, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)

print(f"DEBUG: DATABASE_URL set: {bool(os.getenv('DATABASE_URL'))}")

print(f"DEBUG: REDIS_URL: {os.getenv('REDIS_URL', 'Using default')}")


class Config:
    # Spotify Credentials
    SPOTIFY_EMAIL = os.getenv("SPOTIFY_EMAIL")
    SPOTIFY_PASSWORD = os.getenv("SPOTIFY_PASSWORD")

    # Database
    # Required; checked when the database connection is created
    DATABASE_URL = os.getenv("DATABASE_URL")

    # Celery
    # Using database 1 for spotify_automation to separate from barfindr (db 0)
    _redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/1")
    if "localhost" in _redis_url:
        _redis_url = _redis_url.replace("localhost", "127.0.0.1")
    REDIS_URL = _redis_url

    # Email
    EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
    EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
    EMAIL_SERVER = os.getenv("EMAIL_SERVER", "mail.spacemail.com")
    EMAIL_PORT = int(os.getenv("EMAIL_PORT", "993"))
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))

    # CAPTCHA
    CAPTCHA_API_KEY = os.getenv("CAPTCHA_API_KEY")

    # Browser
    # Default to system chromedriver if not specified
    CHROME_DRIVER_PATH = os.getenv("CHROME_DRIVER_PATH", "/usr/bin/chromedriver")
    HEADLESS = os.getenv("HEADLESS", "true").lower() == "true"

    # App Settings
    MAX_USERS_PER_APP = int(os.getenv("MAX_USERS_PER_APP", "25"))


config = Config()
