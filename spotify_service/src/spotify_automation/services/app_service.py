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

        # Fallback to listing/searching
        self.driver.get("https://developer.spotify.com/dashboard")
        time.sleep(5)
        return False  # Simplified for extraction

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

    def create_new_app(self, app_type="user"):
        """Create new Spotify app and return its name"""
        session = self.db_manager.get_session()
        try:
            logger.info(f"Creating new Spotify app for {app_type}")

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
            self.browser.simulate_human_typing(name_input, app_name)

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
            self.browser.simulate_human_typing(desc_input, description)

            # Add redirect URI
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
                logger.error("Could not extract app ID from URL after app creation")
                self.browser.safe_screenshot("app_creation_error")
                raise Exception("Could not extract app ID from URL after app creation")

            app_id = app_id_match.group(1)
            logger.info(f"Extracted app ID: {app_id} for app {app_name}")

            # Get the credentials for this app
            logger.info(f"Getting credentials for newly created app {app_name}")
            credentials = self.get_app_credentials()
            client_id = credentials.get("client_id")
            client_secret = credentials.get("client_secret")

            if not client_id or not client_secret:
                logger.error("Failed to get valid credentials for the new app")
                self.browser.safe_screenshot("credentials_error")
                raise Exception("Failed to get valid credentials for the new app")

            logger.info(f"Successfully retrieved credentials for app {app_name}")

            # Save the app with credentials to the database
            query = """
                INSERT INTO clubfindr.spotify_apps
                (app_name, app_id, is_active, user_count, app_type, client_id, client_secret, created_at)
                VALUES (:app_name, :app_id, :is_active, :user_count, :app_type, :client_id, :client_secret, NOW())
            """
            session.execute(
                text(query),
                {
                    "app_name": app_name,
                    "app_id": app_id,
                    "is_active": True,
                    "user_count": 0,
                    "app_type": app_type,
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )

            # Update local app_info.json
            app_info_path = os.path.join(os.getcwd(), "app_info.json")

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

            logger.info(f"Updated app_info.json with new {app_type} app: {app_name}")

            # Commit database transaction
            session.commit()
            logger.info(
                f"Successfully created and saved {app_type} app: {app_name} with credentials"
            )

            return app_name

        except Exception as e:
            logger.error(f"Error in app creation process: {str(e)}")
            session.rollback()
            raise
        finally:
            session.close()

    def get_app_credentials(self):
        """Get Client ID and Secret from current app"""
        try:
            logger.info("Getting app credentials")

            # Click Settings button
            settings_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, '//a[contains(@href, "/settings")]')
                )
            )
            settings_button.click()
            time.sleep(3)

            # Take a screenshot for debugging
            self.browser.safe_screenshot("settings_page")

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
                logger.info(f"Found Client ID using approach 1: {client_id}")
            except Exception as e:
                logger.warning(f"Approach 1 for Client ID failed: {e}")

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
                                logger.info(
                                    f"Found Client ID using approach 2: {client_id}"
                                )
                                break
                        if client_id:
                            break
                except Exception as e:
                    logger.warning(f"Approach 2 for Client ID failed: {e}")

            if not client_id:
                self.browser.safe_screenshot("client_id_not_found")
                raise Exception("Could not find Client ID")

            logger.info(f"Found Client ID: {client_id}")

            # Find the "View client secret" button
            logger.info("Looking for 'View client secret' button...")
            view_buttons = self.driver.find_elements(
                By.XPATH,
                '//button[contains(text(), "View client secret") or contains(text(), "SHOW") or contains(text(), "Show")]',
            )

            view_secret_button = None
            for button in view_buttons:
                if button.is_displayed():
                    view_secret_button = button
                    logger.info(f"Found button with text: {button.text}")
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
                        logger.info(
                            f"Found potential secret button with text: {button.text}"
                        )
                        break

            if not view_secret_button:
                self.browser.safe_screenshot("view_button_not_found")
                raise Exception("Could not find 'View client secret' button")

            # Click the button to reveal the secret
            try:
                view_secret_button.click()
            except Exception:
                try:
                    self.driver.execute_script(
                        "arguments[0].click();", view_secret_button
                    )
                except Exception as e:
                    logger.error(f"Failed to click view button: {e}")
                    self.browser.safe_screenshot("view_button_click_failed")
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
                logger.info(
                    f"Found Client Secret using approach 1: {client_secret[:5]}..."
                )
            except Exception as e:
                logger.warning(f"Approach 1 for Client Secret failed: {e}")

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
                                logger.info(
                                    f"Found Client Secret using approach 2: {client_secret[:5]}..."
                                )
                                break
                        if client_secret:
                            break
                except Exception as e:
                    logger.warning(f"Approach 2 for Client Secret failed: {e}")

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
                                logger.info(
                                    f"Found potential Client Secret using approach 3: {client_secret[:5]}..."
                                )
                                break
                except Exception as e:
                    logger.warning(f"Approach 3 for Client Secret failed: {e}")

            if not client_secret:
                self.browser.safe_screenshot("client_secret_not_found")
                raise Exception("Could not find Client Secret")

            logger.info(
                f"Found Client Secret (starting with {client_secret[:5]}...)"
            )

            return {"client_id": client_id, "client_secret": client_secret}

        except Exception as e:
            logger.error(f"Error getting app credentials: {str(e)}")
            self.browser.safe_screenshot("credentials_error")
            raise
