import os
import time
import multiprocessing
import structlog
from .celery import app as celery  # Import the central celery app
from typing import Callable, Any

# Configure structured logging
logger = structlog.get_logger()

class TaskScheduler:
    _instance = None
    
    def __new__(cls):
        if not cls._instance:
            cls._instance = super(TaskScheduler, cls).__new__(cls)
        return cls._instance
    
    def __init__(
        self, 
        worker_count: int = None,
        queue_name: str = 'barfindr_tasks'
    ):
        if not hasattr(self, 'initialized'):
            # Determine worker count based on system resources
            self.worker_count = worker_count or max(1, multiprocessing.cpu_count() // 2)
            self.queue_name = queue_name
            
            # Use the imported celery app
            self.app = celery
            
            logger.info("Task scheduler initialized", 
                        broker=self.app.conf.broker_url, 
                        workers=self.worker_count, 
                        queue=self.queue_name)
            
            self.initialized = True
    
    def register_task(self, name: str, func: Callable):
        """Register a new task with the Celery app."""
        @self.app.task(name=f'barfindr.{name}')
        def wrapper(*args: Any, **kwargs: Any):
            try:
                logger.info(f"Executing task: {name}", args=args, kwargs=kwargs)
                return func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Task {name} failed", error=str(e))
                raise
        return wrapper
    
    def run_task(self, name: str, *args: Any, **kwargs: Any):
        """Run a task asynchronously."""
        try:
            task = self.app.send_task(f'barfindr.{name}', args=args, kwargs=kwargs)
            logger.info(f"Task {name} queued", task_id=task.id)
            return task
        except Exception as e:
            logger.error(f"Failed to queue task {name}", error=str(e))
            raise
    
    def monitor_task_queue(self, max_tasks: int = 100, timeout: int = 3600):
        """Monitor task queue and log statistics."""
        try:
            inspector = self.app.control.inspect()
            
            while True:
                # Get active and reserved tasks
                active_tasks = inspector.active() or {}
                reserved_tasks = inspector.reserved() or {}
                
                total_tasks = sum(len(tasks) for tasks in active_tasks.values()) + \
                               sum(len(tasks) for tasks in reserved_tasks.values())
                
                logger.info("Task Queue Status", 
                            total_tasks=total_tasks, 
                            max_tasks=max_tasks)
                
                if total_tasks > max_tasks:
                    logger.warning("Task queue exceeding maximum threshold")
                
                time.sleep(timeout)
        
        except Exception as e:
            logger.error("Task queue monitoring failed", error=str(e))
            raise

# Singleton instance for easy import
task_scheduler = TaskScheduler()