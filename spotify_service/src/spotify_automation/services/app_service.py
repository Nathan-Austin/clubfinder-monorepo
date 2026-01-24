import logging
import json
import os
import re
import time
from datetime import datetime
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from sqlalchemy import text

logger = logging.getLogger(__name__)


class AppService:
    def __init__(self, browser, db_manager):
        self.browser = browser
        self.db_manager = db_manager

    @property
    def driver(self):
        return self.browser.driver

    @property
    def wait(self):
        return self.browser.wait

    def load_app_info(self):
        """Load app info from local JSON"""
        app_info_path = os.path.join(os.getcwd(), "app_info.json")
        if os.path.exists(app_info_path):
            with open(app_info_path, "r") as f:
                return json.load(f)
        return {
            "user_apps": [],
            "bar_apps": [],
            "last_updated": datetime.now().isoformat(),
        }

    def update_app_info(self, app_type="user", app_name=None, user_count=None):
        """Update local app info JSON"""
        app_info = self.load_app_info()
        app_list_key = "user_apps" if app_type == "user" else "bar_apps"

        found = False
        for app in app_info[app_list_key]:
            if app["name"] == app_name:
                if user_count is not None:
                    app["user_count"] = user_count
                found = True
                break

        if not found and app_name:
            app_info[app_list_key].append(
                {"name": app_name, "user_count": user_count or 0, "is_active": True}
            )

        app_info["last_updated"] = datetime.now().isoformat()
        with open("app_info.json", "w") as f:
            json.dump(app_info, f, indent=4)

    def get_suitable_app(self, app_type="user"):
        """Select best app based on load"""
        app_info = self.load_app_info()
        app_list_key = "user_apps" if app_type == "user" else "bar_apps"
        active_apps = [
            app for app in app_info[app_list_key] if app.get("is_active", True)
        ]

        if not active_apps:
            return None

        sorted_apps = sorted(active_apps, key=lambda x: x.get("user_count", 0))
        return sorted_apps[0]

    def navigate_to_app(self, app_name):
        """Navigate to specific Spotify app dashboard"""
        logger.info(f"Navigating to app: {app_name}")
        app_info = self.load_app_info()

        target_app = None
        for app_list in ["user_apps", "bar_apps"]:
            for app in app_info.get(app_list, []):
                if app["name"] == app_name:
                    target_app = app
                    break

        if target_app and target_app.get("app_id"):
            url = f"https://developer.spotify.com/dashboard/{target_app['app_id']}"
            self.driver.get(url)
            time.sleep(5)
            return True

        self.driver.get("https://developer.spotify.com/dashboard")
        time.sleep(5)
        return False

    def navigate_to_user_management(self, app_name):
        """Navigate to user management section"""
        current_url = self.driver.current_url
        app_id_match = re.search(r"/dashboard/([a-f0-9]{32})", current_url)

        if app_id_match:
            app_id = app_id_match.group(1)
            self.driver.get(f"https://developer.spotify.com/dashboard/{app_id}/users")
            time.sleep(5)
            return True
        return False

    def _calculate_next_app_number(self, base_name):
        """Determine the next available app number."""
        app_links = self.driver.find_elements(By.CSS_SELECTOR, 'a[href*="/dashboard/"]')
        existing_numbers = []
        for link in app_links:
            app_text = link.text.strip()
            if base_name in app_text:
                try:
                    num = int(app_text.replace(base_name, "").strip())
                    existing_numbers.append(num)
                except ValueError:
                    continue
        return max(existing_numbers) + 1 if existing_numbers else 1

    def _fill_app_details(self, app_name, description):
        """Fill in the app name and description."""
        name_input = self.wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'input[data-encore-id="formInput"][name="name"]')
            )
        )
        self.browser.simulate_human_typing(name_input, app_name)

        desc_input = self.wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'textarea[data-encore-id="formTextarea"]')
            )
        )
        self.browser.simulate_human_typing(desc_input, description)

    def _configure_app_settings(self):
        """Configure Redirect URI, Web API, and Terms."""
        redirect_uri = "https://www.clubfindr.com/spotify/login"
        uri_input = self.wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'input[name="newRedirectUri"]')
            )
        )
        self.browser.simulate_human_typing(uri_input, redirect_uri)

        add_uri_button = self.wait.until(
            EC.element_to_be_clickable(
                (By.CSS_SELECTOR, 'button[aria-label="Add redirect URI"]')
            )
        )
        add_uri_button.click()
        time.sleep(1)

        web_api_checkbox = self.wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'input[id="apis-used-1"]'))
        )
        if not web_api_checkbox.is_selected():
            self.driver.find_element(
                By.CSS_SELECTOR, 'label[for="apis-used-1"]'
            ).click()

        terms_indicator = self.wait.until(
            EC.element_to_be_clickable(
                (By.CSS_SELECTOR, 'label[for="termsAccepted"] .Indicator-sc-1airx73-0')
            )
        )
        terms_indicator.click()

    def _save_app_to_db(self, session, app_data):
        """Save the new app to the database."""
        query = """
            INSERT INTO clubfindr.spotify_apps
            (app_name, app_id, is_active, user_count, app_type, client_id, client_secret, created_at)  # noqa: E501
            VALUES (:app_name, :app_id, :is_active, :user_count, :app_type, :client_id, :client_secret, NOW())  # noqa: E501
        """
        session.execute(text(query), app_data)

    def create_new_app(self, app_type="user"):
        """Create new Spotify app and return its name"""
        session = self.db_manager.get_session()
        try:
            logger.info(f"Creating new Spotify app for {app_type}")
            self.driver.get("https://developer.spotify.com/dashboard")
            time.sleep(3)

            base_name = "Clubfindr Bars" if app_type == "bar" else "Party Recommender"
            next_number = self._calculate_next_app_number(base_name)
            app_name = f"{base_name} {next_number}"

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

            description = f"{'Bar' if app_type == 'bar' else 'Party'} music recommendation app instance {next_number}"  # noqa: E501
            self._fill_app_details(app_name, description)
            self._configure_app_settings()

            save_button = self.wait.until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        'button[type="submit"][data-encore-id="buttonPrimary"]',
                    )
                )
            )
            save_button.click()
            time.sleep(5)

            current_url = self.driver.current_url
            app_id_match = re.search(r"/dashboard/([a-f0-9]{32})", current_url)
            if not app_id_match:
                raise Exception("Could not extract app ID from URL after app creation")

            app_id = app_id_match.group(1)
            credentials = self.get_app_credentials()

            app_data = {
                "app_name": app_name,
                "app_id": app_id,
                "is_active": True,
                "user_count": 0,
                "app_type": app_type,
                "client_id": credentials.get("client_id"),
                "client_secret": credentials.get("client_secret"),
            }

            self._save_app_to_db(session, app_data)

            # Update local json
            self.update_app_info(app_type, app_name, 0)

            session.commit()
            return app_name

        except Exception as e:
            logger.error(f"Error in app creation process: {str(e)}")
            session.rollback()
            self.browser.safe_screenshot("app_creation_error")
            raise
        finally:
            session.close()

    def _find_client_id(self):
        """Attempt to find Client ID using multiple strategies."""
        # Strategy 1: Label then value
        try:
            label = self.wait.until(
                EC.presence_of_element_located((By.XPATH, '//span[text()="Client ID"]'))
            )
            parent = label.find_element(By.XPATH, "./ancestor::div[1]")
            return parent.find_element(
                By.XPATH, './/span[not(text()="Client ID")]'
            ).text
        except Exception:
            pass

        # Strategy 2: Any element containing Client ID
        try:
            elements = self.driver.find_elements(
                By.XPATH, '//*[contains(text(), "Client ID")]'
            )
            for element in elements:
                parent = element.find_element(By.XPATH, "./parent::*")
                potentials = parent.find_elements(By.XPATH, ".//span")
                for p in potentials:
                    if p.text and "Client ID" not in p.text:
                        return p.text
        except Exception:
            pass
        return None

    def _reveal_client_secret(self):
        """Click the button to reveal client secret."""
        view_buttons = self.driver.find_elements(
            By.XPATH,
            '//button[contains(text(), "View client secret") or contains(text(), "SHOW") or contains(text(), "Show")]',  # noqa: E501
        )

        view_button = next((b for b in view_buttons if b.is_displayed()), None)
        if not view_button:
            # Fallback
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            view_button = next(
                (
                    b
                    for b in buttons
                    if b.is_displayed()
                    and any(w in b.text.lower() for w in ["view", "show", "secret"])
                ),
                None,
            )

        if not view_button:
            raise Exception("Could not find 'View client secret' button")

        try:
            view_button.click()
        except Exception:
            self.driver.execute_script("arguments[0].click();", view_button)

        time.sleep(2)

    def _find_secret_by_label(self):
        """Strategy 1: Find secret by label."""
        try:
            label = self.wait.until(
                EC.presence_of_element_located(
                    (By.XPATH, '//span[text()="Client secret"]')
                )
            )
            parent = label.find_element(By.XPATH, "./ancestor::div[1]")
            return parent.find_element(
                By.XPATH, './/span[not(text()="Client secret")]'
            ).text
        except Exception:
            return None

    def _find_secret_by_container(self):
        """Strategy 2: Find secret by container element."""
        try:
            elements = self.driver.find_elements(
                By.XPATH, '//*[contains(text(), "Client secret")]'
            )
            for element in elements:
                parent = element.find_element(By.XPATH, "./parent::*")
                potentials = parent.find_elements(By.XPATH, ".//span")
                for p in potentials:
                    if p.text and "Client secret" not in p.text and len(p.text) > 10:
                        return p.text
        except Exception:
            pass
        return None

    def _find_secret_by_heuristic(self):
        """Strategy 3: Heuristic find of long alphanumeric string."""
        try:
            spans = self.driver.find_elements(By.TAG_NAME, "span")
            for span in spans:
                if span.is_displayed():
                    text = span.text.strip()
                    if len(text) >= 32 and all(c.isalnum() for c in text):
                        return text
        except Exception:
            pass
        return None

    def _find_client_secret(self):
        """Attempt to find Client Secret using multiple strategies."""
        secret = self._find_secret_by_label()
        if secret:
            return secret

        secret = self._find_secret_by_container()
        if secret:
            return secret

        return self._find_secret_by_heuristic()

    def get_app_credentials(self):
        """Get Client ID and Secret from current app"""
        try:
            logger.info("Getting app credentials")

            settings_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, '//a[contains(@href, "/settings")]')
                )
            )
            settings_button.click()
            time.sleep(3)
            self.browser.safe_screenshot("settings_page")

            client_id = self._find_client_id()
            if not client_id:
                raise Exception("Could not find Client ID")
            logger.info(f"Found Client ID: {client_id}")

            self._reveal_client_secret()

            client_secret = self._find_client_secret()
            if not client_secret:
                raise Exception("Could not find Client Secret")
            logger.info("Found Client Secret")

            return {"client_id": client_id, "client_secret": client_secret}

        except Exception as e:
            logger.error(f"Error getting app credentials: {str(e)}")
            self.browser.safe_screenshot("credentials_error")
            raise
