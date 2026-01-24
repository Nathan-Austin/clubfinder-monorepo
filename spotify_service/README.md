# Spotify Automation Service

This service manages Spotify application users and bars for the Clubfindr platform using a scalable Celery-based architecture. It handles browser automation for Spotify Developer Dashboard interactions, including creating apps, managing credentials, and adding users.

## Architecture

- **Celery & Redis**: Task queue system for asynchronous processing.
- **Browser Pooling**: Persistent Selenium sessions per worker process for performance.
- **Worker Isolation**: Separate queues for browser automation (`spotify_browser`) and fast operations (`spotify_fast`).
- **Periodic Tasks**: Celery Beat handles maintenance tasks like cleanup and retries.
- **PostgreSQL**: Stores task logs and app/user data (via SQLAlchemy).

## Key Features

- **Automated App Management**: Create Spotify apps and refresh credentials automatically.
- **Robust User Management**: Add users and bars to Spotify apps with auto-retries.
- **Resiliency**: 
    - Worker-level browser pooling with health checks.
    - Automatic retries for network/browser failures.
    - Soft time limits to prevent hung processes.
- **Maintenance**: Automated cleanup of Chrome processes and old screenshots.

## Installation

1. **Prerequisites**:
   - Python 3.10+
   - Redis
   - Chrome & Chromedriver
   - PostgreSQL

2. **Setup**:
   ```bash
   cd spotify_service
   # Create and activate virtual environment
   python3 -m venv .venv
   source .venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   pip install -e .  # Install package in editable mode
   ```

3. **Configuration**:
   Copy `.env.example` to `.env` and fill in credentials:
   ```bash
   cp .env.example .env
   ```

## Management

Use the `manage_spotify_service.sh` script to control the service:

```bash
./manage_spotify_service.sh start        # Start Celery worker and beat
./manage_spotify_service.sh stop         # Stop services
./manage_spotify_service.sh restart      # Restart services
./manage_spotify_service.sh status       # Check status
./manage_spotify_service.sh logs         # View logs
./manage_spotify_service.sh cleanup      # Run standalone cleanup
```

## Directory Structure

```
spotify_service/
├── src/
│   └── spotify_automation/
│       ├── api/             # Flask endpoints (if running API)
│       ├── core/            # Browser & worker infrastructure
│       ├── database/        # Database connection
│       ├── services/        # Business logic layer
│       └── tasks/           # Celery tasks (user, app, maintenance)
├── manage_spotify_service.sh # Main management script
├── cleanup.py               # Cleanup entry point
└── requirements.txt         # Dependencies
```

## Tasks

| Task Name | Queue | Description |
|-----------|-------|-------------|
| `spotify_automation.tasks.add_user` | `spotify_browser` | Add user to Spotify app |
| `spotify_automation.tasks.add_bar` | `spotify_browser` | Add bar to Spotify app |
| `spotify_automation.tasks.create_spotify_app` | `spotify_browser` | Create new Spotify app |
| `spotify_automation.tasks.refresh_app_credentials` | `spotify_browser` | Refresh Client ID/Secret |
| `spotify_automation.tasks.process_failed_tasks` | `spotify_maintenance` | Retry failed tasks (Scheduled) |
| `spotify_automation.tasks.cleanup_chrome_processes` | `spotify_maintenance` | Kill zombie processes (Scheduled) |

## Monitoring

- **Logs**: Check `spotify_automation.log` or use `./manage_spotify_service.sh logs`
- **Database**: Check `clubfindr.spotify_task_log` table for task history.

## Troubleshooting

1. **Browser issues**: Run `./manage_spotify_service.sh cleanup` to kill all Chrome processes.
2. **Worker stuck**: Restart services with `./manage_spotify_service.sh restart`.
3. **Queue backed up**: Check Redis: `redis-cli -n 1 LLEN spotify_browser`.
