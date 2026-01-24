import pytest
from unittest.mock import Mock, patch, MagicMock
from spotify_automation.services.notification_service import NotificationService


class TestNotificationService:
    @patch("smtplib.SMTP")
    def test_notify_success(self, mock_smtp_class):
        # Setup
        mock_smtp = mock_smtp_class.return_value
        mock_smtp.__enter__.return_value = mock_smtp

        # Execute
        result = NotificationService.notify_success("user@example.com", "user")

        # Verify
        assert result is True
        mock_smtp.send_message.assert_called_once()

    @patch("smtplib.SMTP")
    def test_notify_failure(self, mock_smtp_class):
        # Setup
        mock_smtp_class.side_effect = Exception("Connection failed")

        # Execute
        result = NotificationService.notify_success("user@example.com", "user")

        # Verify
        assert result is False
