import pytest
from unittest.mock import Mock, patch, MagicMock, call
from spotify_automation.services.user_service import UserService


@pytest.fixture
def mock_components():
    return {
        "browser": Mock(),
        "db_manager": Mock(),
        "app_service": Mock(),
        "auth_service": Mock(),
    }


@pytest.fixture
def user_service(mock_components):
    return UserService(**mock_components)


class TestUserService:
    @patch("spotify_automation.services.user_service.WebDriverWait")
    def test_add_user_to_spotify_success(
        self, mock_webdriver_wait, user_service, mock_components
    ):
        # Setup
        mock_session = Mock()
        mock_components["db_manager"].get_session.return_value = mock_session

        # Mock DB results
        mock_session.execute.return_value.fetchone.return_value = ["TestUser"]

        mock_components["auth_service"].login.return_value = True
        mock_components["app_service"].get_suitable_app.return_value = {
            "name": "TestApp",
            "user_count": 10,
        }

        # Mock browser waits
        mock_components["browser"].wait.until.return_value = Mock()  # Button/Input

        # Mock WebDriverWait success
        mock_webdriver_wait.return_value.until.return_value = True

        # Execute
        result = user_service.add_user_to_spotify("user123", "test@example.com")

        # Verify
        assert result["success"] is True
        assert result["app_name"] == "TestApp"

        # Verify flow
        mock_components["browser"].initialize_browser.assert_called_once()
        mock_components["auth_service"].login.assert_called_once()

        assert mock_session.execute.call_count >= 3

        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    @patch("spotify_automation.services.user_service.WebDriverWait")
    def test_add_bar_to_spotify_success(
        self, mock_webdriver_wait, user_service, mock_components
    ):
        # Setup
        mock_session = Mock()
        mock_components["db_manager"].get_session.return_value = mock_session

        # Mock DB results
        mock_session.execute.return_value.fetchone.return_value = ["TestBar"]

        mock_components["auth_service"].login.return_value = True
        mock_components["app_service"].get_suitable_app.return_value = {
            "name": "TestBarApp",
            "user_count": 5,
        }

        # Mock browser waits
        mock_components["browser"].wait.until.return_value = Mock()

        # Mock WebDriverWait success
        mock_webdriver_wait.return_value.until.return_value = True

        # Execute
        result = user_service.add_bar_to_spotify("bar123", "bar@example.com")

        # Verify
        assert result["success"] is True
        assert result["app_name"] == "TestBarApp"

        mock_session.commit.assert_called_once()

    def test_add_user_to_spotify_failure(self, user_service, mock_components):
        # Setup
        mock_session = Mock()
        mock_components["db_manager"].get_session.return_value = mock_session
        mock_components["browser"].initialize_browser.side_effect = Exception(
            "Browser init failed"
        )

        # Execute
        with pytest.raises(Exception) as exc:
            user_service.add_user_to_spotify("user123", "test@example.com")

        assert "Browser init failed" in str(exc.value)

        # Verify cleanup happens even on error
        mock_components["browser"].close_browser.assert_called_once()
        mock_session.rollback.assert_called_once()
        mock_session.close.assert_called_once()
