import logging
import time
from sqlalchemy import text
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, browser, db_manager, app_service, auth_service):
        self.browser = browser
        self.db_manager = db_manager
        self.app_service = app_service
        self.auth_service = auth_service

    def _add_entity_to_spotify(self, entity_id, spotify_email, entity_type="user"):
        session = self.db_manager.get_session()
        try:
            # 1. Initialize & Login
            self.browser.initialize_browser()
            if not self.auth_service.login():
                raise Exception("Auth failed")

            # 2. Get entity name from DB
            table = "clubfindr.users" if entity_type == "user" else "clubfindr.bars"
            result = session.execute(
                text(f"SELECT name FROM {table} WHERE id = :id"), {"id": entity_id}
            ).fetchone()

            if not result or not result[0]:
                raise Exception(f"{entity_type.capitalize()} not found or name not set")
            entity_name = result[0]

            # 3. Find/Create App
            app = self.app_service.get_suitable_app(app_type=entity_type)
            if app:
                app_name = app["name"]
            else:
                app_name = self.app_service.create_new_app(app_type=entity_type)

            # 4. Navigate & Add
            self.app_service.navigate_to_app(app_name)
            self.app_service.navigate_to_user_management(app_name)

            self.browser.safe_screenshot(f"before_add_{entity_type}_{entity_id}")
            logger.info(
                f"Adding {entity_type} {entity_name} ({spotify_email}) to app {app_name}"  # noqa: E501
            )

            # Click Add User button
            add_button = self.browser.wait.until(
                EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, 'button[data-encore-id="buttonPrimary"]')
                )
            )
            add_button.click()
            time.sleep(2)

            # Fill details
            name_input = self.browser.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="name"][data-encore-id="formInput"]')
                )
            )
            name_input.clear()
            self.browser.simulate_human_typing(name_input, entity_name)
            time.sleep(0.5)

            email_input = self.browser.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="email"][data-encore-id="formInput"]')
                )
            )
            email_input.clear()
            self.browser.simulate_human_typing(email_input, spotify_email)
            time.sleep(0.5)

            self.browser.safe_screenshot(f"form_filled_{entity_id}")

            # Submit
            submit_button = self.browser.wait.until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        'button[type="submit"][data-encore-id="buttonPrimary"]',
                    )
                )
            )
            submit_button.click()

            # Wait for success (modal close)
            WebDriverWait(self.browser.driver, 10).until(
                EC.invisibility_of_element_located(
                    (By.CSS_SELECTOR, 'div[role="dialog"]')
                )
            )

            logger.info(
                f"Successfully added {entity_type} {entity_name} to Spotify app"
            )

            # 5. Update DB
            # Update app user count
            session.execute(
                text(
                    "UPDATE clubfindr.spotify_apps SET user_count = user_count + 1 WHERE app_name = :app_name"  # noqa: E501
                ),
                {"app_name": app_name},
            )

            # Update entity record
            session.execute(
                text(f"""
                    UPDATE {table}
                    SET spotify_app_name = :app_name,
                        spotify_email = :email,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :id
                """),
                {"app_name": app_name, "email": spotify_email, "id": entity_id},
            )

            session.commit()

            # Update local app info
            self.app_service.update_app_info(
                app_type=entity_type,
                app_name=app_name,
                user_count=(app["user_count"] + 1) if app else 1,
            )

            return {"success": True, "app_name": app_name}

        except Exception as e:
            session.rollback()
            logger.error(f"Failed to add {entity_type}: {str(e)}")
            self.browser.safe_screenshot(f"error_add_{entity_type}_{entity_id}")
            raise
        finally:
            self.browser.close_browser()
            session.close()

    def add_user_to_spotify(self, user_id, spotify_email):
        return self._add_entity_to_spotify(user_id, spotify_email, entity_type="user")

    def add_bar_to_spotify(self, bar_id, spotify_email):
        return self._add_entity_to_spotify(bar_id, spotify_email, entity_type="bar")
