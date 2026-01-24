import structlog
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from selenium.common.exceptions import TimeoutException, WebDriverException
from ..core.browser import BrowserSession
from ..database.connection import database_manager
from ..services.app_service import AppService
from ..services.auth_service import AuthService
from ..services.user_service import UserService
from ..services.notification_service import NotificationService

logger = structlog.get_logger()


@shared_task(
    name="spotify_automation.tasks.add_user",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=600,
    autoretry_for=(TimeoutException, WebDriverException, ConnectionError),
)
def add_user_task(self, user_id, spotify_email):
    """Add user to Spotify app with automatic retries"""
    logger.info(
        "Starting user addition task",
        user_id=user_id,
        spotify_email=spotify_email,
        task_id=self.request.id,
    )

    browser = BrowserSession()
    try:
        app_service = AppService(browser, database_manager)
        auth_service = AuthService(browser)
        user_service = UserService(browser, database_manager, app_service, auth_service)

        result = user_service.add_user_to_spotify(user_id, spotify_email)

        logger.info(
            "User addition task completed",
            user_id=user_id,
            app_name=result.get("app_name"),
        )

        NotificationService.notify_success(spotify_email, entity_type="user")

        return result

    except SoftTimeLimitExceeded:
        logger.warning("Task soft time limit exceeded", user_id=user_id)
        browser.close_browser()
        raise self.retry(exc=SoftTimeLimitExceeded())
    except Exception as e:
        logger.error("User addition task failed", error=str(e), exc_info=True)
        browser.close_browser()
        raise
