import os
import structlog
from celery import Celery
from celery.signals import worker_process_init, worker_process_shutdown
from celery.schedules import crontab
from .config import config
from .core.browser import BrowserSession
from .core import worker_state

# Configure logging
logger = structlog.get_logger()

# Create Celery app
# Using config.REDIS_URL which defaults to db 1
app = Celery(
    "spotify_automation",
    broker=config.REDIS_URL,
    backend=config.REDIS_URL,
)

# Configure Celery
app.conf.update(
    # Use UTC for consistency
    enable_utc=True,
    timezone="UTC",
    # Periodic task schedule
    beat_schedule={
        "process-failed-tasks": {
            "task": "spotify_automation.tasks.process_failed_tasks",
            "schedule": crontab(minute="*/30"),  # Every 30 minutes
        },
        "cleanup-chrome-processes": {
            "task": "spotify_automation.tasks.cleanup_chrome_processes",
            "schedule": crontab(hour="*/6"),  # Every 6 hours
        },
        "cleanup-old-screenshots": {
            "task": "spotify_automation.tasks.cleanup_old_screenshots",
            "schedule": crontab(hour=2, minute=0),  # 2 AM daily
        },
    },
    # Task routing
    task_routes={
        # Browser automation (long-running)
        "spotify_automation.tasks.add_user": {"queue": "spotify_browser"},
        "spotify_automation.tasks.add_bar": {"queue": "spotify_browser"},
        "spotify_automation.tasks.create_spotify_app": {"queue": "spotify_browser"},
        # Database/API operations (fast)
        "spotify_automation.tasks.migrate_file_queue": {"queue": "spotify_fast"},
        "spotify_automation.tasks.refresh_app_credentials": {
            "queue": "spotify_browser"
        },
        # Maintenance
        "spotify_automation.tasks.cleanup_chrome_processes": {
            "queue": "spotify_maintenance"
        },
        "spotify_automation.tasks.cleanup_old_screenshots": {
            "queue": "spotify_maintenance"
        },
        "spotify_automation.tasks.process_failed_tasks": {
            "queue": "spotify_maintenance"
        },
    },
    # Task settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Monitoring
    task_track_started=True,
    task_send_sent_event=True,
    task_send_result_event=True,
)

# Discover tasks in the current package
app.autodiscover_tasks(["src.spotify_automation"])


# Register error handler (optional, can be expanded later)
@app.task(bind=True)
def handle_task_error(self, task_id, exc):
    logger.error(f"Task {task_id} failed", error=str(exc))


@worker_process_init.connect
def init_worker_browser(**kwargs):
    """Initialize browser session when worker process starts"""
    try:
        # Use PID as unique worker ID
        worker_id = str(os.getpid())
        worker_state.set_worker_id(worker_id)

        logger.info(f"Initializing worker browser pool (ID: {worker_id})")

        # Initialize the global browser session
        # We don't initialize the driver yet, just the session object
        # Driver will be initialized lazily on first use
        session = BrowserSession(worker_id=worker_id)
        worker_state.set_browser(session)

        logger.info(f"Worker browser session created (ID: {worker_id})")
    except Exception as e:
        logger.error(f"Failed to initialize worker browser: {str(e)}")


@worker_process_shutdown.connect
def shutdown_worker_browser(**kwargs):
    """Clean up browser session when worker process stops"""
    try:
        worker_id = worker_state.get_worker_id()
        logger.info(f"Shutting down worker browser pool (ID: {worker_id})")

        browser = worker_state.get_browser()
        if browser:
            browser.close_browser(force_cleanup=True)
            worker_state.set_browser(None)

        logger.info(f"Worker browser session cleaned up (ID: {worker_id})")
    except Exception as e:
        logger.error(f"Error during worker browser shutdown: {str(e)}")


# Expose the Celery app
__all__ = ["app"]
celery = app

# Set as default for @shared_task decorators
app.set_default()
