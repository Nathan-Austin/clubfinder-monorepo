# src/barfindr/celery.py
from celery import Celery
from celery.schedules import crontab
import os
import structlog

# Configure logging
logger = structlog.get_logger()

# Create Celery app
app = Celery('barfindr', 
             broker=os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
             backend=os.getenv('REDIS_URL', 'redis://localhost:6379/0'))

# Configure Celery
app.conf.update(
    # Use UTC for consistency
    enable_utc=True,
    timezone='UTC',
    
    # Periodic task schedule
    beat_schedule={
        'spotify-genre-polling': {
            'task': 'barfindr.tasks.spotify_genre_polling',
            'schedule': crontab(minute='*/20'),  # Every 20 minutes
            'options': {
                'expires': 1200,  # Task expires after 20 minutes (1200 seconds)
            }
        },
        'update-genre-aggregates': {
            'task': 'barfindr.tasks.update_genre_aggregates',
            'schedule': crontab(minute=0, hour='*/1'),  # Every hour
            'options': {
                'expires': 3600,  # Task expires after 1 hour
            }
        },
        'database-cleanup': {
            'task': 'barfindr.tasks.database_cleanup',
            'schedule': crontab(hour=0, minute=0),  # Daily at midnight
            'options': {
                'expires': 1800,  # Task expires after 30 minutes
            }
        }
    },
    
    # Task routing and execution settings
    task_routes={
        'barfindr.tasks.spotify_genre_polling': {'queue': 'spotify'},
        'barfindr.tasks.process_bar_batch': {'queue': 'spotify'},
        'barfindr.tasks.update_genre_aggregates': {'queue': 'spotify'},
        'barfindr.tasks.database_cleanup': {'queue': 'maintenance'}
    },
    
    # Retry configuration
    task_retry_limit=3,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    
    # Monitoring and logging
    task_track_started=True,
    task_send_sent_event=True,
    task_send_result_event=True
)

# Task error handling
@app.task(bind=True, max_retries=3)
def handle_task_error(self, task_id, exc):
    try:
        logger.error(f"Task {task_id} failed", error=str(exc))
        # You might want to add additional error handling here
        # For example, notification system or status updates
    except Exception as e:
        logger.error(f"Error handling task failure", task_id=task_id, error=str(e))

# Error callback for all tasks
def task_error_handler(task, exc, task_id, args, kwargs, einfo):
    handle_task_error.delay(task_id, str(exc))

# Register error handler
app.conf.task_error_handler = task_error_handler

# Expose the Celery app
__all__ = ['app']
celery = app