import pytest
from unittest.mock import patch
from spotify_automation.tasks.user_tasks import add_user_task
from spotify_automation.tasks.bar_tasks import add_bar_task

# Configure Celery to be eager (run synchronously) for tests
from spotify_automation.celery import app

app.conf.task_always_eager = True
app.conf.task_eager_propagates = True


class TestTasks:
    @patch("spotify_automation.tasks.user_tasks.BrowserSession")
    @patch("spotify_automation.tasks.user_tasks.UserService")
    @patch("spotify_automation.tasks.user_tasks.AppService")
    @patch("spotify_automation.tasks.user_tasks.AuthService")
    @patch("spotify_automation.tasks.user_tasks.NotificationService")
    def test_add_user_task_success(
        self, mock_notify, mock_auth, mock_app, mock_user_svc_cls, mock_browser_cls
    ):
        # Setup
        mock_user_svc = mock_user_svc_cls.return_value
        mock_user_svc.add_user_to_spotify.return_value = {"app_name": "TestApp"}

        # Execute
        result = add_user_task.delay("user123", "test@example.com")

        # Verify
        assert result.successful()
        assert result.result["app_name"] == "TestApp"

        mock_user_svc.add_user_to_spotify.assert_called_with(
            "user123", "test@example.com"
        )
        mock_notify.notify_success.assert_called_with(
            "test@example.com", entity_type="user"
        )

        # Browser cleanup is handled by user_service, so task shouldn't call it on success  # noqa: E501
        mock_browser_cls.return_value.close_browser.assert_not_called()

    @patch("spotify_automation.tasks.bar_tasks.BrowserSession")
    @patch("spotify_automation.tasks.bar_tasks.UserService")
    @patch("spotify_automation.tasks.bar_tasks.AppService")
    @patch("spotify_automation.tasks.bar_tasks.AuthService")
    @patch("spotify_automation.tasks.bar_tasks.NotificationService")
    def test_add_bar_task_success(
        self, mock_notify, mock_auth, mock_app, mock_user_svc_cls, mock_browser_cls
    ):
        # Setup
        mock_user_svc = mock_user_svc_cls.return_value
        mock_user_svc.add_bar_to_spotify.return_value = {"app_name": "TestBarApp"}

        # Execute
        result = add_bar_task.delay("bar123", "bar@example.com")

        # Verify
        assert result.successful()
        assert result.result["app_name"] == "TestBarApp"

        mock_user_svc.add_bar_to_spotify.assert_called_with("bar123", "bar@example.com")
        mock_notify.notify_success.assert_called_with(
            "bar@example.com", entity_type="bar"
        )

    @patch("spotify_automation.tasks.user_tasks.BrowserSession")
    @patch("spotify_automation.tasks.user_tasks.UserService")
    @patch("spotify_automation.tasks.user_tasks.NotificationService")
    def test_add_user_task_failure(
        self, mock_notify, mock_user_svc_cls, mock_browser_cls
    ):
        # Setup
        mock_user_svc = mock_user_svc_cls.return_value
        mock_user_svc.add_user_to_spotify.side_effect = Exception("Failed")

        # Execute
        # In eager mode with propagate=True, it raises exception
        with pytest.raises(Exception):
            add_user_task.delay("user123", "test@example.com")

        # Verify cleanup in task (the catch block calls browser.close_browser)
        # UPDATE: Code explicitly avoids closing browser on generic exceptions
        # to preserve state for debugging
        mock_browser_cls.return_value.close_browser.assert_not_called()
