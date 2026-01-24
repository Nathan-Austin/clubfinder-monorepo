# Global state for Celery worker process
# This module acts as a singleton within each worker process

browser_session = None
worker_id = None


def get_browser():
    """Get the global browser session for this worker"""
    return browser_session


def set_browser(session):
    """Set the global browser session for this worker"""
    global browser_session
    browser_session = session


def get_worker_id():
    """Get the unique ID for this worker process"""
    return worker_id


def set_worker_id(id_val):
    """Set the unique ID for this worker process"""
    global worker_id
    worker_id = id_val
