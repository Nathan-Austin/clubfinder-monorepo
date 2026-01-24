"""
Spotify User Management Service - On-Demand Version
This service opens the browser only when needed and closes it after each operation.
"""

import traceback
from flask import Flask, request, jsonify
import psycopg2
from psycopg2.extras import RealDictCursor
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
import random
import time
import json
import logging
from logging.handlers import RotatingFileHandler
import threading
import signal
from datetime import datetime, timedelta
import os
import sys
import re
import glob
import psutil
import shutil
import imaplib
import email
from email.header import decode_header
import chardet
import gc
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Initialize Flask app
app = Flask(__name__)


# Configure logging
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


# Global variables
logger = setup_logging()
config = None

# Database Schema verification
SCHEMA = """
DO $$ 
BEGIN
    -- Verify spotify_app_name column exists in users table
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'clubfindr' 
        AND table_name = 'users' 
        AND column_name = 'spotify_app_name'
    ) THEN
        ALTER TABLE clubfindr.users ADD COLUMN spotify_app_name VARCHAR(255);
    END IF;
    
    -- Verify spotify_app_name column exists in bars table
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'clubfindr' 
        AND table_name = 'bars' 
        AND column_name = 'spotify_app_name'
    ) THEN
        ALTER TABLE clubfindr.bars ADD COLUMN spotify_app_name VARCHAR(255);
    END IF;
    
    -- Verify spotify_email column exists in bars table
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'clubfindr' 
        AND table_name = 'bars' 
        AND column_name = 'spotify_email'
    ) THEN
        ALTER TABLE clubfindr.bars ADD COLUMN spotify_email VARCHAR(255);
    END IF;
    
    -- Verify app_type column exists in spotify_apps table
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'clubfindr' 
        AND table_name = 'spotify_apps' 
        AND column_name = 'app_type'
    ) THEN
        ALTER TABLE clubfindr.spotify_apps ADD COLUMN app_type VARCHAR(50) DEFAULT 'user';
    END IF;
    
    -- Verify app_id column exists in spotify_apps table
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'clubfindr' 
        AND table_name = 'spotify_apps' 
        AND column_name = 'app_id'
    ) THEN
        ALTER TABLE clubfindr.spotify_apps ADD COLUMN app_id VARCHAR(32);
    END IF;
END $$;
"""


class BrokenPipeProtection:
    def __init__(self, original_stream):
        self.original_stream = original_stream

    def write(self, data):
        try:
            self.original_stream.write(data)
            self.original_stream.flush()
        except BrokenPipeError:
            # Silently handle broken pipe
            pass
        except Exception as e:
            # Log other exceptions to a file instead of stdout/stderr
            with open("stream_errors.log", "a") as f:
                f.write(f"Stream error: {str(e)}\n")

    def flush(self):
        try:
            self.original_stream.flush()
        except BrokenPipeError:
            pass
        except Exception:
            pass

    def __getattr__(self, attr):
        return getattr(self.original_stream, attr)


class EmailVerificationHandler:
    def __init__(
        self,
        email_address,
        email_password,
        imap_server="mail.spacemail.com",
        imap_port=993,
    ):
        self.email_address = email_address
        self.email_password = email_password
        self.imap_server = imap_server
        self.imap_port = imap_port
        self.mail = None

    sys.stdout = BrokenPipeProtection(sys.stdout)
    sys.stderr = BrokenPipeProtection(sys.stderr)

    def decode_text(self, text, default_encoding="utf-8"):
        """Safely decode text with multiple encoding attempts"""
        if isinstance(text, str):
            return text

        if isinstance(text, bytes):
            # Try chardet first
            detected = chardet.detect(text)
            if detected and detected["confidence"] > 0.5:
                try:
                    return text.decode(detected["encoding"])
                except:
                    pass
                    # Try common encodings
            encodings = ["utf-8", "latin-1", "iso-8859-1", "ascii", "windows-1252"]
            for encoding in encodings:
                try:
                    return text.decode(encoding)
                except:
                    continue
                    # Fall back to replacing invalid characters
            return text.decode(default_encoding, errors="replace")

        return str(text)

    def get_email_content(self, email_message):
        """Safely extract email content handling various encodings"""
        try:
            # Get subject
            subject = email_message.get("Subject", "")
            if subject:
                decoded_header = decode_header(subject)[0]
                subject_text = decoded_header[0]
                encoding = decoded_header[1]
                if encoding:
                    try:
                        subject = subject_text.decode(encoding)
                    except:
                        subject = self.decode_text(subject_text)
                else:
                    subject = self.decode_text(subject_text)
            print(f"Processing email with subject: {subject}")
            # Get body
            body = ""
            if email_message.is_multipart():
                for part in email_message.walk():
                    if part.get_content_type() == "text/plain":
                        try:
                            payload = part.get_payload(decode=True)
                            body = self.decode_text(payload)
                            break
                        except Exception as e:
                            print(f"Error decoding multipart: {str(e)}")
                            continue
            else:
                try:
                    payload = email_message.get_payload(decode=True)
                    body = self.decode_text(payload)
                except Exception as e:
                    print(f"Error decoding body: {str(e)}")
            return subject, body
        except Exception as e:
            print(f"Error getting email content: {str(e)}")
            return "", ""

    def get_verification_code(self, wait_time=120, check_interval=10):
        """
        Monitor inbox for Spotify verification code with improved handling for Snap/venv.

        Args:
            wait_time (int): Total time to wait for code in seconds
            check_interval (int): How often to check for new emails

        Returns:
            str: Verification code if found, None otherwise
        """
        import logging

        logger = logging.getLogger(__name__)

        try:
            if not self.mail:
                logger.info("No active email connection, attempting to connect")
                if not self.connect():
                    logger.error("Failed to connect to email server")
                    return None

            # Record start time to only accept emails newer than this
            from datetime import datetime

            start_timestamp = datetime.now()
            logger.info(f"Monitoring inbox for Spotify verification code...")
            logger.info(
                f"Will only consider emails after {start_timestamp.strftime('%H:%M:%S')}"
            )

            import time

            start_time = time.time()
            last_check_time = 0
            email_check_count = 0

            while time.time() - start_time < wait_time:
                try:
                    current_time = time.time()
                    # Only log periodically to avoid excessive output
                    if current_time - last_check_time >= check_interval:
                        remaining_time = wait_time - (current_time - start_time)
                        logger.info(
                            f"Waiting for verification code... {int(remaining_time)}s remaining"
                        )
                        last_check_time = current_time
                        email_check_count += 1

                        # Check inbox
                        try:
                            self.mail.select("INBOX")
                            date = datetime.now().strftime("%d-%b-%Y")

                            # Look for emails from Spotify with verification code in subject
                            # Try multiple search patterns to increase chances of finding it
                            search_patterns = [
                                '(ON {date} FROM "Spotify" SUBJECT "Anmeldecode")',
                                '(ON {date} FROM "Spotify" SUBJECT "code")',
                                '(ON {date} FROM "Spotify" SUBJECT "verification")',
                                '(SINCE {date} FROM "Spotify")',
                            ]

                            for pattern in search_patterns:
                                try:
                                    _, messages = self.mail.search(
                                        None, pattern.format(date=date)
                                    )
                                    if messages and messages[0]:
                                        break
                                except Exception as search_error:
                                    logger.warning(
                                        f"Search pattern failed: {str(search_error)}"
                                    )
                                    continue

                            if messages and messages[0]:
                                email_ids = messages[0].split()
                                # Process newest emails first (reversed)
                                for email_id in reversed(email_ids):
                                    try:
                                        _, msg = self.mail.fetch(email_id, "(RFC822)")
                                        email_body = msg[0][1]
                                        email_message = email.message_from_bytes(
                                            email_body
                                        )

                                        # Get email content safely
                                        subject, body = self.get_email_content(
                                            email_message
                                        )

                                        # Extract verification code using multiple patterns
                                        code_patterns = [
                                            r"(\d{6})",  # Exactly 6 digits
                                            r"\*\*(\d{6})\*\*",  # 6 digits between asterisks
                                            r"code[:\s]+(\d{6})",  # "code" followed by 6 digits
                                            r"verification[:\s]+(\d{6})",  # "verification" followed by 6 digits
                                        ]

                                        for pattern in code_patterns:
                                            # Check subject
                                            match = re.search(pattern, subject)
                                            if match:
                                                code = (
                                                    match.group(1)
                                                    if len(match.groups()) > 0
                                                    else match.group(0)
                                                )
                                                logger.info(
                                                    f"Found verification code in subject: {code}"
                                                )
                                                return code

                                            # Check body
                                            if body:
                                                match = re.search(pattern, body)
                                                if match:
                                                    code = (
                                                        match.group(1)
                                                        if len(match.groups()) > 0
                                                        else match.group(0)
                                                    )
                                                    logger.info(
                                                        f"Found verification code in body: {code}"
                                                    )
                                                    return code

                                    except Exception as email_error:
                                        logger.error(
                                            f"Error processing email: {str(email_error)}"
                                        )
                                        continue
                        except Exception as inbox_error:
                            logger.error(f"Error checking inbox: {str(inbox_error)}")
                            # Try to reconnect if there's an issue
                            try:
                                self.mail.close()
                                self.mail.logout()
                            except:
                                pass
                            self.mail = None
                            if not self.connect():
                                logger.error("Failed to reconnect to email server")
                                time.sleep(check_interval)

                    # Short sleep between iterations to prevent CPU spin
                    time.sleep(1)

                except Exception as e:
                    logger.error(f"Error in verification code loop: {str(e)}")
                    time.sleep(check_interval)

            logger.info("Timeout waiting for verification code")
            return None

        except Exception as e:
            logger.error(f"Error in get_verification_code: {str(e)}")
            return None

        finally:
            try:
                if self.mail:
                    self.mail.close()
                    self.mail.logout()
            except:
                pass

    def connect(self):
        """Establish connection to email server with better error handling for Snap/venv"""
        try:
            # Use logger instead of direct print to avoid broken pipe issues
            import logging

            logger = logging.getLogger(__name__)
            logger.info(f"Connecting to {self.imap_server}...")

            # Use socket timeout to prevent hanging connections
            import socket

            default_timeout = socket.getdefaulttimeout()
            socket.setdefaulttimeout(30)  # 30 second timeout

            try:
                # Create a new IMAP connection with explicit timeout
                self.mail = imaplib.IMAP4_SSL(self.imap_server, self.imap_port)
                self.mail.login(self.email_address, self.email_password)
                logger.info("Successfully connected to email server")
                return True
            finally:
                # Restore default timeout
                socket.setdefaulttimeout(default_timeout)

        except Exception as e:
            # Log error instead of printing
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Connection failed: {str(e)}")

            # Handle specific errors
            if "Broken pipe" in str(e):
                logger.error(
                    "Broken pipe detected - likely an issue with containerized environment"
                )
            elif "Connection refused" in str(e):
                logger.error(
                    "Connection refused - email server may be blocking requests"
                )
            elif "Authentication failed" in str(e):
                logger.error("Authentication failed - check credentials")

            return False


class BrowserSession:
    def __init__(self, config_path="config.json"):
        # Get the logger (do NOT add handlers here)
        self.logger = logging.getLogger("spotify_service.browser_session")
        self.logger.info("BrowserSession __init__ started")

        self.config = None
        try:
            self.load_config(config_path)
        except Exception as e:
            self.logger.error(f"Failed to load config: {str(e)}")
            return

        self.screenshots_dir = "screenshots"
        self.driver = None
        self.wait = None
        self.db = None
        self.cursor = None
        self.is_logged_in = False
        self.current_app = None
        self.last_activity = datetime.now()
        self.MAX_USERS = 25
        self.current_verification_code = None

        # Create screenshots directory
        os.makedirs(self.screenshots_dir, exist_ok=True)

        self.logger.info("BrowserSession __init__ finished")

    def load_config(self, config_path):
        """Load configuration from Environment Variables (preferred) or JSON file"""
        try:
            # Try loading from file first to populate self.config structure
            # This maintains backward compatibility but allows env var overrides
            self.config = {}
            if os.path.exists(config_path):
                try:
                    with open(config_path, "r") as f:
                        self.config = json.load(f)
                except Exception as e:
                    self.logger.warning(
                        f"Could not load config file {config_path}: {e}"
                    )

            # Override with Environment Variables
            self.email = os.getenv("SPOTIFY_EMAIL", self.config.get("spotify_email"))
            self.password = os.getenv(
                "SPOTIFY_PASSWORD", self.config.get("spotify_password")
            )

            # Email Config - careful to handle nested dicts if config file was loaded
            email_section = self.config.get("email", {})
            self.email_config = {
                "address": os.getenv("EMAIL_ADDRESS", email_section.get("address")),
                "password": os.getenv("EMAIL_PASSWORD", email_section.get("password")),
                "server": os.getenv(
                    "EMAIL_SERVER", email_section.get("server", "mail.spacemail.com")
                ),
                "port": int(os.getenv("EMAIL_PORT", email_section.get("port", 993))),
                "smtp_port": int(
                    os.getenv("SMTP_PORT", email_section.get("smtp_port", 587))
                ),
            }

            # Database Config
            db_section = self.config.get("database", {})
            self.db_config = {
                "host": os.getenv("DB_HOST", db_section.get("host")),
                "database": os.getenv("DB_NAME", db_section.get("database")),
                "user": os.getenv("DB_USER", db_section.get("user")),
                "password": os.getenv("DB_PASSWORD", db_section.get("password")),
            }

            # CAPTCHA Config
            captcha_key = os.getenv("CAPTCHA_API_KEY")
            if captcha_key:
                self.captcha_config = {"api_key": captcha_key}
                self.captcha_api_key = captcha_key
            elif "captcha" in self.config:
                self.captcha_config = self.config["captcha"]
                self.captcha_api_key = self.captcha_config.get("api_key")
            else:
                self.captcha_config = None
                self.captcha_api_key = None

            # Validation
            if not self.email or not self.password:
                self.logger.error(
                    "Missing required Spotify credentials (SPOTIFY_EMAIL, SPOTIFY_PASSWORD)"
                )
                return False

            return True
        except Exception as e:
            self.logger.error(f"Failed to load config: {str(e)}")
            return False

    def connect_db(self):
        """Connect to the database"""
        try:
            if self.db and hasattr(self.db, "closed") and not self.db.closed:
                # Already connected
                return True

            self.db = psycopg2.connect(
                host=self.db_config["host"],
                database=self.db_config["database"],
                user=self.db_config["user"],
                password=self.db_config["password"],
            )
            self.cursor = self.db.cursor(cursor_factory=RealDictCursor)
            self.logger.info("Successfully connected to database")
            return True
        except Exception as e:
            self.logger.error(f"Database connection error: {str(e)}")
            return False

    def close_db(self):
        """Close database connection"""
        try:
            if self.db and hasattr(self.db, "closed") and not self.db.closed:
                self.db.close()
                self.db = None
                self.cursor = None
                self.logger.info("Database connection closed")
        except Exception as e:
            self.logger.error(f"Error closing database: {str(e)}")

    def initialize_browser(self):
        """Initialize browser for a new session"""
        try:
            # First run cleanup to ensure no leftover browsers
            from cleanup import cleanup_processes

            cleanup_processes()

            self.logger.info("Initializing browser for a new session")

            # Create Chrome options
            from selenium.webdriver.chrome.options import Options

            options = Options()

            # Set up chrome directories
            base_dir = os.path.dirname(os.path.abspath(__file__))
            user_data_dir = os.path.join(base_dir, "chrome_profile")
            cache_dir = os.path.join(base_dir, "chrome_cache")

            # Ensure directories exist with proper permissions
            for directory in [user_data_dir, cache_dir]:
                os.makedirs(directory, exist_ok=True)
                os.chmod(directory, 0o755)

            # Configure Chrome options
            options.add_argument(f"--user-data-dir={user_data_dir}")
            options.add_argument(f"--disk-cache-dir={cache_dir}")
            options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--disable-extensions")
            options.add_argument("--window-size=1920,1080")

            # Enhanced anti-detection options
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument(
                f"--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)

            # Additional anti-bot detection preferences
            prefs = {
                "profile.default_content_setting_values.notifications": 2,
                "credentials_enable_service": False,
                "profile.password_manager_enabled": False,
                "profile.default_content_settings.popups": 0,
                "profile.managed_default_content_settings.images": 1,
            }
            options.add_experimental_option("prefs", prefs)

            # Try multiple approaches to create the driver
            try:
                # First try Snap ChromeDriver
                chromedriver_path = "/snap/bin/chromium.chromedriver"
                if os.path.exists(chromedriver_path):
                    self.logger.info(f"Using Snap ChromeDriver at: {chromedriver_path}")
                    service = Service(executable_path=chromedriver_path)
                    self.driver = webdriver.Chrome(service=service, options=options)
                    self.logger.info(
                        "Successfully created Chrome driver using Snap ChromeDriver"
                    )
                else:
                    # Try local bin directory
                    local_driver = os.path.join(base_dir, "bin", "chromedriver")
                    if os.path.exists(local_driver):
                        self.logger.info(f"Using local ChromeDriver at: {local_driver}")
                        service = Service(executable_path=local_driver)
                        self.driver = webdriver.Chrome(service=service, options=options)
                        self.logger.info(
                            "Successfully created Chrome driver using local ChromeDriver"
                        )
                    else:
                        # Let selenium find chromedriver
                        self.logger.info("Using automatic ChromeDriver detection")
                        self.driver = webdriver.Chrome(options=options)
                        self.logger.info(
                            "Successfully created Chrome driver using automatic detection"
                        )
            except Exception as e:
                self.logger.error(f"Error creating Chrome driver: {str(e)}")
                raise

            # Set timeouts and create wait
            self.driver.set_page_load_timeout(30)
            self.driver.set_script_timeout(30)
            self.wait = WebDriverWait(self.driver, 30)

            self.logger.info("Browser successfully initialized")
            return True
        except Exception as e:
            self.logger.error(f"Failed to initialize browser: {str(e)}")
            # Ensure cleanup if initialization fails
            self.close_browser()
            return False

    def close_browser(self):
        """Close browser and clean up resources"""
        try:
            self.logger.info("Closing browser session")

            # Quit the driver if it exists
            if self.driver:
                try:
                    self.driver.quit()
                    self.logger.info("Browser quit successfully")
                except Exception as e:
                    self.logger.error(f"Error quitting browser: {str(e)}")
                finally:
                    self.driver = None
                    self.wait = None

            # Run cleanup to ensure all processes are terminated
            try:
                from cleanup import cleanup_processes

                cleanup_processes()
                self.logger.info("Cleanup processes executed")
            except Exception as e:
                self.logger.error(f"Error running cleanup processes: {str(e)}")

                # Manual forceful cleanup as fallback
                try:
                    import subprocess
                    import getpass

                    # Kill all chrome/chromium processes owned by current user
                    user = os.getenv("USER") or getpass.getuser()

                    # Safe subprocess calls without shell=True
                    # We ignore errors (check=False) because pkill returns 1 if no processes matched
                    subprocess.run(
                        ["pkill", "-9", "-u", user, "chrome"], shell=False, check=False
                    )
                    subprocess.run(
                        ["pkill", "-9", "-u", user, "chromium"],
                        shell=False,
                        check=False,
                    )
                    subprocess.run(
                        ["pkill", "-9", "-u", user, "chromedriver"],
                        shell=False,
                        check=False,
                    )

                    self.logger.info("Force-killed all Chrome/Chromium processes")
                except Exception as e:
                    self.logger.error(f"Error force-killing processes: {str(e)}")

            # Reset login status
            self.is_logged_in = False
            self.current_app = None

            # Run garbage collection
            gc.collect()

            return True
        except Exception as e:
            self.logger.error(f"Error during browser cleanup: {str(e)}")
            return False

    # Utility methods
    def random_delay(self, min_seconds=1, max_seconds=3):
        """Add a random delay to simulate human behavior"""
        delay = random.uniform(min_seconds, max_seconds)
        time.sleep(delay)

    def simulate_human_typing(self, element, text):
        """Simulate human typing with random delays between keystrokes"""
        for char in text:
            element.send_keys(char)
            time.sleep(random.uniform(0.1, 0.3))

    def safe_screenshot(self, description):
        """Safely take a screenshot with error handling and unique naming"""
        try:
            # Generate a unique filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"{description}_{timestamp}.png"
            full_path = os.path.join(self.screenshots_dir, filename)

            # Take screenshot
            self.driver.save_screenshot(full_path)
            self.logger.info(f"Screenshot saved: {filename}")

            return full_path
        except Exception as e:
            self.logger.error(f"Error taking screenshot: {str(e)}")
            return None

    # Login methods
    def verify_login_status(self):
        """Check if we're still logged in to Spotify dashboard"""
        try:
            if not self.driver:
                return False

            current_url = self.driver.current_url

            # Check if we're redirected to login page
            if "accounts.spotify.com" in current_url:
                self.logger.info("Detected redirect to login page")
                return False

            # Check for error messages
            error_elements = self.driver.find_elements(
                By.XPATH, "//div[contains(text(), 'Something went wrong')]"
            )
            if error_elements:
                self.logger.info("Detected error message on dashboard")
                return False

            # Check for login button
            login_button = self.driver.find_elements(
                By.XPATH, "//button[contains(text(), 'Log in')]"
            )
            if login_button:
                self.logger.info("Detected login button - not logged in")
                return False

            return True
        except Exception as e:
            self.logger.error(f"Error checking login status: {str(e)}")
            return False

    def detect_login_status(self):
        """Detect if we're already logged in"""
        try:
            # Look for elements that only appear when logged in
            self.driver.get("https://developer.spotify.com/dashboard")
            time.sleep(3)

            # Try to find elements that indicate we're logged in
            dashboard_elements = self.driver.find_elements(
                By.CSS_SELECTOR, 'a[href*="/dashboard/"]'
            )

            create_app_button = self.driver.find_elements(
                By.CSS_SELECTOR,
                'a[data-encore-id="buttonPrimary"][href="/dashboard/create"]',
            )

            if dashboard_elements or create_app_button:
                self.logger.info("Already logged in")
                self.is_logged_in = True
                return True

            self.logger.info("Not logged in")
            return False

        except Exception as e:
            self.logger.error(f"Error detecting login status: {str(e)}")
            return False

    def handle_cookie_banner(self):
        """Handle cookie consent banner if present"""
        try:
            # Try multiple approaches to find the cookie accept button
            cookie_button_found = False

            # Approach 1: Try the original ID
            try:
                accept_button = WebDriverWait(self.driver, 5).until(
                    EC.element_to_be_clickable((By.ID, "onetrust-accept-btn-handler"))
                )
                self.driver.execute_script("arguments[0].click();", accept_button)
                cookie_button_found = True
                self.logger.info("Clicked cookie accept button using ID")
            except:
                self.logger.info(
                    "Cookie button not found by ID, trying alternative methods"
                )

            # Approach 2: Try by button text (works for multiple languages)
            if not cookie_button_found:
                accept_button_xpaths = [
                    "//button[contains(text(), 'COOKIES AKZEPTIEREN')]",  # German
                    "//button[contains(text(), 'Accept Cookies')]",  # English
                    "//button[contains(text(), 'Accept All')]",  # Alternative English
                    "//button[contains(@class, 'accept')]",  # Class-based approach
                    "//button[contains(@class, 'cookie')]",  # Another class-based approach
                ]

                for xpath in accept_button_xpaths:
                    try:
                        accept_button = WebDriverWait(self.driver, 2).until(
                            EC.element_to_be_clickable((By.XPATH, xpath))
                        )
                        self.driver.execute_script(
                            "arguments[0].click();", accept_button
                        )
                        cookie_button_found = True
                        self.logger.info(
                            f"Clicked cookie accept button using XPath: {xpath}"
                        )
                        break
                    except:
                        continue

            # Give time for cookie banner to disappear
            time.sleep(2)

            return cookie_button_found

        except Exception as e:
            self.logger.info(f"Cookie banner handling completed with status: {str(e)}")
            return False

    def find_and_click_login(self):
        """Try different methods to find and click the login button"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            # Log current page state
            self.logger.info(f"Current URL: {self.driver.current_url}")
            self.logger.info("Taking screenshot of initial page state")
            self.safe_screenshot(f"page_state_{timestamp}")

            # Add explicit wait for page load
            self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))

            # Wait for any dynamic content to load
            time.sleep(3)

            # Add retry mechanism for dynamic content
            max_retries = 3
            retry_delay = 2

            for retry in range(max_retries):
                # First try direct login button with multiple selectors
                login_selectors = [
                    'button[data-encore-id="buttonTertiary"]',
                    'a[href*="accounts.spotify.com/login"]',
                    'button[type="button"]',
                    "a.login-button",
                    'a[href*="login"]',
                    'button[class*="login"]',
                    # Use XPath to find buttons with "Log in" text
                    '//button[contains(text(), "Log in")]',  # Using XPath
                    '//a[contains(text(), "Log in")]',
                    '[data-testid="login-button"]',
                    ".ButtonInner-sc-14ud5tc-0",
                    "button.Button-sc-qlcn5g-0",
                    # Add new dynamic selectors
                    '[class*="login"]',
                    '[class*="signin"]',
                    'a[href*="login"]',
                    'button[type="button"]',  # Generic button check
                ]

                for selector in login_selectors:
                    self.logger.info(
                        f"Retry {retry + 1}: Trying login selector: {selector}"
                    )
                    try:
                        # Check if it's an XPath selector (starts with //)
                        locator_type = (
                            By.XPATH if selector.startswith("//") else By.CSS_SELECTOR
                        )

                        # Use WebDriverWait for each selector
                        buttons = self.wait.until(
                            EC.presence_of_all_elements_located(
                                (locator_type, selector)
                            )
                        )

                        for button in buttons:
                            try:
                                # Check if element is actually visible and clickable
                                if (
                                    button.is_displayed()
                                    and button.is_enabled()
                                    and (
                                        "log in" in button.text.lower()
                                        or "login" in button.text.lower()
                                        or "sign in" in button.text.lower()
                                    )
                                ):

                                    self.logger.info(
                                        f"Found login button with selector {selector}"
                                    )
                                    self.logger.info(f"Button text: {button.text}")

                                    # Scroll into view with JavaScript
                                    self.driver.execute_script(
                                        "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});",
                                        button,
                                    )
                                    time.sleep(1)  # Wait for scroll

                                    # Try multiple click methods
                                    try:
                                        button.click()
                                    except:
                                        try:
                                            self.driver.execute_script(
                                                "arguments[0].click();", button
                                            )
                                        except:
                                            # Last resort: send enter key
                                            button.send_keys(Keys.RETURN)

                                    # Take screenshot after click
                                    self.safe_screenshot(
                                        f"after_login_click_{timestamp}"
                                    )

                                    # Verify if login form appeared
                                    try:
                                        self.wait.until(
                                            EC.presence_of_element_located(
                                                (By.ID, "login-username")
                                            )
                                        )
                                        return True
                                    except TimeoutException:
                                        self.logger.warning(
                                            "Login form did not appear after click"
                                        )
                                        continue

                            except Exception as e:
                                self.logger.warning(
                                    f"Error interacting with button: {str(e)}"
                                )
                                continue

                    except TimeoutException:
                        continue

                # If login button not found, try refreshing page
                if retry < max_retries - 1:
                    self.logger.info(
                        f"Login button not found on attempt {retry + 1}, refreshing page..."
                    )
                    self.driver.refresh()
                    time.sleep(retry_delay)

            # If we get here, we couldn't find the login button
            self.logger.warning("Could not find Log in button in any location")
            self.safe_screenshot(f"login_button_not_found_{timestamp}")
            return False

        except Exception as e:
            self.logger.error(f"Error in find_and_click_login: {str(e)}")
            self.logger.error(f"Traceback: {traceback.format_exc()}")
            self.safe_screenshot(f"login_error_{timestamp}")
            return False

    def login(self):
        """Login to Spotify Developer Dashboard with CAPTCHA handling"""
        try:
            self.logger.info("Attempting to login to Spotify Dashboard")

            # Screenshot initial dashboard page
            self.safe_screenshot("login_start_dashboard")

            self.driver.get("https://developer.spotify.com/dashboard")
            time.sleep(5)
            self.safe_screenshot("dashboard_initial_load")

            # First check if we're already logged in
            if self.detect_login_status():
                self.logger.info("Already logged in through Chrome profile")
                self.safe_screenshot("already_logged_in")
                return True

            # Handle cookie banner
            cookie_handled = self.handle_cookie_banner()
            self.safe_screenshot("after_cookie_banner")

            # Click login button
            self.logger.info("Attempting to find and click login button...")
            login_button_result = self.find_and_click_login()
            self.safe_screenshot("after_login_button_click")

            if not login_button_result:
                raise Exception("Could not find login button")

            # Enter email
            self.logger.info("Entering email address...")
            username_field = self.wait.until(
                EC.presence_of_element_located((By.ID, "login-username"))
            )
            username_field.clear()
            self.simulate_human_typing(username_field, self.email)
            self.safe_screenshot("after_email_entry")
            time.sleep(1)

            # Look for password field immediately after entering email with a short timeout
            try:
                password_field = WebDriverWait(
                    self.driver, 5
                ).until(  # Short timeout to quickly detect if password field is available
                    EC.presence_of_element_located((By.ID, "login-password")),
                    message="Looking for password field",
                )

                self.logger.info(
                    "Password field found immediately, entering password directly"
                )
                password_field.clear()
                time.sleep(0.5)
                password_field.click()
                time.sleep(0.5)
                self.simulate_human_typing(password_field, self.password)
                self.logger.info(f"Password of length {len(self.password)} entered")
                self.safe_screenshot("after_password_entry")
                time.sleep(1)  # Give a moment after entering password

                # Click submit button for password login
                submit_button = self.wait.until(
                    EC.element_to_be_clickable((By.ID, "login-button"))
                )
                submit_button.click()
                self.safe_screenshot("after_submit_button_click")

                # Wait and check for CAPTCHA
                time.sleep(3)
                captcha_result = self.handle_spotify_captcha()
                if not captcha_result:
                    self.logger.error("Failed to bypass CAPTCHA after login submission")
                    return False

                # Verify login success
                if self.verify_login_success():
                    self.logger.info("Successfully logged in with password")
                    return True

            except Exception as password_error:
                self.logger.info(
                    "Password field not immediately available, proceeding with email verification"
                )

                # Click submit to trigger email verification flow
                submit_button = self.wait.until(
                    EC.element_to_be_clickable((By.ID, "login-button"))
                )
                submit_button.click()
                self.safe_screenshot("after_email_submit")

                # Handle potential CAPTCHA
                captcha_result = self.handle_spotify_captcha()
                if not captcha_result:
                    self.logger.error("Failed to bypass CAPTCHA")
                    return False

                # Continue with email verification
                return self.handle_email_verification()

        except Exception as e:
            self.logger.error(f"Login failed: {str(e)}")
            self.logger.error(f"Traceback: {traceback.format_exc()}")
            self.safe_screenshot("login_error")
            raise

    def verify_login_success(self):
        """Verify successful login by checking we're on the developer site"""
        try:
            # Wait for redirect to developer site
            start_time = time.time()
            max_wait = 30  # 30 second timeout

            while time.time() - start_time < max_wait:
                current_url = self.driver.current_url
                self.logger.info(f"Current URL: {current_url}")

                if "developer.spotify.com" in current_url:
                    self.logger.info("Successfully logged in - reached developer site")
                    self.is_logged_in = True
                    return True

                elif "accounts.spotify.com" in current_url:
                    self.logger.info(
                        "Successfully logged in - reached accounts site, redirecting to developer site"
                    )
                    self.driver.get("https://developer.spotify.com")
                    time.sleep(3)  # Wait for page load
                    continue  # Check the URL again after redirection

                time.sleep(2)

            self.logger.error("Timed out waiting for developer site")
            return False

        except Exception as e:
            self.logger.error(f"Error verifying login: {str(e)}")
            return False

    def handle_email_verification(self):
        """
        Handle the email verification process with CAPTCHA handling
        """
        max_retries = 2
        retry_count = 0

        while retry_count < max_retries:
            self.logger.info(
                f"Email verification attempt {retry_count + 1}/{max_retries}"
            )

            # Take screenshots at key stages
            self.safe_screenshot(f"email_verification_start_attempt_{retry_count}")

            # Start with email verification
            try:
                # Clear old emails first
                self.clear_verification_emails()
                self.safe_screenshot(f"after_clear_verification_emails_{retry_count}")
            except Exception as e:
                self.logger.warning(f"Failed to clear old emails: {str(e)}")

            # Trigger verification email
            self.trigger_verification_email()
            self.safe_screenshot(f"after_trigger_verification_email_{retry_count}")

            # Very important: Sleep a bit to ensure email is sent before we start checking
            time.sleep(5)
            self.safe_screenshot(f"after_verification_email_wait_{retry_count}")

            # Initialize email handler
            email_handler = EmailVerificationHandler(
                email_address=self.email_config["address"],
                email_password=self.email_config["password"],
                imap_server=self.email_config.get("server", "mail.spacemail.com"),
                imap_port=self.email_config.get("port", 993),
            )

            # Get verification code
            self.logger.info("Waiting for fresh verification code...")
            code = email_handler.get_verification_code(wait_time=120, check_interval=10)
            self.safe_screenshot(f"after_get_verification_code_{retry_count}")

            if not code:
                self.logger.error("Failed to get verification code")
                retry_count += 1
                continue

            # After getting the verification code
            self.logger.info(f"Got fresh verification code: {code}, entering it...")
            self.current_verification_code = code

            # Screenshots for code entry process
            self.safe_screenshot(f"before_code_entry_{retry_count}")

            # Try direct typing to active element
            try:
                self.logger.info("Trying direct typing to active element first...")
                active_element = self.driver.switch_to.active_element
                active_element.send_keys(code)
                self.safe_screenshot(f"after_direct_code_entry_{retry_count}")

                # Wait to see if this auto-submits
                self.logger.info(
                    "Checking if code automatically submits after direct entry..."
                )
                time.sleep(5)
                self.safe_screenshot(f"after_direct_code_wait_{retry_count}")

                # Check for CAPTCHA
                captcha_result = self.handle_spotify_captcha()
                if not captcha_result:
                    self.logger.error("Failed to bypass CAPTCHA during verification")
                    retry_count += 1
                    continue

                # Check if we've been redirected successfully
                if self.verify_login_success():
                    self.logger.info("Successfully logged in with direct code entry")
                    return True
            except Exception as direct_entry_error:
                self.logger.warning(f"Direct typing failed: {str(direct_entry_error)}")

            # Try to find code input field
            try:
                # Look for verification code input fields with various selectors
                code_input_selectors = [
                    'input[type="text"]',
                    'input[type="number"]',
                    'input[placeholder*="code"]',
                    'input[aria-label*="code"]',
                    'input[name="code"]',
                ]

                for selector in code_input_selectors:
                    try:
                        self.logger.info(
                            f"Looking for code input field with selector: {selector}"
                        )
                        input_fields = self.driver.find_elements(
                            By.CSS_SELECTOR, selector
                        )

                        for input_field in input_fields:
                            if input_field.is_displayed():
                                self.logger.info(
                                    f"Found visible input field, entering code: {code}"
                                )
                                input_field.clear()
                                self.simulate_human_typing(input_field, code)
                                self.safe_screenshot(
                                    f"after_code_entry_selector_{retry_count}"
                                )

                                # Try to find and click submit button
                                try:
                                    submit_buttons = self.driver.find_elements(
                                        By.XPATH,
                                        '//button[@type="submit"] | //button[contains(text(), "Submit")] | //button[contains(text(), "Continue")]',
                                    )

                                    for button in submit_buttons:
                                        if button.is_displayed():
                                            self.logger.info(
                                                f"Found submit button: {button.text}"
                                            )
                                            button.click()
                                            time.sleep(5)

                                            # Check if login successful
                                            if self.verify_login_success():
                                                self.logger.info(
                                                    "Successfully logged in with code + submit button"
                                                )
                                                return True
                                except Exception as submit_error:
                                    self.logger.warning(
                                        f"Error finding/clicking submit button: {str(submit_error)}"
                                    )

                                # If no submit button or it failed, try pressing Enter
                                try:
                                    self.logger.info(
                                        "Pressing Enter key after code entry"
                                    )
                                    input_field.send_keys(Keys.RETURN)
                                    time.sleep(5)

                                    # Check if login successful
                                    if self.verify_login_success():
                                        self.logger.info(
                                            "Successfully logged in with code + Enter key"
                                        )
                                        return True
                                except Exception as enter_error:
                                    self.logger.warning(
                                        f"Error pressing Enter key: {str(enter_error)}"
                                    )
                    except Exception as selector_error:
                        self.logger.warning(
                            f"Error with selector {selector}: {str(selector_error)}"
                        )
            except Exception as input_error:
                self.logger.warning(
                    f"Error finding code input field: {str(input_error)}"
                )

            # Check for CAPTCHA at the end of each retry
            captcha_result = self.handle_spotify_captcha()
            if not captcha_result:
                self.logger.error("Failed to bypass CAPTCHA")
                retry_count += 1
                continue

            # Check for challenge page
            if "challenge.spotify.com" in self.driver.current_url:
                self.logger.info("Detected challenge page, attempting to handle")
                if self.handle_challenge_page():
                    # Check if login successful after handling challenge
                    if self.verify_login_success():
                        self.logger.info(
                            "Successfully logged in after handling challenge page"
                        )
                        return True

            # If we get here, try password login as last resort
            if retry_count == max_retries - 1:
                self.logger.info(
                    "Email verification failed, trying password login as last resort"
                )
                if self.try_password_login_fallback():
                    return True

            retry_count += 1
            time.sleep(5)  # Wait before retry

        # If we get here, all retries failed
        self.logger.error("All email verification attempts failed")
        self.safe_screenshot("final_verification_failure")
        return False

    def solve_recaptcha(self, site_key, page_url):
        """
        Solve reCAPTCHA using 2captcha service if configured

        Args:
            site_key: The reCAPTCHA site key
            page_url: The URL of the page containing the CAPTCHA

        Returns:
            str: The solution token if successful, None otherwise
        """
        try:
            if not self.captcha_api_key:
                self.logger.warning(
                    "No CAPTCHA API key configured, cannot solve CAPTCHA"
                )
                return None

            import requests
            import time

            # Submit CAPTCHA
            url = "http://2captcha.com/in.php"
            data = {
                "key": self.captcha_api_key,
                "method": "userrecaptcha",
                "googlekey": site_key,
                "pageurl": page_url,
                "json": 1,
            }

            self.logger.info("Submitting CAPTCHA to 2captcha")
            response = requests.post(url, data=data)
            if not response.ok:
                self.logger.error(f"Failed to submit CAPTCHA: {response.text}")
                return None

            result = response.json()
            if result.get("status") != 1:
                self.logger.error(f"CAPTCHA submission error: {result.get('request')}")
                return None

            captcha_id = result["request"]

            # Wait for solution
            url = "http://2captcha.com/res.php"
            params = {
                "key": self.captcha_api_key,
                "action": "get",
                "id": captcha_id,
                "json": 1,
            }

            self.logger.info("Waiting for CAPTCHA solution...")
            max_attempts = 30
            attempt = 0

            while attempt < max_attempts:
                time.sleep(5)  # Wait between checks
                response = requests.get(url, params=params)

                if not response.ok:
                    self.logger.warning(
                        f"Error checking solution status: {response.text}"
                    )
                    attempt += 1
                    continue

                result = response.json()
                if result.get("status") == 1:
                    self.logger.info("CAPTCHA solved successfully")
                    return result["request"]
                elif "CAPCHA_NOT_READY" not in result.get("request", ""):
                    self.logger.error(
                        f"CAPTCHA solution error: {result.get('request')}"
                    )
                    break

                attempt += 1

            self.logger.error("Timed out waiting for CAPTCHA solution")
            return None

        except Exception as e:
            self.logger.error(f"Error solving CAPTCHA: {str(e)}")
            return None

    def handle_spotify_captcha(self):
        """
        Handle Spotify reCAPTCHA challenges during login with 2captcha

        Returns:
        bool: True if CAPTCHA is successfully bypassed, False otherwise
        """
        try:
            # Check if we're on a CAPTCHA challenge page
            current_url = self.driver.current_url
            if (
                "challenge.spotify.com" not in current_url
                and "recaptcha" not in current_url
            ):
                return True  # Not a CAPTCHA page, proceed normally

            self.logger.warning("Detected Spotify reCAPTCHA challenge")

            # Take a screenshot of the CAPTCHA page for debugging
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.safe_screenshot(f"spotify_captcha_{timestamp}")

            # Extract site key from the page
            site_key = "6LfCVLAUAAAAALFwwRnnCJ12DalriUGbj8FW_J39"  # Default Spotify key

            # You can also try to extract it from the page:
            try:
                key_element = self.driver.find_element(
                    By.CSS_SELECTOR, "div.g-recaptcha, iframe[src*='recaptcha']"
                )
                data_sitekey = key_element.get_attribute("data-sitekey")
                if data_sitekey:
                    site_key = data_sitekey
                    self.logger.info(f"Extracted site key from page: {site_key}")
            except Exception as e:
                self.logger.warning(f"Could not extract site key from page: {str(e)}")

            # Solve the CAPTCHA
            captcha_response = self.solve_recaptcha(site_key, current_url)

            if not captcha_response:
                self.logger.error("Failed to get CAPTCHA solution")
                return False

            # Apply the CAPTCHA solution using JavaScript
            try:
                self.logger.info("Applying CAPTCHA solution via JavaScript...")
                js_script = f"""
                document.querySelector('[name="g-recaptcha-response"]').innerHTML = "{captcha_response}";
                document.querySelector('form').submit();
                """
                self.driver.execute_script(js_script)

                # Wait a bit for the form to submit
                time.sleep(5)

                # Check if we've moved past the CAPTCHA
                new_url = self.driver.current_url
                if "challenge.spotify.com" not in new_url:
                    self.logger.info("Successfully bypassed CAPTCHA with solution")
                    return True

                # Alternative approach if the form didn't submit
                self.logger.info(
                    "Form didn't auto-submit, looking for continue button..."
                )
                continue_buttons = self.driver.find_elements(
                    By.XPATH, "//button[contains(text(), 'Continue')]"
                )
                for button in continue_buttons:
                    if button.is_displayed():
                        self.logger.info("Found Continue button, clicking...")
                        button.click()
                        time.sleep(5)

                        # Check if we've moved past the CAPTCHA
                        new_url = self.driver.current_url
                        if "challenge.spotify.com" not in new_url:
                            self.logger.info(
                                "Successfully bypassed CAPTCHA via Continue button"
                            )
                            return True

                self.logger.error("Still on CAPTCHA page after applying solution")
                return False

            except Exception as apply_error:
                self.logger.error(
                    f"Error applying CAPTCHA solution: {str(apply_error)}"
                )
                return False

        except Exception as e:
            self.logger.error(f"Unexpected error in CAPTCHA handling: {str(e)}")
            self.logger.error(traceback.format_exc())
            return False

    def handle_challenge_page(self):
        """Handle Spotify challenge pages that appear during login"""
        try:
            self.logger.info("Detected Spotify challenge page, attempting to handle")

            # Take screenshot for analysis
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.safe_screenshot(f"challenge_page_{timestamp}")

            # Check URL to confirm we're on a challenge page
            current_url = self.driver.current_url
            if "challenge.spotify.com" not in current_url:
                self.logger.info("Not on a challenge page, skipping handler")
                return False

            # Wait a moment for the page to fully load
            time.sleep(5)

            # Look for verification code input
            try:
                # Try multiple selectors for verification code inputs
                code_selectors = [
                    "input[type='text']",
                    "input[type='number']",
                    "input[name='code']",
                    "input[aria-label*='code']",
                    "input[placeholder*='code']",
                ]

                for selector in code_selectors:
                    inputs = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for input_field in inputs:
                        if input_field.is_displayed():
                            self.logger.info(f"Found potential code input field")
                            # Try entering verification code
                            if (
                                hasattr(self, "current_verification_code")
                                and self.current_verification_code
                            ):
                                self.logger.info("Re-entering verification code")
                                input_field.clear()
                                self.simulate_human_typing(
                                    input_field, self.current_verification_code
                                )

                                # Try to find a submit button
                                submit_buttons = self.driver.find_elements(
                                    By.CSS_SELECTOR, "button[type='submit']"
                                )
                                for button in submit_buttons:
                                    if button.is_displayed():
                                        self.logger.info(
                                            f"Clicking submit button: {button.text}"
                                        )
                                        button.click()
                                        time.sleep(5)
                                        return True

                                # If no submit button found, try pressing Enter
                                self.logger.info(
                                    "No submit button found, pressing Enter instead"
                                )
                                input_field.send_keys(Keys.RETURN)
                                time.sleep(5)
                                return True

                self.logger.warning("No verification code input field found")

                # Look for any buttons that might help proceed
                buttons = self.driver.find_elements(By.TAG_NAME, "button")
                for button in buttons:
                    if button.is_displayed() and any(
                        word in button.text.lower()
                        for word in [
                            "continue",
                            "submit",
                            "verify",
                            "confirm",
                            "next",
                            "log in",
                            "login",
                        ]
                    ):
                        self.logger.info(
                            f"Clicking potential action button: {button.text}"
                        )
                        button.click()
                        time.sleep(5)
                        return True

                # Look for links that might help
                links = self.driver.find_elements(By.TAG_NAME, "a")
                for link in links:
                    if link.is_displayed() and any(
                        word in link.text.lower()
                        for word in [
                            "password",
                            "different method",
                            "another way",
                            "login options",
                        ]
                    ):
                        self.logger.info(
                            f"Clicking alternative login link: {link.text}"
                        )
                        link.click()
                        time.sleep(5)
                        return True

                self.logger.warning(
                    "Could not identify how to proceed on challenge page"
                )
                return False

            except Exception as e:
                self.logger.error(f"Error handling challenge page: {str(e)}")
                return False

        except Exception as e:
            self.logger.error(f"Error in challenge page handler: {str(e)}")
            return False

    def trigger_verification_email(self):
        """
        Method to trigger the verification email from the current position in the login flow.
        """
        try:
            self.logger.info(
                "Triggering verification email from current login position..."
            )

            # Log current URL for debugging
            current_url = self.driver.current_url
            self.logger.info(f"Current URL before triggering email: {current_url}")

            # Take screenshot to see current state
            self.safe_screenshot("before_email_trigger")

            # We should already be on a page with email field from the login flow
            # Look for email input field
            try:
                # Find the email field that should already be visible
                email_field = self.driver.find_element(By.ID, "login-username")

                # Clear and enter email
                email_field.clear()
                self.simulate_human_typing(email_field, self.email)
                time.sleep(1)

                # Find and click submit/continue button
                submit_button = self.driver.find_element(By.ID, "login-button")
                submit_button.click()

                self.logger.info("Clicked submit button after entering email")

            except Exception as e:
                self.logger.warning(f"Could not find standard email field: {str(e)}")

                # Try alternative selectors for the email field
                selectors = [
                    (By.CSS_SELECTOR, 'input[type="email"]'),
                    (By.CSS_SELECTOR, 'input[name="username"]'),
                    (By.CSS_SELECTOR, 'input[name="email"]'),
                    (By.XPATH, '//input[@placeholder="Email or username"]'),
                ]

                for selector_type, selector in selectors:
                    try:
                        email_field = self.driver.find_element(selector_type, selector)
                        email_field.clear()
                        self.simulate_human_typing(email_field, self.email)
                        time.sleep(1)

                        # Look for a nearby submit button
                        buttons = self.driver.find_elements(
                            By.CSS_SELECTOR, 'button[type="submit"]'
                        )
                        for button in buttons:
                            if button.is_displayed():
                                button.click()
                                self.logger.info(
                                    f"Clicked alternative submit button using {selector}"
                                )
                                break
                        break
                    except:
                        continue

            # Take screenshot after submission
            self.safe_screenshot("after_email_trigger")

            # Wait a moment to ensure the submission is processed
            time.sleep(3)

            # Log current URL after trigger attempt
            current_url = self.driver.current_url
            self.logger.info(f"Current URL after triggering email: {current_url}")

            self.logger.info("Email verification should be triggered")
            return True

        except Exception as e:
            self.logger.error(f"Error triggering verification email: {str(e)}")
            return False

    def clear_verification_emails(self):
        """
        Method to mark old verification emails as read before requesting a new one.
        Includes permission testing and graceful error handling.
        """
        try:
            self.logger.info("Attempting to clear old verification emails...")

            # Initialize email handler
            email_handler = EmailVerificationHandler(
                email_address=self.email_config["address"],
                email_password=self.email_config["password"],
                imap_server=self.email_config.get("server", "mail.spacemail.com"),
                imap_port=self.email_config.get("port", 993),
            )

            if not email_handler.connect():
                self.logger.error(
                    "Could not connect to email server to clear old emails"
                )
                return False

            try:
                # Test permissions with a harmless operation
                self.logger.info("Testing email permissions...")
                email_handler.mail.select("INBOX")

                # Check server capabilities to see what's allowed
                try:
                    capabilities = email_handler.mail.capability()
                    self.logger.info(f"IMAP capabilities: {capabilities}")
                except Exception as cap_error:
                    self.logger.warning(
                        f"Unable to check IMAP capabilities: {str(cap_error)}"
                    )

                # Search for Spotify verification emails from today
                date = datetime.now().strftime("%d-%b-%Y")
                _, messages = email_handler.mail.search(
                    None, f'(ON {date} FROM "Spotify" SUBJECT "Anmeldecode")'
                )

                if messages[0]:
                    email_ids = messages[0].split()
                    count = len(email_ids)

                    if count > 0:
                        self.logger.info(
                            f"Found {count} verification emails to mark as read"
                        )

                        # Mark emails as read (we don't delete them for safety)
                        success_count = 0
                        for email_id in email_ids:
                            try:
                                email_handler.mail.store(email_id, "+FLAGS", "\\Seen")
                                success_count += 1
                            except Exception as flag_error:
                                self.logger.warning(
                                    f"Could not mark email {email_id} as read: {str(flag_error)}"
                                )

                        self.logger.info(
                            f"Successfully marked {success_count}/{count} verification emails as read"
                        )

                    else:
                        self.logger.info("No verification emails found to clear")

                    return True
                else:
                    self.logger.info("No verification emails found to clear")
                    return True

            finally:
                try:
                    email_handler.mail.close()
                    email_handler.mail.logout()
                except:
                    pass

        except Exception as e:
            self.logger.warning(
                f"Email clearing failed (possibly due to permissions): {str(e)}"
            )
            # Continue the process without failing
            return False

    def try_password_login_fallback(self):
        """
        Try to find and use the password login option as fallback.
        Returns True if login successful, False otherwise.
        """
        try:
            # First try to find password login button
            self.logger.info("Looking for 'Log in with password' option...")
            password_login_buttons = self.driver.find_elements(
                By.XPATH,
                "//button[contains(text(), 'Log in with password') or contains(text(), 'Login with password')]",
            )

            if not password_login_buttons:
                # Re-enter email and try again
                self.logger.info("No password button found, re-entering email")
                email_field = self.wait.until(
                    EC.presence_of_element_located((By.ID, "login-username"))
                )
                email_field.clear()
                time.sleep(2)  # Wait after clearing
                self.simulate_human_typing(email_field, self.email)
                time.sleep(1)  # Wait after typing

                submit_button = self.wait.until(
                    EC.element_to_be_clickable((By.ID, "login-button"))
                )
                submit_button.click()
                time.sleep(5)  # Important wait after clicking submit

                # Now look for password button again
                password_login_buttons = self.driver.find_elements(
                    By.XPATH,
                    "//button[contains(text(), 'Log in with password') or contains(text(), 'Login with password')]",
                )

                if not password_login_buttons:
                    # Try more generic selectors
                    password_login_buttons = self.driver.find_elements(
                        By.XPATH,
                        "//a[contains(text(), 'password')] | //button[contains(text(), 'password')]",
                    )

            # Try to click password button if found
            if password_login_buttons:
                for btn in password_login_buttons:
                    if btn.is_displayed():
                        self.logger.info(
                            f"Found 'Log in with password' button: {btn.text}"
                        )
                        btn.click()
                        time.sleep(3)  # Wait after clicking button

                        try:
                            password_field = self.wait.until(
                                EC.presence_of_element_located(
                                    (By.ID, "login-password")
                                )
                            )
                            self.simulate_human_typing(password_field, self.password)
                            time.sleep(2)  # Wait after entering password

                            submit_button = self.wait.until(
                                EC.element_to_be_clickable((By.ID, "login-button"))
                            )
                            submit_button.click()
                            time.sleep(5)  # Important wait after clicking submit

                            if self.verify_login_success():
                                self.logger.info("Successfully logged in with password")
                                return True
                        except Exception as pw_error:
                            self.logger.error(
                                f"Error during password entry: {str(pw_error)}"
                            )

            # If we get here, try one more time with direct password field check
            try:
                password_input = self.wait.until(
                    EC.presence_of_element_located((By.ID, "login-password")),
                    message="Looking for password field",
                )

                self.logger.info("Password field found, entering password...")
                self.simulate_human_typing(password_input, self.password)
                time.sleep(2)  # Wait after entering password

                final_submit = self.wait.until(
                    EC.element_to_be_clickable((By.ID, "login-button"))
                )
                final_submit.click()
                time.sleep(5)  # Important wait after clicking submit

                if self.verify_login_success():
                    self.logger.info("Successfully logged in with password")
                    return True
            except TimeoutException:
                self.logger.info("No password field found")

            return False

        except Exception as e:
            self.logger.error(f"Error in password login fallback: {str(e)}")
            return False

    # App management methods
    def load_app_info(self):
        """Load app information from local JSON or initialize if not present"""
        try:
            app_info_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "app_info.json"
            )

            # If file exists, load it
            if os.path.exists(app_info_path):
                with open(app_info_path, "r") as f:
                    app_info = json.load(f)
                    self.logger.info(
                        f"Loaded app info: {len(app_info['user_apps'])} user apps, {len(app_info['bar_apps'])} bar apps"
                    )
                    return app_info

            # Otherwise initialize a new one
            self.logger.info("App info file not found, initializing new one")
            app_info = {
                "user_apps": [],
                "bar_apps": [],
                "last_updated": datetime.now().isoformat(),
            }

            # Save the initialized app info
            with open(app_info_path, "w") as f:
                json.dump(app_info, f)

            return app_info

        except Exception as e:
            self.logger.error(f"Error loading app info: {str(e)}")
            # Return a minimal structure to prevent errors
            return {
                "user_apps": [],
                "bar_apps": [],
                "last_updated": datetime.now().isoformat(),
            }

    def update_app_info(self, app_type="user", app_name=None, user_count=None):
        """Update app information in the local JSON"""
        try:
            app_info_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "app_info.json"
            )

            # Load current info
            if os.path.exists(app_info_path):
                with open(app_info_path, "r") as f:
                    app_info = json.load(f)
            else:
                app_info = self.load_app_info()

            # Determine which app list to update
            app_list_key = "user_apps" if app_type == "user" else "bar_apps"

            # Find the app to update
            app_found = False
            for app in app_info[app_list_key]:
                if app["name"] == app_name:
                    if user_count is not None:
                        app["user_count"] = user_count
                    app_found = True
                    break

            # If app not found, add it
            if not app_found and app_name:
                app_info[app_list_key].append(
                    {
                        "name": app_name,
                        "user_count": user_count if user_count is not None else 0,
                        "is_active": True,
                    }
                )

            # Update timestamp
            app_info["last_updated"] = datetime.now().isoformat()

            # Save updated info
            with open(app_info_path, "w") as f:
                json.dump(app_info, f)

            self.logger.info(f"Updated app info for {app_type} app {app_name}")

        except Exception as e:
            self.logger.error(f"Error updating app info: {str(e)}")

    def get_suitable_app(self, app_type="user"):
        """Get the most suitable app based on local JSON data"""
        try:
            # Load app info
            app_info_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "app_info.json"
            )

            if not os.path.exists(app_info_path):
                app_info = self.load_app_info()
            else:
                with open(app_info_path, "r") as f:
                    app_info = json.load(f)

            # Determine which app list to use
            app_list_key = "user_apps" if app_type == "user" else "bar_apps"

            # Find active apps
            active_apps = [
                app for app in app_info[app_list_key] if app.get("is_active", True)
            ]

            if not active_apps:
                self.logger.info(f"No active {app_type} apps found in local data")
                return None

            # Sort by user count to find the least loaded app
            sorted_apps = sorted(active_apps, key=lambda x: x.get("user_count", 0))

            if sorted_apps:
                best_app = sorted_apps[0]
                self.logger.info(
                    f"Selected {app_type} app {best_app['name']} with {best_app.get('user_count', 0)} users"
                )
                return best_app

            return None

        except Exception as e:
            self.logger.error(f"Error getting suitable app: {str(e)}")
            return None

    def list_spotify_apps(self):
        """List all available Spotify apps"""
        try:
            # Navigate to dashboard
            self.driver.get("https://developer.spotify.com/dashboard")
            time.sleep(5)  # Wait for page load

            # Take a screenshot to see what we're looking at
            self.safe_screenshot("dashboard_list")

            # Use reliable selector for app links
            selector = 'h2[data-encore-id="type"] a'
            self.logger.info(f"Using selector: {selector}")

            # Wait explicitly for the app links to appear
            try:
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                self.logger.info("App links element found on page")
            except TimeoutException:
                self.logger.warning("Timed out waiting for app links to appear")
                # Try alternate selector
                selector = 'a[href*="/dashboard/"]'
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )

            app_links = self.driver.find_elements(By.CSS_SELECTOR, selector)
            self.logger.info(f"Found {len(app_links)} app links")

            app_names = []
            for link in app_links:
                try:
                    app_text = link.text.strip()
                    href = link.get_attribute("href")
                    self.logger.info(f"Found app: {app_text}, href: {href}")

                    if app_text and app_text not in app_names:
                        app_names.append(app_text)
                except Exception as e:
                    self.logger.warning(f"Error getting app info: {str(e)}")

            if app_names:
                self.logger.info(f"Found {len(app_names)} apps: {', '.join(app_names)}")
            else:
                self.logger.warning("No apps found using selector")

            return app_names
        except Exception as e:
            self.logger.error(f"Error listing apps: {str(e)}")
            return []

    def get_current_app(self, app_type="user"):
        """Get current active app from database and local cache"""
        try:
            # First try to get from database
            query = """
                SELECT app_name, user_count 
                FROM clubfindr.spotify_apps 
                WHERE is_active = true AND app_type = %s
                LIMIT 1
            """
            self.cursor.execute(query, (app_type,))
            result = self.cursor.fetchone()

            if result:
                self.current_app = result

                # Update local cache
                self.update_app_info(
                    app_type=app_type,
                    app_name=result["app_name"],
                    user_count=result["user_count"],
                )

                return result

            # If no result from database, try local cache
            self.logger.info(
                f"No {app_type} app found in database, checking local cache"
            )
            cached_app = self.get_suitable_app(app_type)

            if cached_app:
                # Create a result-like structure
                result = {
                    "app_name": cached_app["name"],
                    "user_count": cached_app.get("user_count", 0),
                }

                self.current_app = result
                return result

            # If we get here, neither database nor cache found a valid app
            self.logger.info(f"No valid {app_type} app found in database or cache")
            return None

        except Exception as e:
            self.logger.error(
                f"Database error getting current {app_type} app: {str(e)}"
            )
            raise

    def navigate_to_app(self, app_name):
        """Navigate to specific Spotify app"""
        try:
            self.logger.info(f"Navigating to app: {app_name}")

            # Try to find the app ID from app_info.json
            app_info_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "app_info.json"
            )

            if os.path.exists(app_info_path):
                with open(app_info_path, "r") as f:
                    app_info = json.load(f)

                # Search in both user and bar apps
                target_app = None
                for app_type in ["user_apps", "bar_apps"]:
                    for app in app_info.get(app_type, []):
                        if app["name"] == app_name:
                            target_app = app
                            break
                    if target_app:
                        break

                if target_app:
                    # Get app ID (prefer app_id, fall back to client_id if needed)
                    app_id = target_app.get("app_id")
                    if not app_id and "client_id" in target_app:
                        app_id = target_app.get("client_id")

                    if app_id:
                        # Direct navigation with app ID
                        app_url = f"https://developer.spotify.com/dashboard/{app_id}"
                        self.logger.info(f"Navigating directly to app URL: {app_url}")
                        self.driver.get(app_url)
                        time.sleep(5)  # Wait for page to load
                        self.current_app = {"app_name": app_name}
                        return True

            # Fallback to dashboard navigation
            self.logger.info("Falling back to direct dashboard navigation")
            self.driver.get("https://developer.spotify.com/dashboard")
            time.sleep(5)

            # Try to find and click on the app link
            app_links = self.driver.find_elements(
                By.CSS_SELECTOR, 'h2[data-encore-id="type"] a'
            )
            if not app_links:
                app_links = self.driver.find_elements(
                    By.CSS_SELECTOR, 'a[href*="/dashboard/"]'
                )

            for link in app_links:
                if link.text.strip() == app_name:
                    self.logger.info(f"Found app link for {app_name}, clicking...")
                    self.driver.execute_script(
                        "arguments[0].scrollIntoView(true);", link
                    )
                    time.sleep(1)
                    link.click()
                    time.sleep(5)

                    # Set current_app to ensure navigate_to_user_management works
                    self.current_app = {"app_name": app_name}
                    return True

            self.logger.error(f"Could not find app: {app_name}")
            raise Exception(f"Could not find app: {app_name}")

        except Exception as e:
            self.logger.error(f"Error navigating to app: {str(e)}")
            raise

    def navigate_to_user_management(self):
        """Navigate to user management section"""
        try:
            self.logger.info("Navigating to user management")

            # Take a screenshot of our starting point
            self.safe_screenshot("before_user_management_navigation")

            # First method: Try to extract app ID from current URL
            current_url = self.driver.current_url
            self.logger.info(f"Current URL: {current_url}")
            app_id_match = re.search(r"/dashboard/([a-f0-9]{32})", current_url)

            if not app_id_match:
                # Second method: Try to get it from app_info.json
                app_name = self.current_app["app_name"]
                self.logger.info(
                    f"Could not extract app ID from URL, trying to get it from app_info.json for {app_name}"
                )

                app_info_path = os.path.join(
                    os.path.dirname(os.path.abspath(__file__)), "app_info.json"
                )
                with open(app_info_path, "r") as f:
                    app_info = json.load(f)

                # Search for the app in both user and bar apps
                app_id = None
                for app_list in ["user_apps", "bar_apps"]:
                    for app in app_info.get(app_list, []):
                        if app["name"] == app_name:
                            app_id = app.get("app_id", app.get("client_id"))
                            self.logger.info(
                                f"Found app ID from app_info.json: {app_id}"
                            )
                            break
                    if app_id:
                        break

                if not app_id:
                    self.logger.error(
                        f"Could not find app ID for {app_name} in app_info.json"
                    )
                    self.safe_screenshot("app_id_not_found")
                    raise Exception(
                        f"Could not find app ID for {app_name} in app_info.json"
                    )
            else:
                app_id = app_id_match.group(1)
                self.logger.info(f"Extracted app ID from URL: {app_id}")

            # Navigate to users page
            users_url = f"https://developer.spotify.com/dashboard/{app_id}/users"
            self.logger.info(f"Navigating to user management URL: {users_url}")

            # Try to navigate to the user management page
            self.driver.get(users_url)
            time.sleep(5)

            # Take a screenshot after navigation
            self.safe_screenshot("user_management_page")

            # Check if navigation was successful
            try:
                # Try to find an element that indicates we're on the users page
                element = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located(
                        (By.CSS_SELECTOR, "button[data-encore-id='buttonPrimary']")
                    )
                )
                self.logger.info("Successfully navigated to User Management")
                return True
            except:
                if "/users" in self.driver.current_url:
                    self.logger.info(
                        "URL indicates we're on the Users page, proceeding"
                    )
                    return True
                else:
                    self.logger.error("Failed to navigate to User Management")
                    raise Exception("Failed to navigate to User Management")

        except Exception as e:
            self.logger.error(f"Error navigating to user management: {str(e)}")
            raise

    def create_new_app(self, app_type="user"):
        """Create new Spotify app and return its name"""
        try:
            self.logger.info(f"Creating new Spotify app for {app_type}")

            # Go to dashboard
            self.driver.get("https://developer.spotify.com/dashboard")
            time.sleep(3)

            # Set base name based on app type
            if app_type == "bar":
                base_name = "Clubfindr Bars"
            else:
                base_name = "Party Recommender"

            # Count existing apps
            existing_apps = []
            app_links = self.driver.find_elements(
                By.CSS_SELECTOR, 'a[href*="/dashboard/"]'
            )

            for link in app_links:
                app_text = link.text.strip()
                if base_name in app_text:
                    existing_apps.append(app_text)

            # Calculate next app number
            next_number = 1
            if existing_apps:
                existing_numbers = []
                for app in existing_apps:
                    try:
                        num = int(app.replace(base_name, "").strip())
                        existing_numbers.append(num)
                    except ValueError:
                        continue

                if existing_numbers:
                    next_number = max(existing_numbers) + 1

            app_name = f"{base_name} {next_number}"

            # Click Create App button
            create_button = self.wait.until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        'a[data-encore-id="buttonPrimary"][href="/dashboard/create"]',
                    )
                )
            )
            create_button.click()
            time.sleep(3)

            # Fill in app details
            name_input = self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[data-encore-id="formInput"][name="name"]')
                )
            )
            self.simulate_human_typing(name_input, app_name)

            # Set description based on app type
            if app_type == "bar":
                description = f"Bar music recommendation app instance {next_number}"
            else:
                description = f"Party music recommendation app instance {next_number}"

            desc_input = self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'textarea[data-encore-id="formTextarea"]')
                )
            )
            self.simulate_human_typing(desc_input, description)

            # Add redirect URI
            redirect_uri = "https://www.clubfindr.com/spotify/login"
            uri_input = self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="newRedirectUri"]')
                )
            )
            self.simulate_human_typing(uri_input, redirect_uri)

            add_uri_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, 'button[aria-label="Add redirect URI"]')
                )
            )
            add_uri_button.click()
            time.sleep(1)

            # Select Web API
            web_api_checkbox = self.wait.until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, 'input[id="apis-used-1"]'))
            )
            if not web_api_checkbox.is_selected():
                web_api_label = self.driver.find_element(
                    By.CSS_SELECTOR, 'label[for="apis-used-1"]'
                )
                web_api_label.click()

            # Accept terms
            terms_indicator = self.wait.until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        'label[for="termsAccepted"] .Indicator-sc-1airx73-0',
                    )
                )
            )
            terms_indicator.click()

            # Save app
            save_button = self.wait.until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        'button[type="submit"][data-encore-id="buttonPrimary"]',
                    )
                )
            )
            save_button.click()
            time.sleep(5)  # Wait for app creation to complete

            # Extract app ID from the URL
            current_url = self.driver.current_url
            app_id_match = re.search(r"/dashboard/([a-f0-9]{32})", current_url)

            if not app_id_match:
                self.logger.error(
                    "Could not extract app ID from URL after app creation"
                )
                self.safe_screenshot("app_creation_error")
                raise Exception("Could not extract app ID from URL after app creation")

            app_id = app_id_match.group(1)
            self.logger.info(f"Extracted app ID: {app_id} for app {app_name}")

            # Get the credentials for this app
            self.logger.info(f"Getting credentials for newly created app {app_name}")
            credentials = self.get_app_credentials()
            client_id = credentials.get("client_id")
            client_secret = credentials.get("client_secret")

            if not client_id or not client_secret:
                self.logger.error("Failed to get valid credentials for the new app")
                self.safe_screenshot("credentials_error")
                raise Exception("Failed to get valid credentials for the new app")

            self.logger.info(f"Successfully retrieved credentials for app {app_name}")

            # Save the app with credentials to the database
            self.cursor.execute(
                """
                INSERT INTO clubfindr.spotify_apps 
                (app_name, app_id, is_active, user_count, app_type, client_id, client_secret, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            """,
                (app_name, app_id, True, 0, app_type, client_id, client_secret),
            )

            # Update local app_info.json
            app_info_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "app_info.json"
            )

            # Load existing app info or create new if not exists
            if os.path.exists(app_info_path):
                with open(app_info_path, "r") as f:
                    app_info = json.load(f)
            else:
                app_info = {
                    "user_apps": [],
                    "bar_apps": [],
                    "last_updated": datetime.now().isoformat(),
                }

            # Determine which list to update based on app type
            app_list_key = "user_apps" if app_type == "user" else "bar_apps"

            # Prepare app data to add
            new_app_data = {
                "name": app_name,
                "client_id": client_id,
                "client_secret": client_secret,
                "app_id": app_id,
                "user_count": 0,
                "is_active": True,
            }

            # Add to the appropriate list
            app_info[app_list_key].append(new_app_data)

            # Update timestamp
            app_info["last_updated"] = datetime.now().isoformat()

            # Save updated app info
            with open(app_info_path, "w") as f:
                json.dump(app_info, f, indent=4)

            self.logger.info(
                f"Updated app_info.json with new {app_type} app: {app_name}"
            )

            # Commit database transaction
            self.db.commit()
            self.logger.info(
                f"Successfully created and saved {app_type} app: {app_name} with credentials"
            )

            return app_name

        except Exception as e:
            self.logger.error(f"Error in app creation process: {str(e)}")
            self.db.rollback()
            raise

    def get_app_credentials(self):
        """Get Client ID and Secret from current app"""
        try:
            self.logger.info("Getting app credentials")

            # Click Settings button
            settings_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, '//a[contains(@href, "/settings")]')
                )
            )
            settings_button.click()
            time.sleep(3)

            # Take a screenshot for debugging
            self.safe_screenshot("settings_page")

            # Get Client ID - try several approaches
            client_id = None

            # Approach 1: Find span with exact text "Client ID" and then find the related value
            try:
                client_id_label = self.wait.until(
                    EC.presence_of_element_located(
                        (By.XPATH, '//span[text()="Client ID"]')
                    )
                )
                # Get the parent div, then find the value span within
                parent_div = client_id_label.find_element(
                    By.XPATH, "./ancestor::div[1]"
                )
                client_id = parent_div.find_element(
                    By.XPATH, './/span[not(text()="Client ID")]'
                ).text
                self.logger.info(f"Found Client ID using approach 1: {client_id}")
            except Exception as e:
                self.logger.warning(f"Approach 1 for Client ID failed: {e}")

            # Approach 2: Look for any element containing Client ID text
            if not client_id:
                try:
                    client_id_elements = self.driver.find_elements(
                        By.XPATH, '//*[contains(text(), "Client ID")]'
                    )
                    for element in client_id_elements:
                        parent = element.find_element(By.XPATH, "./parent::*")
                        potential_id_elements = parent.find_elements(
                            By.XPATH, ".//span"
                        )
                        for potential in potential_id_elements:
                            if potential.text and "Client ID" not in potential.text:
                                client_id = potential.text
                                self.logger.info(
                                    f"Found Client ID using approach 2: {client_id}"
                                )
                                break
                        if client_id:
                            break
                except Exception as e:
                    self.logger.warning(f"Approach 2 for Client ID failed: {e}")

            if not client_id:
                self.safe_screenshot("client_id_not_found")
                raise Exception("Could not find Client ID")

            self.logger.info(f"Found Client ID: {client_id}")

            # Find the "View client secret" button
            self.logger.info("Looking for 'View client secret' button...")
            view_buttons = self.driver.find_elements(
                By.XPATH,
                '//button[contains(text(), "View client secret") or contains(text(), "SHOW") or contains(text(), "Show")]',
            )

            view_secret_button = None
            for button in view_buttons:
                if button.is_displayed():
                    view_secret_button = button
                    self.logger.info(f"Found button with text: {button.text}")
                    break

            if not view_secret_button:
                # Try a more generic approach - look for any button that might show secrets
                buttons = self.driver.find_elements(By.TAG_NAME, "button")
                for button in buttons:
                    if button.is_displayed() and any(
                        word in button.text.lower()
                        for word in ["view", "show", "secret"]
                    ):
                        view_secret_button = button
                        self.logger.info(
                            f"Found potential secret button with text: {button.text}"
                        )
                        break

            if not view_secret_button:
                self.safe_screenshot("view_button_not_found")
                raise Exception("Could not find 'View client secret' button")

            # Click the button to reveal the secret
            try:
                view_secret_button.click()
            except:
                try:
                    self.driver.execute_script(
                        "arguments[0].click();", view_secret_button
                    )
                except Exception as e:
                    self.logger.error(f"Failed to click view button: {e}")
                    self.safe_screenshot("view_button_click_failed")
                    raise

            time.sleep(2)  # Wait for the secret to appear

            # Get Client Secret - try multiple approaches
            client_secret = None

            # Approach 1: Find the label first
            try:
                secret_label = self.wait.until(
                    EC.presence_of_element_located(
                        (By.XPATH, '//span[text()="Client secret"]')
                    )
                )
                # Get the parent div, then find the value span within
                parent_div = secret_label.find_element(By.XPATH, "./ancestor::div[1]")
                client_secret = parent_div.find_element(
                    By.XPATH, './/span[not(text()="Client secret")]'
                ).text
                self.logger.info(
                    f"Found Client Secret using approach 1: {client_secret[:5]}..."
                )
            except Exception as e:
                self.logger.warning(f"Approach 1 for Client Secret failed: {e}")

            # Approach 2: Look for any element containing Client Secret text
            if not client_secret:
                try:
                    secret_elements = self.driver.find_elements(
                        By.XPATH, '//*[contains(text(), "Client secret")]'
                    )
                    for element in secret_elements:
                        parent = element.find_element(By.XPATH, "./parent::*")
                        potential_secret_elements = parent.find_elements(
                            By.XPATH, ".//span"
                        )
                        for potential in potential_secret_elements:
                            if (
                                potential.text
                                and "Client secret" not in potential.text
                                and len(potential.text) > 10
                            ):
                                client_secret = potential.text
                                self.logger.info(
                                    f"Found Client Secret using approach 2: {client_secret[:5]}..."
                                )
                                break
                        if client_secret:
                            break
                except Exception as e:
                    self.logger.warning(f"Approach 2 for Client Secret failed: {e}")

            # Approach 3: Look for any long text that could be a secret
            if not client_secret:
                try:
                    # Look for any span with a long text (typical of secrets)
                    spans = self.driver.find_elements(By.TAG_NAME, "span")
                    for span in spans:
                        if span.is_displayed():
                            text = span.text.strip()
                            # Client secrets are typically 32+ characters long
                            if len(text) >= 32 and all(c.isalnum() for c in text):
                                client_secret = text
                                self.logger.info(
                                    f"Found potential Client Secret using approach 3: {client_secret[:5]}..."
                                )
                                break
                except Exception as e:
                    self.logger.warning(f"Approach 3 for Client Secret failed: {e}")

            if not client_secret:
                self.safe_screenshot("client_secret_not_found")
                raise Exception("Could not find Client Secret")

            self.logger.info(
                f"Found Client Secret (starting with {client_secret[:5]}...)"
            )

            return {"client_id": client_id, "client_secret": client_secret}

        except Exception as e:
            self.logger.error(f"Error getting app credentials: {str(e)}")
            self.safe_screenshot("credentials_error")
            raise

    def add_user(self, user_id, spotify_email):
        """Add user to Spotify app and update database"""
        try:
            # Initialize browser if not already initialized
            if not self.driver:
                if not self.initialize_browser():
                    raise Exception("Failed to initialize browser")

            # Connect to database if not already connected
            if not self.db or (hasattr(self.db, "closed") and self.db.closed):
                if not self.connect_db():
                    raise Exception("Failed to connect to database")

            # Login if not already logged in
            if not self.is_logged_in:
                if not self.login():
                    raise Exception("Failed to login to Spotify")

            self.logger.info(f"Adding user {user_id} with email {spotify_email}")

            # Get user's name from database
            self.cursor.execute(
                """
                SELECT name FROM clubfindr.users WHERE id = %s
            """,
                (user_id,),
            )
            user = self.cursor.fetchone()
            if not user or not user["name"]:
                raise Exception("User not found or name not set")

            # Get current app
            app = self.get_current_app(app_type="user")

            if not app:
                app_name = self.create_new_app(app_type="user")
            elif app["user_count"] >= self.MAX_USERS:
                app_name = self.create_new_app(app_type="user")
            else:
                app_name = app["app_name"]

            # Navigate to app and user management
            self.navigate_to_app(app_name)
            self.navigate_to_user_management()

            # Take screenshot before starting
            self.safe_screenshot(f"before_add_user_{user_id}")

            # Add user in Spotify UI
            self.logger.info(
                f"Adding user {user['name']} ({spotify_email}) to app {app_name}"
            )

            # Find Add User button and click it
            add_user_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, 'button[data-encore-id="buttonPrimary"]')
                )
            )
            add_user_button.click()
            time.sleep(2)

            # Fill in user details
            self.logger.info("Looking for name input field")
            name_input = self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="name"][data-encore-id="formInput"]')
                )
            )
            self.logger.info("Found name input, entering name")
            name_input.clear()
            self.simulate_human_typing(name_input, user["name"])
            time.sleep(0.5)

            self.logger.info("Looking for email input field")
            email_input = self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="email"][data-encore-id="formInput"]')
                )
            )
            self.logger.info("Found email input, entering email")
            email_input.clear()
            self.simulate_human_typing(email_input, spotify_email)
            time.sleep(0.5)

            # Take screenshot after filling form
            self.safe_screenshot(f"form_filled_{user_id}")

            # Submit the form
            self.logger.info("Looking for submit button")
            submit_button = self.wait.until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        'button[type="submit"][data-encore-id="buttonPrimary"]',
                    )
                )
            )
            self.logger.info("Found submit button, clicking it")
            submit_button.click()

            # Wait for success (modal should close)
            self.logger.info("Waiting for dialog to close (success indicator)")
            success = WebDriverWait(self.driver, 10).until(
                EC.invisibility_of_element_located(
                    (By.CSS_SELECTOR, 'div[role="dialog"]')
                )
            )

            if not success:
                self.logger.error("Modal did not close after submitting user")
                self.safe_screenshot(f"dialog_not_closed_{user_id}")
                return False

            # Take screenshot after successful submission
            self.safe_screenshot(f"after_success_{user_id}")
            self.logger.info(f"Successfully added user {user['name']} to Spotify app")

            # Update app user count
            self.cursor.execute(
                """
                UPDATE clubfindr.spotify_apps 
                SET user_count = user_count + 1 
                WHERE app_name = %s
            """,
                (app_name,),
            )

            # Update user record with app name
            self.cursor.execute(
                """
                UPDATE clubfindr.users 
                SET spotify_app_name = %s,
                    spotify_email = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """,
                (app_name, spotify_email, user_id),
            )

            self.db.commit()
            self.logger.info(
                f"Database updated: User {user_id} assigned to app {app_name}"
            )

            # Update local app info
            self.update_app_info(
                app_type="user",
                app_name=app_name,
                user_count=app["user_count"] + 1 if app else 1,
            )

            return True

        except Exception as e:
            self.logger.error(f"Error in add_user process: {str(e)}")
            self.logger.error(traceback.format_exc())
            if hasattr(self, "db") and self.db:
                self.db.rollback()
            return False
        finally:
            # Close browser when done - key part of the on-demand approach
            self.close_browser()

    def add_bar(self, bar_id, spotify_email):
        """Add bar to Spotify app and update database"""
        try:
            # Initialize browser if not already initialized
            if not self.driver:
                if not self.initialize_browser():
                    raise Exception("Failed to initialize browser")

            # Connect to database if not already connected
            if not self.db or (hasattr(self.db, "closed") and self.db.closed):
                if not self.connect_db():
                    raise Exception("Failed to connect to database")

            # Login if not already logged in
            if not self.is_logged_in:
                if not self.login():
                    raise Exception("Failed to login to Spotify")

            self.logger.info(f"Adding bar {bar_id} with email {spotify_email}")

            # Get bar's name from database
            self.cursor.execute(
                """
                SELECT name FROM clubfindr.bars WHERE id = %s
            """,
                (bar_id,),
            )
            bar = self.cursor.fetchone()
            if not bar or not bar["name"]:
                raise Exception("Bar not found or name not set")

            # Get current bar app
            app = self.get_current_app(app_type="bar")

            if not app:
                app_name = self.create_new_app(app_type="bar")
            elif app["user_count"] >= self.MAX_USERS:
                app_name = self.create_new_app(app_type="bar")
            else:
                app_name = app["app_name"]

            # Navigate to app and user management
            self.navigate_to_app(app_name)
            self.navigate_to_user_management()

            # Take screenshot before starting
            self.safe_screenshot(f"before_add_bar_{bar_id}")

            # Add bar in Spotify UI
            self.logger.info(
                f"Adding bar {bar['name']} ({spotify_email}) to app {app_name}"
            )

            # Find Add User button and click it
            add_user_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, 'button[data-encore-id="buttonPrimary"]')
                )
            )
            add_user_button.click()
            time.sleep(2)

            # Fill in bar details
            self.logger.info("Looking for name input field")
            name_input = self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="name"][data-encore-id="formInput"]')
                )
            )
            self.logger.info("Found name input, entering name")
            name_input.clear()
            self.simulate_human_typing(name_input, bar["name"])
            time.sleep(0.5)

            self.logger.info("Looking for email input field")
            email_input = self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="email"][data-encore-id="formInput"]')
                )
            )
            self.logger.info("Found email input, entering email")
            email_input.clear()
            self.simulate_human_typing(email_input, spotify_email)
            time.sleep(0.5)

            # Take screenshot after filling form
            self.safe_screenshot(f"form_filled_{bar_id}")

            # Submit the form
            self.logger.info("Looking for submit button")
            submit_button = self.wait.until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        'button[type="submit"][data-encore-id="buttonPrimary"]',
                    )
                )
            )
            self.logger.info("Found submit button, clicking it")
            submit_button.click()

            # Wait for success (modal should close)
            self.logger.info("Waiting for dialog to close (success indicator)")
            success = WebDriverWait(self.driver, 10).until(
                EC.invisibility_of_element_located(
                    (By.CSS_SELECTOR, 'div[role="dialog"]')
                )
            )

            if not success:
                self.logger.error("Modal did not close after submitting bar")
                self.safe_screenshot(f"dialog_not_closed_{bar_id}")
                return False

            # Take screenshot after successful submission
            self.safe_screenshot(f"after_success_{bar_id}")
            self.logger.info(f"Successfully added bar {bar['name']} to Spotify app")

            # Update app user count
            self.cursor.execute(
                """
                UPDATE clubfindr.spotify_apps 
                SET user_count = user_count + 1 
                WHERE app_name = %s
            """,
                (app_name,),
            )

            # Update bar record with app name
            self.cursor.execute(
                """
                UPDATE clubfindr.bars 
                SET spotify_app_name = %s,
                    spotify_email = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """,
                (app_name, spotify_email, bar_id),
            )

            self.db.commit()
            self.logger.info(
                f"Database updated: Bar {bar_id} assigned to app {app_name}"
            )

            # Update local app info
            self.update_app_info(
                app_type="bar",
                app_name=app_name,
                user_count=app["user_count"] + 1 if app else 1,
            )

            return True

        except Exception as e:
            self.logger.error(f"Error in add_bar process: {str(e)}")
            self.logger.error(traceback.format_exc())
            if hasattr(self, "db") and self.db:
                self.db.rollback()
            return False
        finally:
            # Close browser when done - key part of the on-demand approach
            self.close_browser()

    def queue_user_for_later_addition(self, entity_id, spotify_email, is_bar=False):
        """
        Queue a user or bar for later addition if service is temporarily unavailable
        """
        try:
            # Create queue directory if it doesn't exist
            queue_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "pending_queue"
            )
            os.makedirs(queue_dir, exist_ok=True)

            # Create a unique filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            entity_type = "bar" if is_bar else "user"
            filename = f"{entity_type}_{entity_id}_{timestamp}.json"

            # Create queue entry data
            queue_data = {
                "id": entity_id,
                "email": spotify_email,
                "type": entity_type,
                "timestamp": timestamp,
                "processed": False,
                "attempts": [],
            }

            # Save to queue file
            file_path = os.path.join(queue_dir, filename)
            with open(file_path, "w") as f:
                json.dump(queue_data, f, indent=2)

            self.logger.info(
                f"Queued {entity_type} {entity_id} for later addition: {file_path}"
            )
            return True

        except Exception as e:
            self.logger.error(
                f"Error queueing {entity_type} for later addition: {str(e)}"
            )
            return False

    def process_pending_queue(self):
        """Process pending queue of user/bar additions"""
        queue_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "pending_queue"
        )
        if not os.path.exists(queue_dir):
            self.logger.info("No pending queue directory found")
            return

        self.logger.info("Processing pending user/bar addition queue")
        processed_count = 0
        failed_count = 0

        # Get all queue files
        queue_files = glob.glob(os.path.join(queue_dir, "*.json"))

        if not queue_files:
            self.logger.info("No pending queue files found")
            return

        self.logger.info(f"Found {len(queue_files)} pending queue files")

        for file_path in queue_files:
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)

                if data.get("processed", False):
                    self.logger.info(
                        f"Skipping already processed item: {os.path.basename(file_path)}"
                    )
                    continue  # Skip already processed items

                self.logger.info(
                    f"Processing queued {data['type']}: {data['id']} ({data['email']})"
                )

                # Use the regular add_user/add_bar functions
                success = False
                try:
                    if data["type"] == "user":
                        success = self.add_user(data["id"], data["email"])
                    else:  # bar
                        success = self.add_bar(data["id"], data["email"])
                except Exception as add_error:
                    self.logger.error(
                        f"Exception during {data['type']} addition: {str(add_error)}"
                    )
                    self.logger.error(traceback.format_exc())
                    success = False

                # Update queue file based on result
                if success:
                    # Mark as processed
                    data["processed"] = True
                    data["processed_time"] = datetime.now().isoformat()
                    with open(file_path, "w") as f:
                        json.dump(data, f, indent=2)

                    processed_count += 1
                    self.logger.info(
                        f"Successfully processed {data['type']}: {data['id']}"
                    )

                    # Send notification email
                    self.notify_user_of_successful_addition(data["email"], data["type"])

                    # Move to a processed directory
                    try:
                        processed_dir = os.path.join(queue_dir, "processed")
                        os.makedirs(processed_dir, exist_ok=True)
                        processed_file = os.path.join(
                            processed_dir, os.path.basename(file_path)
                        )
                        shutil.copy2(file_path, processed_file)
                        self.logger.info(f"Copied queue file to {processed_file}")

                        # Remove the original after copying
                        os.remove(file_path)
                    except Exception as move_error:
                        self.logger.warning(
                            f"Error moving queue file: {str(move_error)}"
                        )
                else:
                    # Record the failed attempt
                    if "attempts" not in data:
                        data["attempts"] = []

                    data["attempts"].append(
                        {"time": datetime.now().isoformat(), "result": "failed"}
                    )

                    with open(file_path, "w") as f:
                        json.dump(data, f, indent=2)

                    failed_count += 1
                    self.logger.error(f"Failed to process {data['type']}: {data['id']}")

            except Exception as e:
                failed_count += 1
                self.logger.error(f"Error processing queue file {file_path}: {str(e)}")
                self.logger.error(traceback.format_exc())

        self.logger.info(
            f"Queue processing complete. Processed: {processed_count}, Failed: {failed_count}"
        )

    def notify_user_of_successful_addition(self, recipient_email, entity_type="user"):
        """Send email notification that a queued user/bar has been successfully added"""
        try:
            self.logger.info(
                f"Sending notification to {recipient_email} about {entity_type} addition"
            )

            # Email server settings - using the email config
            smtp_server = self.email_config.get("server", "mail.spacemail.com")
            smtp_port = self.email_config.get(
                "smtp_port", 587
            )  # SMTP port may be different from IMAP
            sender_email = self.email_config["address"]
            sender_password = self.email_config["password"]

            # Create message
            message = MIMEMultipart()
            message["From"] = sender_email
            message["To"] = recipient_email

            if entity_type == "user":
                message["Subject"] = (
                    "Your Tilki-Clubfindr Account Has Been Connected to Spotify"
                )
                body = """
                Hello from Tilki-Clubfindr!

                We wanted to let you know that your Spotify account has now been successfully connected to Clubfindr.
                You can now enjoy personalized music recommendations and all the features of our platform.

                If you have any questions, please don't hesitate to contact our support team.

                Best regards,
                The Clubfindr Team
                """
            else:  # bar
                message["Subject"] = (
                    "Your Tilki-Clubfindr Bar Account Has Been Connected to Spotify"
                )
                body = """
                Hello from Tilki-Clubfindr!

                We wanted to let you know that your bar's Spotify account has now been successfully connected to Clubfindr.
                You can now manage your venue's music through our platform and enhance your customers' experience.

                If you have any questions, please don't hesitate to contact our support team.

                Best regards,
                The Clubfindr Team
                """

            message.attach(MIMEText(body, "plain"))

            # Send email
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()  # Secure the connection
                server.login(sender_email, sender_password)
                server.send_message(message)

            self.logger.info(f"Successfully sent notification to {recipient_email}")
            return True

        except Exception as e:
            self.logger.error(f"Failed to send notification email: {str(e)}")
            return False


# API Endpoints
@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    try:
        # Create browser session object just to check configuration
        browser = BrowserSession()
        config_status = browser.load_config("config.json")

        # Check database connection
        db_status = browser.connect_db()
        if db_status:
            browser.close_db()

        # Get pending queue count
        queue_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "pending_queue"
        )
        queue_count = 0
        if os.path.exists(queue_dir):
            queue_files = glob.glob(os.path.join(queue_dir, "*.json"))
            queue_count = len(queue_files)

        return jsonify(
            {
                "status": "ok" if config_status and db_status else "error",
                "config_loaded": config_status,
                "database_connected": db_status,
                "pending_queue_count": queue_count,
                "timestamp": datetime.now().isoformat(),
            }
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/cleanup", methods=["POST"])
def trigger_cleanup():
    """Trigger cleanup of browser processes"""
    try:
        # Import the cleanup function
        from cleanup import cleanup_processes

        # Call cleanup
        cleanup_processes()

        return jsonify(
            {"status": "success", "message": "Cleanup performed successfully"}
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/add_user", methods=["POST"])
def add_user_endpoint():
    """Add a user to a Spotify app"""
    try:
        data = request.json
        required_fields = ["user_id", "spotify_email"]
        if not data or not all(field in data for field in required_fields):
            return jsonify({"error": "Missing required fields"}), 400

        # Create browser session
        browser = BrowserSession()

        # Queue for later if something fails before actual addition
        if not browser.load_config("config.json") or not browser.connect_db():
            success = browser.queue_user_for_later_addition(
                data["user_id"], data["spotify_email"], is_bar=False
            )

            if success:
                return jsonify(
                    {
                        "status": "queued",
                        "message": f"User {data['spotify_email']} queued for addition",
                    }
                )
            else:
                return (
                    jsonify({"status": "error", "message": "Failed to queue user"}),
                    500,
                )

        # Normal flow when service is ready
        success = browser.add_user(data["user_id"], data["spotify_email"])

        if success:
            return jsonify(
                {
                    "status": "success",
                    "message": f"User {data['spotify_email']} added successfully",
                }
            )
        else:
            # If addition fails, queue for later
            queue_success = browser.queue_user_for_later_addition(
                data["user_id"], data["spotify_email"], is_bar=False
            )

            return jsonify(
                {
                    "status": "queued" if queue_success else "error",
                    "message": (
                        f"User {data['spotify_email']} queued for later addition"
                        if queue_success
                        else "Failed to add user"
                    ),
                }
            ), (500 if not queue_success else 202)

    except Exception as e:
        logger.error(f"Error in add_user endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/add_bar", methods=["POST"])
def add_bar_endpoint():
    """Add a bar to a Spotify app"""
    try:
        data = request.json
        required_fields = ["bar_id", "spotify_email"]
        if not data or not all(field in data for field in required_fields):
            return jsonify({"error": "Missing required fields"}), 400

        # Create browser session
        browser = BrowserSession()

        # Queue for later if something fails before actual addition
        if not browser.load_config("config.json") or not browser.connect_db():
            success = browser.queue_user_for_later_addition(
                data["bar_id"], data["spotify_email"], is_bar=True
            )

            if success:
                return jsonify(
                    {
                        "status": "queued",
                        "message": f"Bar {data['spotify_email']} queued for addition",
                    }
                )
            else:
                return (
                    jsonify({"status": "error", "message": "Failed to queue bar"}),
                    500,
                )

        # Normal flow when service is ready
        success = browser.add_bar(data["bar_id"], data["spotify_email"])

        if success:
            return jsonify(
                {
                    "status": "success",
                    "message": f"Bar {data['spotify_email']} added successfully",
                }
            )
        else:
            # If addition fails, queue for later
            queue_success = browser.queue_user_for_later_addition(
                data["bar_id"], data["spotify_email"], is_bar=True
            )

            return jsonify(
                {
                    "status": "queued" if queue_success else "error",
                    "message": (
                        f"Bar {data['spotify_email']} queued for later addition"
                        if queue_success
                        else "Failed to add bar"
                    ),
                }
            ), (500 if not queue_success else 202)

    except Exception as e:
        logger.error(f"Error in add_bar endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/get_credentials/<app_name>", methods=["GET"])
def get_credentials_endpoint(app_name):
    """Get credentials for a specific app"""
    try:
        # Create browser session
        browser = BrowserSession()
        if not browser.load_config("config.json") or not browser.connect_db():
            return (
                jsonify({"status": "error", "message": "Failed to initialize service"}),
                500,
            )

        # First try to get from database
        browser.cursor.execute(
            """
            SELECT client_id, client_secret 
            FROM clubfindr.spotify_apps 
            WHERE app_name = %s
        """,
            (app_name,),
        )
        result = browser.cursor.fetchone()

        if result and result["client_id"] and result["client_secret"]:
            # We have credentials in database
            browser.close_db()
            return jsonify(
                {
                    "status": "success",
                    "app_name": app_name,
                    "credentials": {
                        "client_id": result["client_id"],
                        "client_secret": result["client_secret"],
                    },
                }
            )

        # If not in database, need to get from browser
        try:
            if not browser.initialize_browser():
                return (
                    jsonify(
                        {"status": "error", "message": "Failed to initialize browser"}
                    ),
                    500,
                )

            if not browser.login():
                return (
                    jsonify(
                        {"status": "error", "message": "Failed to login to Spotify"}
                    ),
                    500,
                )

            # Navigate to the app
            browser.navigate_to_app(app_name)

            # Get credentials
            credentials = browser.get_app_credentials()

            # Save to database for future use
            browser.cursor.execute(
                """
                UPDATE clubfindr.spotify_apps
                SET client_id = %s, client_secret = %s
                WHERE app_name = %s
            """,
                (credentials["client_id"], credentials["client_secret"], app_name),
            )
            browser.db.commit()

            return jsonify(
                {"status": "success", "app_name": app_name, "credentials": credentials}
            )
        finally:
            # Clean up resources
            browser.close_browser()
            browser.close_db()

    except Exception as e:
        logger.error(f"Error in get_credentials endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/process_queue", methods=["POST"])
def process_queue_endpoint():
    """Process the pending queue"""
    try:
        # Create browser session
        browser = BrowserSession()
        if not browser.load_config("config.json") or not browser.connect_db():
            return (
                jsonify({"status": "error", "message": "Failed to initialize service"}),
                500,
            )

        # Process the queue
        browser.process_pending_queue()

        # Clean up resources
        browser.close_db()

        return jsonify({"status": "success", "message": "Queue processing completed"})
    except Exception as e:
        logger.error(f"Error in process_queue endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# Initialize database
def init_database():
    """Initialize database tables"""
    try:
        # Create browser session just for database connection
        browser = BrowserSession()
        if not browser.load_config("config.json") or not browser.connect_db():
            logger.error("Failed to connect to database for initialization")
            return False

        browser.cursor.execute(SCHEMA)
        browser.db.commit()
        browser.close_db()
        logger.info("Database initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        return False


# Run the application
if __name__ == "__main__":
    try:
        logger.info("==== STARTING SPOTIFY ON-DEMAND SERVICE ====")

        # Initialize database
        if not init_database():
            logger.error("Failed to initialize database - exiting")
            sys.exit(1)

        # Process any pending queue items at startup
        try:
            browser = BrowserSession()
            if browser.load_config("config.json") and browser.connect_db():
                browser.process_pending_queue()
                browser.close_db()
        except Exception as e:
            logger.error(f"Error processing queue at startup: {str(e)}")
            # Continue even if queue processing fails

        # Run the Flask app
        app.run(host="0.0.0.0", port=5000)

    except Exception as e:
        logger.error(f"Unhandled exception in main: {str(e)}")
        logger.error(traceback.format_exc())
        sys.exit(1)
