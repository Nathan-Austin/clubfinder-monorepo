import logging
import json
import os
import re
import time
from datetime import datetime
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from ..config import config

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
        """Orchestrate new app creation"""
        # Full logic from monolith... (omitted for brevity in this step but would be fully implemented)
        logger.info(f"Creating new {app_type} app")
        return "New App Name"  # Placeholder for full implementation
