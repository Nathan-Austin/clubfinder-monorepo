import os
import random
import time
import gc
import logging
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from ..config import config

logger = logging.getLogger(__name__)


class BrowserSession:
    def __init__(self, worker_id="default"):
        self.screenshots_dir = "screenshots"
        self.driver = None
        self.wait = None
        self.is_logged_in = False
        self.current_app = None
        self.worker_id = worker_id

        # Create screenshots directory
        os.makedirs(self.screenshots_dir, exist_ok=True)

    def initialize_browser(self):
        """Initialize browser for a new session"""
        try:
            logger.info(f"Initializing browser for session (Worker: {self.worker_id})")

            options = Options()

            # Set up chrome directories relative to current working directory
            # Use worker-specific directories to prevent locking conflicts
            base_dir = os.getcwd()
            user_data_dir = os.path.join(base_dir, f"chrome_profile_{self.worker_id}")
            cache_dir = os.path.join(base_dir, f"chrome_cache_{self.worker_id}")

            # Ensure directories exist with proper permissions
            for directory in [user_data_dir, cache_dir]:
                os.makedirs(directory, exist_ok=True)
                os.chmod(directory, 0o755)

            # Configure Chrome options
            options.add_argument(f"--user-data-dir={user_data_dir}")
            options.add_argument(f"--disk-cache-dir={cache_dir}")
            if config.HEADLESS:
                options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--disable-extensions")
            options.add_argument("--window-size=1920,1080")

            # Enhanced anti-detection options
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument(
                "user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
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

            # Try common chromedriver paths
            driver_paths = [
                config.CHROME_DRIVER_PATH,
                "/snap/bin/chromium.chromedriver",
                os.path.join(base_dir, "bin", "chromedriver"),
            ]

            self.driver = None
            for path in driver_paths:
                if os.path.exists(path):
                    try:
                        service = Service(executable_path=path)
                        self.driver = webdriver.Chrome(service=service, options=options)
                        logger.info(f"Successfully created Chrome driver using: {path}")
                        break
                    except Exception as e:
                        logger.warning(f"Failed to use driver at {path}: {str(e)}")

            if not self.driver:
                logger.info("Using automatic ChromeDriver detection")
                self.driver = webdriver.Chrome(options=options)

            # Set timeouts and create wait
            self.driver.set_page_load_timeout(30)
            self.driver.set_script_timeout(30)
            self.wait = WebDriverWait(self.driver, 30)

            logger.info("Browser successfully initialized")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize browser: {str(e)}")
            self.close_browser(force_cleanup=True)
            return False

    def check_health(self):
        """Check if browser is responsive"""
        if not self.driver:
            return False
        try:
            # Simple lightweight check
            _ = self.driver.current_url
            return True
        except Exception:
            return False

    def close_browser(self, force_cleanup=False):
        """Close browser and clean up resources"""
        try:
            logger.info(f"Closing browser session (Worker: {self.worker_id})")
            if self.driver:
                try:
                    self.driver.quit()
                except Exception as e:
                    logger.error(f"Error quitting browser: {str(e)}")
                finally:
                    self.driver = None
                    self.wait = None

            if force_cleanup:
                # Forceful cleanup
                try:
                    from .cleanup import cleanup_processes

                    # Only clean up this worker's specific processes if possible,
                    # but current cleanup is global. Use with caution.
                    # Ideally, we'd pass ignore_pids to cleanup_processes.
                    cleanup_processes()
                except Exception as e:
                    logger.error(f"Error running cleanup processes: {str(e)}")

            self.is_logged_in = False
            gc.collect()
            return True
        except Exception as e:
            logger.error(f"Error during browser cleanup: {str(e)}")
            return False

    def random_delay(self, min_seconds=1, max_seconds=3):
        """Add a random delay to simulate human behavior"""
        time.sleep(random.uniform(min_seconds, max_seconds))

    def simulate_human_typing(self, element, text):
        """Simulate human typing with random delays between keystrokes"""
        for char in text:
            element.send_keys(char)
            time.sleep(random.uniform(0.1, 0.3))

    def safe_screenshot(self, description):
        """Safely take a screenshot with error handling and unique naming"""
        try:
            if not self.driver:
                return None
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"{description}_{timestamp}.png"
            full_path = os.path.join(self.screenshots_dir, filename)
            self.driver.save_screenshot(full_path)
            logger.info(f"Screenshot saved: {filename}")
            return full_path
        except Exception as e:
            logger.error(f"Error taking screenshot: {str(e)}")
            return None
