# Spotify On-Demand Service

This service manages Spotify application users and bars for the Clubfindr platform. The service uses an on-demand approach, only opening the browser when needed and closing it after each operation, which significantly improves stability and resource usage.

## Key Features

- **On-Demand Browser**: Browser is only launched when needed for operations, then closed and cleaned up
- **Improved Stability**: Minimizes resource usage and prevents browser memory leaks
- **Task Queue**: Failed operations are automatically queued for retry
- **Comprehensive Cleanup**: Enhanced cleanup procedures ensure no orphaned processes
- **Email Notifications**: Users receive email notifications when their accounts are successfully added

## Installation

1. Place all files in the `/home/nathan/clubfinder/spotify_service` directory
2. Make the management script executable:
   ```
   chmod +x manage_spotify_service.sh
   ```
3. Install the service:
   ```
   ./manage_spotify_service.sh install
   ```
4. Start the service:
   ```
   ./manage_spotify_service.sh start
   ```

## Files Overview

- **SpotifyUserManagementService.py**: Main service file with API endpoints and browser management
- **cleanup.py**: Improved cleanup script for browser processes and temporary files
- **spotify-service.service**: Systemd service configuration
- **manage_spotify_service.sh**: Management script for common operations
- **config.json**: Configuration file (must be created with Spotify and database credentials)

## Configuration

Create a `config.json` file with the following structure:

```json
{
  "spotify_email": "your_spotify_email@example.com",
  "spotify_password": "your_spotify_password",
  "email": {
    "address": "notification_email@example.com",
    "password": "email_password",
    "server": "mail.example.com",
    "port": 993,
    "smtp_port": 587
  },
  "database": {
    "host": "localhost",
    "database": "database_name",
    "user": "database_user",
    "password": "database_password"
  },
  "captcha": {
    "api_key": "your_2captcha_api_key"
  }
}
```

## API Endpoints

- **GET /health**: Check service health status
- **POST /cleanup**: Trigger cleanup process
- **POST /add_user**: Add a user to a Spotify app
- **POST /add_bar**: Add a bar to a Spotify app
- **GET /get_credentials/{app_name}**: Get app credentials
- **POST /process_queue**: Process pending queue items

## Management Commands

```
./manage_spotify_service.sh start        # Start the service
./manage_spotify_service.sh stop         # Stop the service
./manage_spotify_service.sh restart      # Restart the service
./manage_spotify_service.sh status       # Show service status
./manage_spotify_service.sh logs         # View service logs
./manage_spotify_service.sh cleanup      # Run cleanup only
./manage_spotify_service.sh process-queue # Process pending queue items
./manage_spotify_service.sh install      # Install the service files
```

## Queue System

Failed operations are automatically queued in the `pending_queue` directory. The queue is checked:

1. When the service starts
2. When the `/process_queue` endpoint is called
3. When the `process-queue` management command is run

Queue items are stored as JSON files with retry history and status information.

## Troubleshooting

If you encounter issues:

1. Check the logs in `/var/log/spotify-service/`
2. Run the cleanup script: `./manage_spotify_service.sh cleanup`
3. Restart the service: `./manage_spotify_service.sh restart`
4. Inspect browser screenshots in the `screenshots` directory
5. Check for error logs in the service directory

## Screenshots

The service automatically takes screenshots during critical operations for debugging purposes.
These are stored in the `screenshots` directory and include:

- Login steps
- App navigation
- User/bar addition forms
- Error states

## Resource Requirements

The on-demand approach significantly reduces resource usage:

- Memory: ~300MB idle, ~1GB during browser operations
- CPU: Minimal when idle, moderate during browser operations
- Disk: ~100MB plus screenshots

## Benefits of On-Demand Approach

1. **Reduced Memory Usage**: The browser only consumes memory when actively performing a task
2. **Better Stability**: Fresh browser instance for each operation prevents memory leaks and crashes
3. **Simplified Recovery**: No need to maintain and monitor long-running browser sessions
4. **Easier Debugging**: Each operation is isolated and produces its own logs and screenshots
5. **More Robust**: System can recover from failures without manual intervention
