#!/bin/bash
# Spotify On-Demand Service Manager Script
# Manages the Spotify service and provides convenience commands

set -e
trap 'echo "Error occurred at line $LINENO. Command: $BASH_COMMAND"' ERR

# Configuration
SERVICE_NAME="spotify-service"
SERVICE_DIR="/home/nathan/clubfinder/spotify_service"
PYTHON_ENV="/home/nathan/spotify_service_env/bin/python"
LOG_FILE="${SERVICE_DIR}/service_management_$(date +%Y%m%d_%H%M%S).log"

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
    echo "  start        - Start the service"
    echo "  stop         - Stop the service"
    echo "  restart      - Restart the service"
    echo "  status       - Show service status"
    echo "  logs         - View service logs"
    echo "  cleanup      - Run cleanup only without affecting service"
    echo "  process-queue - Process pending queue items"
    echo "  install      - Install the service files"
    echo "  help         - Show this help message"
    echo
}

# Function to run cleanup
run_cleanup() {
    echo "Running cleanup process..."
    cd $SERVICE_DIR
    
    # Run the Python cleanup script (handles process killing safely)
    echo "Running Python cleanup script..."
    $PYTHON_ENV cleanup.py
    
    echo "Cleanup completed."
}

# Function to process queue
process_queue() {
    echo "Processing pending queue..."
    curl -X POST http://localhost:5000/process_queue
    echo "Queue processing request sent."
}

# Function to reload service configuration
reload_service() {
    echo "Reloading systemd service configuration..."
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    echo "Service configuration reloaded."
}
# Handle commands
case "$1" in
    start)
        echo "Starting ${SERVICE_NAME} service..."
        run_cleanup
        sudo systemctl start ${SERVICE_NAME}
        echo "Service started."
        ;;
    stop)
        echo "Stopping ${SERVICE_NAME} service..."
        sudo systemctl stop ${SERVICE_NAME}
        run_cleanup
        echo "Service stopped."
        ;;
    restart)
        echo "Restarting ${SERVICE_NAME} service..."
        sudo systemctl stop ${SERVICE_NAME}
        run_cleanup
        sudo systemctl start ${SERVICE_NAME}
        echo "Service restarted."
        ;;
    status)
        echo "Service status:"
        sudo systemctl status ${SERVICE_NAME}
        ;;
    logs)
        echo "Viewing service logs:"
        sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager
        ;;
    cleanup)
        run_cleanup
        ;;
    process-queue)
        process_queue
        ;;
    install)
        reload_service
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        echo "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac

echo "Operation completed at $(date)"
echo "==== Management script finished ===="