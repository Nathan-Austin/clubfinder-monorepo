import structlog
from celery import Celery
from celery.schedules import crontab
from .config import config

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


# Register error handler (optional, can be expanded later)
@app.task(bind=True)
def handle_task_error(self, task_id, exc):
    logger.error(f"Task {task_id} failed", error=str(exc))


# Expose the Celery app
__all__ = ["app"]
celery = app
