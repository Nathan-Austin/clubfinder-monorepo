import pytest
import json
import os
from unittest.mock import Mock, patch, mock_open
from spotify_automation.services.app_service import AppService


@pytest.fixture
def mock_browser():
    browser = Mock()
    browser.driver = Mock()
    browser.wait = Mock()
    return browser


@pytest.fixture
def mock_db_manager():
    return Mock()


@pytest.fixture
def app_service(mock_browser, mock_db_manager):
    return AppService(mock_browser, mock_db_manager)


class TestAppService:
    def test_init(self, app_service, mock_browser):
        assert app_service.driver == mock_browser.driver
        assert app_service.wait == mock_browser.wait

    def test_load_app_info_exists(self, app_service):
        test_data = {"user_apps": [], "bar_apps": []}
        with (
            patch("builtins.open", mock_open(read_data=json.dumps(test_data))),
            patch("os.path.exists", return_value=True),
        ):
            result = app_service.load_app_info()
            assert result == test_data

    def test_load_app_info_not_exists(self, app_service):
        with patch("os.path.exists", return_value=False):
            result = app_service.load_app_info()
            assert "user_apps" in result
            assert "bar_apps" in result
            assert result["user_apps"] == []

    def test_get_suitable_app(self, app_service):
        test_data = {
            "user_apps": [
                {"name": "App1", "user_count": 10, "is_active": True},
                {"name": "App2", "user_count": 5, "is_active": True},
            ]
        }
        with patch.object(app_service, "load_app_info", return_value=test_data):
            result = app_service.get_suitable_app(app_type="user")
            assert result["name"] == "App2"
