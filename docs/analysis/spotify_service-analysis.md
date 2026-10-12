# spotify_service Analysis

**Priority: HIGH**
**Last Updated: 2026-01-24**
**Status: Security Hardening Complete / Ready for Deployment**

## Component Overview

### Purpose
Automated management of Spotify for Developers applications using Selenium browser automation. Handles user registration, app credential management, and queue processing for failed operations.

### Tech Stack
- **Language**: Python 3.x
- **Automation**: Selenium WebDriver (Chrome)
- **Web Framework**: Flask (API endpoints)
- **Process Management**: Systemd service
- **Queue**: File-based pending queue system

### Current State
The service has undergone a **critical security remediation phase** (Jan 24, 2026).
- **Security**: Shell injection vulnerabilities have been patched. Credentials can now be loaded from environment variables.
- **Stability**: The aggressive process cleanup logic has been rewritten to be safer and user-scoped. Regressions related to missing `USER` env var have been fixed.
- **Architecture**: Remains a monolithic script (`SpotifyUserManagementService.py`, 3200+ lines). Splitting this monolith is the next major technical debt item.

## Recent Changes (Jan 24, 2026)

1.  **Shell Injection Remediation**:
    -   Replaced dangerous `subprocess.run(..., shell=True)` calls in `SpotifyUserManagementService.py` with safe list-based arguments.
    -   Prevented potential remote code execution via the API.

2.  **Configuration Security**:
    -   Updated `load_config` to prioritize **Environment Variables** (e.g., `SPOTIFY_EMAIL`, `DB_PASSWORD`) over values in `config.json`.
    -   Allows for secure deployment without committing secrets to disk.

3.  **Process Cleanup Rewrite**:
    -   Completely rewrote `cleanup.py` using `psutil`.
    -   Removed unsafe shell pipelines (`ps | grep | kill`) in both Python and Shell scripts.
    -   Added user-scoping (only kills processes owned by the running user) to prevent disrupting other system services.
    -   Added robustness for missing `USER` environment variable (using `getpass.getuser()` fallback).

4.  **Dependency Management**:
    -   Created `requirements.txt` to define minimum dependencies (`selenium`, `flask`, `psycopg2-binary`, `psutil`). Note: Versions are minimums (`>=`), not strictly locked.

## Architecture (Current)

```
spotify_service/
├── SpotifyUserManagementService.py  # MONOLITH: Main automation logic + Flask API
├── cleanup.py                  # [UPDATED] Safe process cleanup using psutil
├── manage_spotify_service.sh   # Service management script
├── app_info.json               # Local state of managed apps
├── requirements.txt            # [NEW] Python dependencies
├── pending_queue/              # Failed operation queue (JSON files)
├── screenshots/                # Debug screenshots
├── logs/                       # Application logs
└── drivers/                    # Directory for browser drivers
```

## Deployment & Post-Deployment Checklist

These steps are required to deploy the recent changes to the production server.

### 1. Environment Setup
- [ ] **Install Dependencies**:
    ```bash
    pip install -r spotify_service/requirements.txt
    ```
- [ ] **Configure Environment Variables**:
    Create a `.env` file or configure systemd service environment variables:
    ```ini
    SPOTIFY_EMAIL=your_email@example.com
    SPOTIFY_PASSWORD=your_password
    DB_HOST=localhost
    DB_NAME=clubfindr
    DB_USER=...
    DB_PASSWORD=...
    CAPTCHA_API_KEY=...
    
    # Email Verification (Required for Login Challenges)
    EMAIL_ADDRESS=your_support_email@domain.com
    EMAIL_PASSWORD=your_email_password
    EMAIL_SERVER=mail.spacemail.com  # Defaults to mail.spacemail.com if omitted
    EMAIL_PORT=993                   # Defaults to 993 if omitted
    SMTP_PORT=587                    # Defaults to 587 if omitted
    ```

### 2. Service Restart
- [ ] **Restart the services** (the old single `spotify-service` unit has been removed):
    ```bash
    sudo systemctl restart spotify-automation-api spotify-automation-worker-browser spotify-automation-beat
    ```
- [ ] **Verify Logs**:
    Check `sudo journalctl -u spotify-automation-api -u spotify-automation-worker-browser -f` to ensure configuration is loaded correctly from environment variables (logs should *not* show "Missing required Spotify credentials").

### 3. Cleanup Verification
- [ ] **Test Cleanup**:
    Run `python3 spotify_service/cleanup.py` manually and verify it only targets the intended Chrome/Selenium processes and does not affect the rest of the system.

## Remaining Technical Debt & Future Work

### Phase 2: Refactoring (High Priority)
The `SpotifyUserManagementService.py` file is a "God Object" mixing HTTP handling, database logic, and browser automation.

- [ ] **Split the Monolith**:
    -   `api.py`: Flask application and route definitions.
    -   `browser_session.py`: Class encapsulating Selenium logic.
    -   `database.py`: Database connection and query logic.
    -   `models.py`: Data classes for User, Bar, and App.
- [ ] **Unify Logic**:
    -   Refactor `add_user` and `add_bar` into a generic `add_entity(type, data)` method to reduce 90% code duplication.

### Phase 3: Architecture Modernization (Medium Priority)
- [ ] **Async Task Queue**:
    -   The current API blocks for 30-60s while the browser runs.
    -   **Solution**: Integrate Celery (already used in `barfindr`) to handle browser tasks in the background. API should return `202 Accepted` immediately with a task ID.
- [ ] **Hardcoded Paths**:
    -   Audit codebase for absolute paths (e.g., `/home/nathan/...`) and replace with relative paths or config variables.

## Critical Issues Log

| Issue | Severity | Status | Fixed Date |
|-------|----------|--------|------------|
| Shell Injection in `cleanup.py` | Critical | **FIXED** | 2026-01-24 |
| Shell Injection in `manage_spotify_service.sh` | Critical | **FIXED** | 2026-01-24 |
| Plaintext Credentials in `config.json` | Critical | **MITIGATED** | 2026-01-24 |
| Aggressive Process Killing | High | **FIXED** | 2026-01-24 |
| Monolithic Codebase | Medium | OPEN | - |
| Blocking Sync API | Medium | OPEN | - |