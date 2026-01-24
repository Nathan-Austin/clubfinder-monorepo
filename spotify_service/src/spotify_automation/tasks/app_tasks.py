import structlog
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from selenium.common.exceptions import TimeoutException, WebDriverException
from sqlalchemy import text
from ..core import worker_state
from ..core.browser import BrowserSession
from ..database.connection import database_manager
from ..services.app_service import AppService
from ..services.auth_service import AuthService

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
    name="spotify_automation.tasks.create_spotify_app",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=600,
    autoretry_for=(TimeoutException, ConnectionError),
)
def create_spotify_app_task(self, app_type="user"):
    """Create a new Spotify app"""
    logger.info(
        "Starting create spotify app task",
        app_type=app_type,
        task_id=self.request.id,
    )

    try:
        browser = get_or_init_browser()

        app_service = AppService(browser, database_manager)
        auth_service = AuthService(browser)

        # Login is handled by get_or_init_browser potentially, but services might need to re-verify
        # However, AuthService.login() should handle "already logged in" state gracefully
        if not auth_service.login():
            raise Exception("Failed to login to Spotify")

        # Create app
        app_name = app_service.create_new_app(app_type)

        logger.info(
            "Create spotify app task completed",
            app_type=app_type,
            app_name=app_name,
        )

        return {"success": True, "app_name": app_name}

    except SoftTimeLimitExceeded:
        logger.warning("Task soft time limit exceeded", app_type=app_type)
        if worker_state.get_browser():
            worker_state.get_browser().close_browser()
        raise self.retry(exc=SoftTimeLimitExceeded())

    except WebDriverException as e:
        logger.error("WebDriver exception in create app", error=str(e))
        if worker_state.get_browser():
            worker_state.get_browser().close_browser()
        raise self.retry(exc=e)

    except Exception as e:
        logger.error("Create spotify app task failed", error=str(e), exc_info=True)
        raise


@shared_task(
    name="spotify_automation.tasks.refresh_app_credentials",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=600,
    autoretry_for=(TimeoutException, ConnectionError),
)
def refresh_app_credentials_task(self, app_name):
    """Refresh credentials for an existing Spotify app"""
    logger.info(
        "Starting refresh app credentials task",
        app_name=app_name,
        task_id=self.request.id,
    )

    session = None
    try:
        browser = get_or_init_browser()

        app_service = AppService(browser, database_manager)
        auth_service = AuthService(browser)

        if not auth_service.login():
            raise Exception("Failed to login to Spotify")

        # Navigate to app
        if not app_service.navigate_to_app(app_name):
            raise Exception(f"Failed to navigate to app: {app_name}")

        # Get credentials
        credentials = app_service.get_app_credentials()
        client_id = credentials.get("client_id")
        client_secret = credentials.get("client_secret")

        if not client_id or not client_secret:
            raise Exception("Failed to retrieve credentials")

        # Update database
        session = database_manager.get_session()
        query = """
            UPDATE clubfindr.spotify_apps
            SET client_id = :client_id, client_secret = :client_secret, updated_at = NOW()
            WHERE app_name = :app_name
        """
        session.execute(
            text(query),
            {
                "client_id": client_id,
                "client_secret": client_secret,
                "app_name": app_name,
            },
        )
        session.commit()

        logger.info(
            "Refresh app credentials task completed",
            app_name=app_name,
        )

        return {"success": True, "app_name": app_name}

    except SoftTimeLimitExceeded:
        logger.warning("Task soft time limit exceeded", app_name=app_name)
        if worker_state.get_browser():
            worker_state.get_browser().close_browser()
        raise self.retry(exc=SoftTimeLimitExceeded())

    except WebDriverException as e:
        logger.error("WebDriver exception in refresh credentials", error=str(e))
        if session:
            session.rollback()
        if worker_state.get_browser():
            worker_state.get_browser().close_browser()
        raise self.retry(exc=e)

    except Exception as e:
        logger.error("Refresh app credentials task failed", error=str(e), exc_info=True)
        if session:
            session.rollback()
        raise
    finally:
        if session:
            session.close()
