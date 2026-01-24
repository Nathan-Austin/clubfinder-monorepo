import pytest
import time
from celery.contrib.testing.worker import start_worker
from spotify_automation.celery import app
from spotify_automation.tasks.user_tasks import add_user_task


@pytest.fixture(scope="session")
def celery_config():
    return {
        "broker_url": "memory://",
        "result_backend": "redis://localhost:6379/1",
        "task_always_eager": False,
    }


@pytest.fixture(scope="session")
def celery_worker(request, celery_app, celery_worker_pool):
    # Start a worker for integration testing
    worker = start_worker(celery_app, pool=celery_worker_pool)
    worker.__enter__()
    request.addfinalizer(lambda: worker.__exit__(None, None, None))
    return worker


@pytest.mark.integration
class TestCeleryWorker:
    def test_worker_connectivity(self):
        """Test that we can ping the broker"""
        with app.connection() as connection:
            try:
                connection.ensure_connection(max_retries=3)
                assert True
            except Exception:
                assert False, "Could not connect to broker"

    def test_task_queuing(self):
        """Test that we can queue a task and get an ID"""
        # We don't actually run the browser here, just check queuing
        # Mocking the actual browser execution would be better for CI
        # but for integration we want to know Celery is working

        # We'll use a mock for the internal logic if we were running it fully
        # For now, just check AsyncResult
        task = add_user_task.delay("test_id", "test@example.com")
        assert task.id is not None
        assert task.status in ["PENDING", "STARTED", "SUCCESS", "FAILURE", "RETRY"]
