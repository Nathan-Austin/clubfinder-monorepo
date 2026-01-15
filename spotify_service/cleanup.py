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
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('cleanup.log')
    ]
)
logger = logging.getLogger('cleanup')

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
    
    # Log current Chrome instances
    logger.info("Chrome instances before cleanup:")
    result = subprocess.run("ps aux | grep -i chrom | grep -v grep", shell=True, capture_output=True, text=True)
    logger.info(result.stdout)
    
    # Create ignore PIDs string for grep command
    ignore_pids_str = '|'.join([f"\\b{pid}\\b" for pid in ignore_pids if pid])
    
    # Kill Chrome-related processes, excluding ignored PIDs
    if ignore_pids_str:
        os.system(f'ps aux | grep -i chrom | grep -v grep | grep -vE "{ignore_pids_str}" | awk \'{{print $2}}\' | xargs -r kill -9')
    else:
        os.system('ps aux | grep -i chrom | grep -v grep | awk \'{print $2}\' | xargs -r kill -9')
    
    # Wait a moment to ensure processes are terminated
    time.sleep(2)
    
    # Expanded list of process names to check
    process_names = [
        'chrome',
        'chromium',
        'chromedriver',
        'chromium-browser',
        'selenium',
        'selenium-server',
        'geckodriver',
        'webdriver',
        'phantomjs'
    ]
    
    # Python process keywords related to Selenium/WebDriver
    python_selenium_keywords = [
        'selenium',
        'webdriver',
        'chromedriver'
    ]
    
    killed_pids = []
    
    # First use ps command to find python processes using selenium
    try:
        ps_output = subprocess.check_output(['ps', 'aux']).decode()
        for line in ps_output.split('\n'):
            if 'python' in line.lower() and any(kw in line.lower() for kw in python_selenium_keywords):
                try:
                    pid = int(line.split()[1])
                    # Skip our service process and parent
                    if pid in ignore_pids:
                        logger.info(f"Skipping service/parent process: {pid}")
                        continue
                        
                    logger.info(f"Found Python Selenium process: {pid}")
                    try:
                        os.kill(pid, 9)
                        killed_pids.append(pid)
                        logger.info(f"Killed Python Selenium process: {pid}")
                    except ProcessLookupError:
                        pass
                except (IndexError, ValueError):
                    continue
    except subprocess.CalledProcessError:
        logger.error("Error running ps command")
    
    # Use psutil for comprehensive process search
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'username']):
        try:
            # Skip processes to ignore
            if proc.pid in ignore_pids:
                logger.info(f"Skipping process to preserve: {proc.pid}")
                continue
                
            # Skip if not our user
            if proc.username() != os.getenv('USER'):
                continue
                
            # Check process name
            proc_name = proc.name().lower()
            if any(name in proc_name for name in process_names):
                logger.info(f"Killing process: {proc.pid} ({proc_name})")
                try:
                    proc.kill()
                    killed_pids.append(proc.pid)
                except:
                    logger.warning(f"Failed to kill process: {proc.pid}")
                continue
                
            # Check command line for selenium/chrome-related processes
            if proc.cmdline():
                cmdline = ' '.join(proc.cmdline()).lower()
                if any(name in cmdline for name in process_names + python_selenium_keywords):
                    logger.info(f"Killing process: {proc.pid} ({cmdline[:50]}...)")
                    try:
                        proc.kill()
                        killed_pids.append(proc.pid)
                    except:
                        logger.warning(f"Failed to kill process: {proc.pid}")
                    
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
            
    # Wait for processes to be killed
    if killed_pids:
        logger.info(f"Waiting for {len(killed_pids)} processes to terminate...")
        time.sleep(2)
        
        # Verify processes are gone
        for pid in killed_pids:
            try:
                psutil.Process(pid)
                logger.warning(f"Warning: Process {pid} still exists")
            except psutil.NoSuchProcess:
                logger.info(f"Confirmed process {pid} terminated")
    
    # Handle zombie processes
    try:
        zombies = subprocess.check_output("ps aux | grep -i 'defunct' | grep -v grep", shell=True).decode()
        if zombies:
            logger.info("Detected zombie processes, attempting cleanup...")
            # Find parent processes of zombies and send SIGCHLD
            os.system("ps axo pid=,ppid=,stat=,cmd= | awk '$3 ~ /Z/ {print $2}' | xargs -r kill -s SIGCHLD")
            # If zombies persist, try more aggressive zombie cleanup
            time.sleep(1)
            zombies = subprocess.check_output("ps aux | grep -i 'defunct' | grep -v grep", shell=True).decode()
            if zombies:
                logger.info("Zombie processes persist, trying PID 1 notification...")
                os.system("kill -SIGCHLD 1")  # Notify init process to reap zombies
    except subprocess.CalledProcessError:
        # No zombies found
        pass
    
    logger.info("Chrome instances after process cleanup:")
    result = subprocess.run("ps aux | grep -i chrom | grep -v grep", shell=True, capture_output=True, text=True)
    logger.info(result.stdout if result.stdout else "No Chrome processes found")
    
    # Clean up temporary files
    cleanup_temp_files()
    
    logger.info("Cleanup process completed!")
    return True

def cleanup_temp_files():
    """Clean up temporary files related to Chrome and Selenium"""
    logger.info("Cleaning up temporary files...")
    
    # Temp file patterns to clean
    temp_patterns = [
        '/tmp/chrome_profile*',
        '/tmp/.com.google.Chrome*',
        '/tmp/.org.chromium.Chromium*',
        '/tmp/.X*-lock',
        '/tmp/chrome_*',
        '/tmp/selenium-*',
        '/tmp/.X11-unix/X*',
        '/tmp/.webdriver*',
        '/tmp/*.log',
        '/tmp/tmp*',
        '/dev/shm/sem.SELENIUM_*',  # Selenium semaphores
        '/run/lock/selenium*'
    ]
    
    # Files/directories to exclude from cleanup
    snap_exclusions = [
        '/tmp/snap.chromium',  # Don't remove snap-specific directory
        '/dev/shm/snap.chromium',
    ]
    
    removed_count = 0
    
    for pattern in temp_patterns:
        matching_paths = glob.glob(pattern)
        if not matching_paths:
            logger.info(f"No files found matching pattern: {pattern}")
            continue
            
        for path in matching_paths:
            # Skip excluded paths
            if any(excl in path for excl in snap_exclusions):
                logger.info(f"Skipping excluded path: {path}")
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
        x11_locks = glob.glob('/tmp/.X[0-9]*-lock')
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
        shm_files = os.listdir('/dev/shm')
        for file in shm_files:
            # Skip excluded paths
            if any(excl in file for excl in snap_exclusions):
                continue
                
            if 'chrome' in file.lower() or 'selenium' in file.lower():
                try:
                    os.remove(f'/dev/shm/{file}')
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
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'username']):
        try:
            cmdline = ' '.join(proc.cmdline()).lower()
            if 'selenium' in cmdline or 'webdriver' in cmdline or 'chromedriver' in cmdline:
                found = True
                logger.info(f"PID: {proc.pid}")
                logger.info(f"Name: {proc.name()}")
                logger.info(f"User: {proc.username()}")
                logger.info(f"Command: {' '.join(proc.cmdline())}")
                logger.info(f"Status: {proc.status()}")
                logger.info("---")
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
            
    if not found:
        logger.info("No Selenium/WebDriver processes found.")

if __name__ == "__main__":
    logger.info("==== Starting Standalone Cleanup ====")
    print_active_selenium_processes()
    cleanup_processes()
    logger.info("==== Cleanup Complete ====")

        