import os
import json
import shutil
import structlog
from celery import shared_task
from .user_tasks import add_user_task
from .bar_tasks import add_bar_task

logger = structlog.get_logger()


@shared_task(name="spotify_automation.tasks.migrate_file_queue")
def migrate_file_queue_task():
    """One-time migration of file-based queue to Celery"""
    # Current directory should be /home/nathan/clubfinder/spotify_service
    base_dir = os.getcwd()
    queue_dir = os.path.join(base_dir, "pending_queue")
    migrated_dir = os.path.join(queue_dir, "migrated")
    corrupt_dir = os.path.join(queue_dir, "corrupt")

    if not os.path.exists(queue_dir):
        logger.info("No pending_queue directory found, skipping migration")
        return {"status": "skipped", "message": "No queue directory"}

    os.makedirs(migrated_dir, exist_ok=True)
    os.makedirs(corrupt_dir, exist_ok=True)

    files = [f for f in os.listdir(queue_dir) if f.endswith(".json")]

    stats = {"total": len(files), "user_tasks": 0, "bar_tasks": 0, "failed": 0}

    logger.info("Starting file queue migration", count=len(files))

    for filename in files:
        file_path = os.path.join(queue_dir, filename)
        try:
            with open(file_path, "r") as f:
                data = json.load(f)

            entity_id = data.get("id")
            email = data.get("email")
            entity_type = data.get("type", "user")

            if not entity_id or not email:
                logger.warning("Invalid queue data", filename=filename)
                shutil.move(file_path, os.path.join(corrupt_dir, filename))
                stats["failed"] += 1
                continue

            # Dispatch to Celery
            if entity_type == "bar":
                add_bar_task.delay(entity_id, email)
                stats["bar_tasks"] += 1
            else:
                add_user_task.delay(entity_id, email)
                stats["user_tasks"] += 1

            # Move to migrated
            shutil.move(file_path, os.path.join(migrated_dir, filename))

        except Exception as e:
            logger.error("Failed to migrate file", filename=filename, error=str(e))
            shutil.move(file_path, os.path.join(corrupt_dir, filename))
            stats["failed"] += 1

    logger.info("Migration completed", stats=stats)
    return stats


@shared_task(name="spotify_automation.tasks.process_failed_tasks")
def process_failed_tasks():
    """Dispatcher: Find and retry failed tasks (Placeholder for Phase 5)"""
    # Logic to query spotify_task_log and retry items
    pass
