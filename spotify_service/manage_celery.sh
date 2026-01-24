#!/bin/bash
# Spotify Celery Automation Manager Script

set -e

SERVICE_WORKER="spotify-automation-worker-browser"
SERVICE_BEAT="spotify-automation-beat"
SERVICES="$SERVICE_WORKER $SERVICE_BEAT"

show_usage() {
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  start        - Start all Celery services"
    echo "  stop         - Stop all Celery services"
    echo "  restart      - Restart all Celery services"
    echo "  status       - Show status of Celery services"
    echo "  logs-worker  - View worker logs"
    echo "  logs-beat    - View beat logs"
    echo "  help         - Show this help message"
    echo
}

case "$1" in
    start)
        echo "Starting Celery services..."
        for svc in $SERVICES; do
            echo "Starting $svc..."
            sudo systemctl start $svc
        done
        echo "All services started."
        ;;
    stop)
        echo "Stopping Celery services..."
        for svc in $SERVICES; do
            echo "Stopping $svc..."
            sudo systemctl stop $svc
        done
        echo "All services stopped."
        ;;
    restart)
        echo "Restarting Celery services..."
        for svc in $SERVICES; do
            echo "Restarting $svc..."
            sudo systemctl restart $svc
        done
        echo "All services restarted."
        ;;
    status)
        echo "Checking service status..."
        for svc in $SERVICES; do
            echo "--- $svc ---"
            sudo systemctl status $svc --no-pager || true
            echo
        done
        ;;
    logs-worker)
        sudo journalctl -u $SERVICE_WORKER -f
        ;;
    logs-beat)
        sudo journalctl -u $SERVICE_BEAT -f
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
