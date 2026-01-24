import os
import structlog
from datetime import datetime, timedelta
from celery import shared_task
from ..core.cleanup import cleanup_processes

logger = structlog.get_logger()


@shared_task(name="spotify_automation.tasks.cleanup_chrome_processes")
def cleanup_chrome_processes_task():
    """Clean up lingering Chrome/Selenium processes"""
    logger.info("Starting chrome process cleanup task")
    try:
        # cleanup_processes returns True on success
        result = cleanup_processes()
        logger.info("Chrome cleanup task completed")
        return {"success": result}
    except Exception as e:
        logger.error("Chrome process cleanup failed", error=str(e))
        raise


@shared_task(name="spotify_automation.tasks.cleanup_old_screenshots")
def cleanup_old_screenshots_task(days=7):
    """Remove screenshots older than N days"""
    logger.info(f"Starting screenshot cleanup task (older than {days} days)")

    # Assuming screenshots are in 'screenshots' directory in the working directory
    screenshot_dir = os.path.join(os.getcwd(), "screenshots")

    if not os.path.exists(screenshot_dir):
        logger.info(f"Screenshot directory not found: {screenshot_dir}")
        return {"success": True, "deleted_count": 0}

    cutoff_time = datetime.now() - timedelta(days=days)
    deleted_count = 0

    try:
        for filename in os.listdir(screenshot_dir):
            file_path = os.path.join(screenshot_dir, filename)
            # Only delete image files to be safe
            if os.path.isfile(file_path) and filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                file_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                if file_time < cutoff_time:
                    try:
                        os.remove(file_path)
                        deleted_count += 1
                    except Exception as delete_error:
                        logger.warning(f"Failed to delete {filename}", error=str(delete_error))

        logger.info(f"Screenshot cleanup completed. Deleted {deleted_count} files.")
        return {"success": True, "deleted_count": deleted_count}
    except Exception as e:
        logger.error("Screenshot cleanup failed", error=str(e))
        raise
