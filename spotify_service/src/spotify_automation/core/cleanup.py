"""
Enhanced cleanup script for Spotify On-Demand Service
Thoroughly cleans processes and temporary files to avoid resource issues
"""

import psutil
import os
import glob
import shutil
import time
import sys
import logging
import getpass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler("cleanup.log")],
)
logger = logging.getLogger("cleanup")


def identify_service_process():
    """Identify the main service process to preserve"""
    try:
        # Get the PID of the main service
        service_pid = os.getpid()
        logger.info(f"Service PID (will be preserved): {service_pid}")

        # Get the parent PID of the script to preserve
        parent_pid = os.getppid()
        logger.info(f"Parent PID (will be preserved): {parent_pid}")

        return service_pid, parent_pid
    except Exception as e:
        logger.error(f"Error identifying service process: {str(e)}")
        return os.getpid(), os.getppid()  # Return current process as fallback


def _should_kill_process(proc, current_user, ignore_pids):
    """Check if a process should be killed."""
    target_processes = [
        "chrome",
        "chromium",
        "chromedriver",
        "chromium-browser",
        "selenium",
        "selenium-server",
        "geckodriver",
        "webdriver",
        "phantomjs",
    ]
    try:
        if proc.username() != current_user:
            return False
        if proc.pid in ignore_pids:
            return False

        proc_name = proc.name().lower()
        cmdline = " ".join(proc.cmdline()).lower() if proc.cmdline() else ""

        return any(target in proc_name for target in target_processes) or any(
            target in cmdline for target in target_processes
        )
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return False


def _kill_processes(ignore_pids, current_user):
    """Iterate and kill target processes."""
    killed_pids = []
    for proc in psutil.process_iter(["pid", "name", "cmdline", "username"]):
        if _should_kill_process(proc, current_user, ignore_pids):
            logger.info(f"Killing process: {proc.pid} ({proc.name()})")
            try:
                proc.kill()
                killed_pids.append(proc.pid)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    return killed_pids


def _wait_for_termination(killed_pids):
    """Wait for processes to terminate."""
    if killed_pids:
        logger.info(f"Waiting for {len(killed_pids)} processes to terminate...")
        time.sleep(2)
        gone, alive = psutil.wait_procs(
            [psutil.Process(p) for p in killed_pids if psutil.pid_exists(p)], timeout=3
        )
        for p in alive:
            logger.warning(f"Warning: Process {p.pid} still exists after kill attempt")


def cleanup_processes(ignore_pids=None):
    """Clean up lingering Chrome/Selenium/WebDriver processes and temporary files."""
    if ignore_pids is None:
        service_pid, parent_pid = identify_service_process()
        ignore_pids = [service_pid, parent_pid]

    logger.info("Starting comprehensive cleanup process...")
    logger.info(f"PIDs to preserve: {ignore_pids}")

    current_user = os.getenv("USER") or getpass.getuser()

    killed_pids = _kill_processes(ignore_pids, current_user)
    _wait_for_termination(killed_pids)

    try:
        os.waitpid(-1, os.WNOHANG)
    except ChildProcessError:
        pass

    cleanup_temp_files()
    logger.info("Cleanup process completed!")
    return True


def _remove_path(path):
    """Remove a file or directory."""
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
            logger.info(f"Removed directory: {path}")
        else:
            os.remove(path)
            logger.info(f"Removed file: {path}")
        return True
    except Exception as e:
        logger.error(f"Error removing {path}: {str(e)}")
        return False


def _clean_matching_patterns(patterns, exclusions):
    """Clean files matching glob patterns."""
    removed_count = 0
    for pattern in patterns:
        matching_paths = glob.glob(pattern)
        for path in matching_paths:
            if any(excl in path for excl in exclusions):
                continue
            if _remove_path(path):
                removed_count += 1
    return removed_count


def _clean_x11_locks():
    """Clean X11 lock files."""
    removed_count = 0
    try:
        x11_locks = glob.glob("/tmp/.X[0-9]*-lock")
        for lock in x11_locks:
            if _remove_path(lock):
                removed_count += 1
    except Exception as e:
        logger.error(f"Error cleaning X11 locks: {str(e)}")
    return removed_count


def _clean_shared_memory(exclusions):
    """Clean shared memory files."""
    removed_count = 0
    try:
        if os.path.exists("/dev/shm"):
            shm_files = os.listdir("/dev/shm")
            for file in shm_files:
                if any(excl in file for excl in exclusions):
                    continue
                if "chrome" in file.lower() or "selenium" in file.lower():
                    if _remove_path(f"/dev/shm/{file}"):
                        removed_count += 1
    except Exception as e:
        logger.error(f"Error cleaning shared memory: {str(e)}")
    return removed_count


def cleanup_temp_files():
    """Clean up temporary files related to Chrome and Selenium"""
    logger.info("Cleaning up temporary files...")

    temp_patterns = [
        "/tmp/chrome_profile*",
        "/tmp/.com.google.Chrome*",
        "/tmp/.org.chromium.Chromium*",
        "/tmp/.X*-lock",
        "/tmp/chrome_*",
        "/tmp/selenium-*",
        "/tmp/.X11-unix/X*",
        "/tmp/.webdriver*",
        "/tmp/*.log",
        "/tmp/tmp*",
        "/dev/shm/sem.SELENIUM_*",
        "/run/lock/selenium*",
    ]

    snap_exclusions = [
        "/tmp/snap.chromium",
        "/dev/shm/snap.chromium",
    ]

    removed_count = 0
    removed_count += _clean_matching_patterns(temp_patterns, snap_exclusions)
    removed_count += _clean_x11_locks()
    removed_count += _clean_shared_memory(snap_exclusions)

    logger.info(f"Removed {removed_count} temporary files and directories")
    return removed_count


def print_active_selenium_processes():
    """Print information about any active Selenium/WebDriver processes"""
    logger.info("Checking for active Selenium/WebDriver processes:")
    found = False
    for proc in psutil.process_iter(["pid", "name", "cmdline", "username"]):
        try:
            cmdline = " ".join(proc.cmdline()).lower()
            if any(k in cmdline for k in ["selenium", "webdriver", "chromedriver"]):
                found = True
                logger.info(
                    f"PID: {proc.pid} | Name: {proc.name()} | User: {proc.username()}"
                )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    if not found:
        logger.info("No Selenium/WebDriver processes found.")


if __name__ == "__main__":
    logger.info("==== Starting Standalone Cleanup ====")
    print_active_selenium_processes()
    cleanup_processes()
    logger.info("==== Cleanup Complete ====")
