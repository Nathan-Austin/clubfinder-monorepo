import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ..config import config

logger = logging.getLogger(__name__)


class NotificationService:
    @staticmethod
    def notify_success(recipient_email, entity_type="user"):
        """Send email notification"""
        try:
            logger.info(f"Sending notification to {recipient_email}")

            message = MIMEMultipart()
            message["From"] = config.EMAIL_ADDRESS
            message["To"] = recipient_email

            if entity_type == "user":
                message["Subject"] = (
                    "Your Tilki-Clubfindr Account Has Been Connected to Spotify"
                )
                body = (
                    "Your Spotify account has been successfully connected to Clubfindr."
                )
            else:
                message["Subject"] = (
                    "Your Tilki-Clubfindr Bar Account Has Been Connected to Spotify"
                )
                body = "Your bar's Spotify account has been successfully connected to Clubfindr."

            message.attach(MIMEText(body, "plain"))

            with smtplib.SMTP(config.EMAIL_SERVER, config.SMTP_PORT) as server:
                server.starttls()
                server.login(config.EMAIL_ADDRESS, config.EMAIL_PASSWORD)
                server.send_message(message)

            return True
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return False
