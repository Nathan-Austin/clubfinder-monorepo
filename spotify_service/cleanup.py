"""
Enhanced cleanup script for Spotify On-Demand Service
Thoroughly cleans processes and temporary files to avoid resource issues
"""

import psutil
import os
import glob
import shutil
import time
import subprocess
import sys
import logging
import getpass
from datetime import datetime

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


def cleanup_processes(ignore_pids=None):
    """
    Clean up any lingering Chrome/Selenium/WebDriver processes and temporary files

    Args:
        ignore_pids: List of PIDs to ignore/preserve during cleanup
    """
    if ignore_pids is None:
        # Get current service PIDs if not provided
        service_pid, parent_pid = identify_service_process()
        ignore_pids = [service_pid, parent_pid]

    logger.info("Starting comprehensive cleanup process...")
    logger.info(f"PIDs to preserve: {ignore_pids}")

    # Process names to target
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

    killed_pids = []
    # robustly get current user
    current_user = os.getenv("USER") or getpass.getuser()

    # Use psutil for all process cleanup (Replaces unsafe shell commands)
    for proc in psutil.process_iter(["pid", "name", "cmdline", "username"]):
        try:
            # Skip if not our user
            if proc.username() != current_user:
                continue

            # Skip processes to ignore
            if proc.pid in ignore_pids:
                continue

            # Check process properties
            proc_name = proc.name().lower()
            cmdline = " ".join(proc.cmdline()).lower() if proc.cmdline() else ""

            is_target = any(target in proc_name for target in target_processes) or any(
                target in cmdline for target in target_processes
            )

            if is_target:
                logger.info(f"Killing process: {proc.pid} ({proc_name})")
                try:
                    proc.kill()
                    killed_pids.append(proc.pid)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    # Wait for processes to be killed
    if killed_pids:
        logger.info(f"Waiting for {len(killed_pids)} processes to terminate...")
        time.sleep(2)

        # Verify processes are gone
        gone, alive = psutil.wait_procs(
            [psutil.Process(p) for p in killed_pids if psutil.pid_exists(p)], timeout=3
        )
        for p in alive:
            logger.warning(f"Warning: Process {p.pid} still exists after kill attempt")

    # Handle zombie processes safely
    try:
        # Reap children of this process
        os.waitpid(-1, os.WNOHANG)
    except ChildProcessError:
        pass

    # Clean up temporary files
    cleanup_temp_files()

    logger.info("Cleanup process completed!")
    return True


def cleanup_temp_files():
    """Clean up temporary files related to Chrome and Selenium"""
    logger.info("Cleaning up temporary files...")

    # Temp file patterns to clean
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
        "/dev/shm/sem.SELENIUM_*",  # Selenium semaphores
        "/run/lock/selenium*",
    ]

    # Files/directories to exclude from cleanup
    snap_exclusions = [
        "/tmp/snap.chromium",  # Don't remove snap-specific directory
        "/dev/shm/snap.chromium",
    ]

    removed_count = 0

    for pattern in temp_patterns:
        matching_paths = glob.glob(pattern)
        if not matching_paths:
            continue

        for path in matching_paths:
            # Skip excluded paths
            if any(excl in path for excl in snap_exclusions):
                continue

            try:
                if os.path.isdir(path):
                    shutil.rmtree(path)
                    logger.info(f"Removed directory: {path}")
                else:
                    os.remove(path)
                    logger.info(f"Removed file: {path}")
                removed_count += 1
            except Exception as e:
                logger.error(f"Error removing {path}: {str(e)}")

    # Clean up any stray X11 lock files
    try:
        x11_locks = glob.glob("/tmp/.X[0-9]*-lock")
        for lock in x11_locks:
            try:
                os.remove(lock)
                logger.info(f"Removed X11 lock file: {lock}")
                removed_count += 1
            except Exception as e:
                logger.error(f"Error removing X11 lock: {str(e)}")
    except Exception as e:
        logger.error(f"Error cleaning X11 locks: {str(e)}")

    # Clean up /dev/shm
    try:
        if os.path.exists("/dev/shm"):
            shm_files = os.listdir("/dev/shm")
            for file in shm_files:
                # Skip excluded paths
                if any(excl in file for excl in snap_exclusions):
                    continue

                if "chrome" in file.lower() or "selenium" in file.lower():
                    try:
                        os.remove(f"/dev/shm/{file}")
                        logger.info(f"Removed shared memory file: {file}")
                        removed_count += 1
                    except Exception as e:
                        logger.error(f"Error removing shared memory file: {str(e)}")
    except Exception as e:
        logger.error(f"Error cleaning shared memory: {str(e)}")

    logger.info(f"Removed {removed_count} temporary files and directories")
    return removed_count


def print_active_selenium_processes():
    """Print information about any active Selenium/WebDriver processes"""
    logger.info("Checking for active Selenium/WebDriver processes:")

    found = False
    for proc in psutil.process_iter(["pid", "name", "cmdline", "username"]):
        try:
            cmdline = " ".join(proc.cmdline()).lower()
            if (
                "selenium" in cmdline
                or "webdriver" in cmdline
                or "chromedriver" in cmdline
            ):
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
