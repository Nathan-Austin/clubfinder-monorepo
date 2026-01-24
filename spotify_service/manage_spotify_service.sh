#!/bin/bash
# Spotify On-Demand Service Manager Script
# Manages the Spotify service and provides convenience commands

set -e
trap 'echo "Error occurred at line $LINENO. Command: $BASH_COMMAND"' ERR

# Configuration
SERVICE_DIR="/home/nathan/clubfinder/spotify_service"
PYTHON_ENV="/home/nathan/spotify_service_env/bin/python"
LOG_FILE="${SERVICE_DIR}/service_management_$(date +%Y%m%d_%H%M%S).log"

# Import manage_celery functions if possible, or just call it
MANAGE_CELERY="./manage_celery.sh"

# Start logging
exec > >(tee -i $LOG_FILE)
exec 2>&1

echo "==== Spotify On-Demand Service Management Script ===="
echo "$(date): Beginning management operation"

# Function to display usage
show_usage() {
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  start        - Start all Spotify services"
    echo "  stop         - Stop all Spotify services"
    echo "  restart      - Restart all Spotify services"
    echo "  status       - Show service status"
    echo "  logs         - View service logs"
    echo "  cleanup      - Run cleanup"
    echo "  help         - Show this help message"
    echo
}

# Function to run cleanup
run_cleanup() {
    echo "Running cleanup process..."
    cd $SERVICE_DIR
    
    # Run the Python cleanup script
    echo "Running Python cleanup script..."
    $PYTHON_ENV cleanup.py
    
    echo "Cleanup completed."
}

# Handle commands
case "" in
    start)
        echo "Starting Spotify Automation services..."
        run_cleanup
        $MANAGE_CELERY start
        ;;
    stop)
        echo "Stopping Spotify Automation services..."
        $MANAGE_CELERY stop
        run_cleanup
        ;;
    restart)
        echo "Restarting Spotify Automation services..."
        $MANAGE_CELERY stop
        run_cleanup
        $MANAGE_CELERY start
        ;;
    status)
        echo "Service status:"
        $MANAGE_CELERY status
        ;;
    logs)
        echo "Viewing worker logs (ctrl+c to exit):"
        $MANAGE_CELERY logs-worker
        ;;
    cleanup)
        run_cleanup
        ;;
    process-queue)
        echo "Command 'process-queue' is deprecated. Tasks are processed automatically by Celery."
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        echo "Unknown command: "
        show_usage
        exit 1
        ;;
esac

echo "Operation completed at $(date)"
echo "==== Management script finished ===="