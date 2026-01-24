import structlog
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from selenium.common.exceptions import TimeoutException, WebDriverException
from ..core import worker_state
from ..core.browser import BrowserSession
from ..database.connection import database_manager
from ..services.app_service import AppService
from ..services.auth_service import AuthService
from ..services.user_service import UserService
from ..services.notification_service import NotificationService

logger = structlog.get_logger()


def get_or_init_browser():
    """Helper to get a healthy browser session"""
    browser = worker_state.get_browser()
    if not browser:
        browser = BrowserSession(worker_id=str(worker_state.get_worker_id() or "temp"))
        worker_state.set_browser(browser)

    if not browser.check_health():
        logger.warning("Browser unhealthy or not initialized, restarting...")
        browser.close_browser()
        if not browser.initialize_browser():
            raise Exception("Failed to initialize browser")

    return browser


@shared_task(
    name="spotify_automation.tasks.add_bar",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=600,
    autoretry_for=(TimeoutException, ConnectionError),
)
def add_bar_task(self, bar_id, spotify_email):
    """Add bar to Spotify app with automatic retries"""
    logger.info(
        "Starting bar addition task",
        bar_id=bar_id,
        spotify_email=spotify_email,
        task_id=self.request.id,
    )

    try:
        browser = get_or_init_browser()

        app_service = AppService(browser, database_manager)
        auth_service = AuthService(browser)
        user_service = UserService(browser, database_manager, app_service, auth_service)

        result = user_service.add_bar_to_spotify(bar_id, spotify_email)

        logger.info(
            "Bar addition task completed",
            bar_id=bar_id,
            app_name=result.get("app_name"),
        )

        NotificationService.notify_success(spotify_email, entity_type="bar")

        return result

    except SoftTimeLimitExceeded:
        logger.warning("Task soft time limit exceeded", bar_id=bar_id)
        if worker_state.get_browser():
            worker_state.get_browser().close_browser()
        raise self.retry(exc=SoftTimeLimitExceeded())

    except WebDriverException as e:
        logger.error("WebDriver exception in bar addition", error=str(e))
        if worker_state.get_browser():
            worker_state.get_browser().close_browser()
        raise self.retry(exc=e)

    except Exception as e:
        logger.error("Bar addition task failed", error=str(e), exc_info=True)
        raise
