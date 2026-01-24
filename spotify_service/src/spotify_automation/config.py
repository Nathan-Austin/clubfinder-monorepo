import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    # Spotify Credentials
    SPOTIFY_EMAIL = os.getenv("SPOTIFY_EMAIL")
    SPOTIFY_PASSWORD = os.getenv("SPOTIFY_PASSWORD")

    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:pass@localhost:5432/roh_db_dev")
    
    # Celery
    # Using database 1 for spotify_automation to separate from barfindr (db 0)
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/1")

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
