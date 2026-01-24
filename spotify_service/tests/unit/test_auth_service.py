import pytest
from unittest.mock import Mock, patch
from spotify_automation.services.auth_service import AuthService
from selenium.webdriver.common.by import By


@pytest.fixture
def mock_browser():
    browser = Mock()
    browser.driver = Mock()
    browser.wait = Mock()
    browser.is_logged_in = False
    return browser


@pytest.fixture
def auth_service(mock_browser):
    return AuthService(mock_browser)


class TestAuthService:
    def test_init(self, auth_service, mock_browser):
        # Verify dynamic property access
        assert auth_service.browser == mock_browser
        assert auth_service.driver == mock_browser.driver
        assert auth_service.wait == mock_browser.wait

    @patch("spotify_automation.services.auth_service.time.sleep")
    def test_detect_login_status_true(self, mock_sleep, auth_service):
        # Setup
        auth_service.driver.find_elements.return_value = [Mock()]

        # Execute
        result = auth_service.detect_login_status()

        # Verify
        assert result is True
        assert auth_service.browser.is_logged_in is True
        auth_service.driver.get.assert_called_with(
            "https://developer.spotify.com/dashboard"
        )

    @patch("spotify_automation.services.auth_service.time.sleep")
    def test_detect_login_status_false(self, mock_sleep, auth_service):
        # Setup
        auth_service.driver.find_elements.return_value = []

        # Execute
        result = auth_service.detect_login_status()

        # Verify
        assert result is False

    @patch("spotify_automation.services.auth_service.time.sleep")
    def test_find_and_click_login_success(self, mock_sleep, auth_service):
        # Setup
        mock_button = Mock()
        auth_service.wait.until.return_value = mock_button

        # Execute
        result = auth_service.find_and_click_login()

        # Verify
        assert result is True
        mock_button.click.assert_called_once()
