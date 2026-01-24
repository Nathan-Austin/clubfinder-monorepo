# Spotify Service Refactoring Plan: Monolith to Celery Architecture

## Executive Summary

Refactor the 3,688-line monolithic `SpotifyUserManagementService.py` into a modular, Celery-based task architecture. This will improve maintainability, scalability, and observability while leveraging the existing Celery infrastructure from barfindr.

**Timeline:** 12 weeks (6 phases)
**Risk Level:** Medium (mitigated by incremental migration)
**Dependencies:** Redis, existing barfindr Celery patterns

---

## Current State Analysis

### Monolithic File Structure
- **Location:** `/home/nathan/clubfinder-monorepo/spotify_service/SpotifyUserManagementService.py`
- **Size:** 3,688 lines, 147KB
- **Components:**
  - 3 classes: `BrokenPipeProtection`, `EmailVerificationHandler`, `BrowserSession`
  - 37 methods in BrowserSession (login, navigation, app management, user/bar addition)
  - 6 Flask API endpoints
  - File-based queue system (`pending_queue/` directory)
  - Synchronous browser automation with Selenium

### Existing Infrastructure (barfindr)
- Celery app with Redis broker at `redis://localhost:6379/0`
- Task routing to queues: "spotify", "maintenance"
- Celery Beat for scheduled tasks
- Patterns: @shared_task decorators, dispatcher/worker tasks, SQLAlchemy sessions
- Structured logging with structlog

---

## Target Architecture

### Proposed Directory Structure

```
spotify_service/
├── src/
│   └── spotify_automation/
│       ├── __init__.py
│       ├── celery.py                    # NEW: Celery app configuration
│       ├── config.py                    # NEW: Configuration management
│       │
│       ├── tasks/                       # NEW: Celery tasks
│       │   ├── __init__.py
│       │   ├── user_tasks.py           # add_user_task, retry_user_addition_task
│       │   ├── bar_tasks.py            # add_bar_task, retry_bar_addition_task
│       │   ├── app_tasks.py            # create_spotify_app_task, refresh_credentials
│       │   ├── queue_tasks.py          # migrate_file_queue_task, process_failed_tasks
│       │   └── maintenance_tasks.py    # cleanup_chrome_processes, cleanup_screenshots
│       │
│       ├── core/                        # Browser & infrastructure
│       │   ├── __init__.py
│       │   ├── browser.py              # BrowserSession (refactored to primitives only)
│       │   ├── email_verification.py   # EmailVerificationHandler (extracted)
│       │   ├── stream_protection.py    # BrokenPipeProtection (extracted)
│       │   └── logging_config.py       # Logging setup with structlog
│       │
│       ├── services/                    # Business logic layer
│       │   ├── __init__.py
│       │   ├── auth_service.py         # login, CAPTCHA, email verification
│       │   ├── app_service.py          # App CRUD, navigation, credentials
│       │   ├── user_service.py         # User/bar addition workflows
│       │   └── notification_service.py # Email notifications (SMTP)
│       │
│       ├── database/                    # Data layer
│       │   ├── __init__.py
│       │   ├── connection.py           # DatabaseManager (SQLAlchemy)
│       │   └── queries.py              # SQL queries as functions
│       │
│       └── api/                         # Flask endpoints
│           ├── __init__.py
│           └── endpoints.py            # Routes dispatch to Celery tasks
│
├── cleanup.py                          # Keep as-is (external dependency)
├── requirements.txt                    # Updated with Celery deps
├── .env                                # Environment variables
└── README.md
```

---

## Key Design Decisions

### 1. Separate Celery App (Recommended)
**Decision:** Create independent Celery app for spotify_automation, separate from barfindr

**Rationale:**
- Different scaling needs (browser automation vs API calls)
- Independent deployment cycles
- Isolated failure domains
- Browser tasks need different timeouts and concurrency

**Configuration:**
```python
# src/spotify_automation/celery.py
app = Celery(
    "spotify_automation",
    broker="redis://localhost:6379/1",  # Different Redis DB from barfindr
    backend="redis://localhost:6379/1"
)
```

### 2. Queue Routing Strategy

**Proposed Queues:**
1. **`spotify_browser`** - Browser automation (long-running)
   - Tasks: add_user, add_bar, create_spotify_app
   - Workers: 1-2 (low concurrency to avoid browser conflicts)
   - Timeout: 10 minutes soft, 15 minutes hard

2. **`spotify_fast`** - Database/API operations
   - Tasks: migrate_file_queue, database updates
   - Workers: 5-10 (high concurrency)
   - Timeout: 1 minute

3. **`spotify_maintenance`** - Scheduled cleanup
   - Tasks: cleanup_chrome_processes, cleanup_old_screenshots, process_failed_tasks
   - Workers: 1
   - Schedule: Via Celery Beat

### 3. Browser Session Management

**Phase 1 (Migration):** Per-task browser approach
- Open browser at task start
- Close browser at task end
- Simple, safe for initial migration
- Higher overhead (~10-20s per task)

**Phase 2 (Optimization):** Worker-level browser pooling
- Initialize browser when worker starts (Celery signals)
- Reuse across tasks within same worker
- Add health checks to detect corruption
- Better performance, more complexity

**Recommendation:** Start with Phase 1, optimize to Phase 2 after stable

### 4. Migration from File Queue to Celery

**Strategy:** Dual-write → Cutover

**Phase 3 (Safety Period):**
- Celery tasks write to both Celery queue AND file queue
- Monitor for discrepancies (1 week)
- Gradual rollout

**Phase 4 (Migration):**
- One-time `migrate_file_queue_task()` to move pending_queue/*.json to Celery
- Disable file queue writing
- Remove file queue code after verification

### 5. Flask API Pattern

**Async with Task IDs:**
```python
@app.route("/add_user", methods=["POST"])
def add_user_endpoint():
    task = add_user_task.delay(user_id, spotify_email)
    return jsonify({"status": "queued", "task_id": task.id}), 202

@app.route("/task_status/<task_id>", methods=["GET"])
def task_status_endpoint(task_id):
    result = AsyncResult(task_id)
    return jsonify({"state": result.state, "ready": result.ready()})
```

**Backward Compatibility Option:**
- Add `?sync=true` query parameter
- Wait for task completion (with timeout)
- Return result synchronously during migration period

---

## Module Organization

### Code Extraction Mapping

| Current Location (lines) | New Module | Purpose |
|--------------------------|------------|---------|
| Lines 169-195 | `core/stream_protection.py` | BrokenPipeProtection class |
| Lines 197-492 | `core/email_verification.py` | EmailVerificationHandler class |
| Lines 45-100 | `core/logging_config.py` | Logging setup, UserActionFilter |
| Lines 622-786 | `core/browser.py` | Browser lifecycle (init, close, screenshots) |
| Lines 815-1723 | `services/auth_service.py` | Login, CAPTCHA, email verification (15 methods) |
| Lines 2000-2392 | `services/app_service.py` | App management, navigation (10 methods) |
| Lines 2806-3133 | `services/user_service.py` | User/bar addition workflows (2 methods) |
| Lines 3283-3347 | `services/notification_service.py` | Email notifications |
| Lines 591-620 | `database/connection.py` | Database connection management |
| Lines 3351-3639 | `api/endpoints.py` | Flask routes |

**Total:** 54 methods categorized and relocated

---

## Celery Task Design

### Task Naming Convention
Follow barfindr pattern: `spotify_automation.tasks.<task_name>`

### Core Tasks

**User/Bar Management:**
```python
@shared_task(
    name="spotify_automation.tasks.add_user",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    autoretry_for=(TimeoutException, ConnectionError)
)
def add_user_task(self, user_id, spotify_email):
    """Add user to Spotify app with automatic retries"""
    # Phase 1: Per-task browser
    browser = BrowserSession()
    try:
        browser.initialize_browser()
        browser.login()
        result = user_service.add_user_to_spotify(browser, user_id, spotify_email)
        return {"success": True, "user_id": user_id, "app_name": result["app_name"]}
    finally:
        browser.close_browser()
```

**Queue Migration:**
```python
@shared_task(name="spotify_automation.tasks.migrate_file_queue")
def migrate_file_queue_task():
    """One-time migration of file-based queue to Celery"""
    # Read pending_queue/*.json files
    # Dispatch to appropriate Celery tasks
    # Move to pending_queue/migrated/
    # Return migration stats
```

**Periodic Maintenance:**
```python
@shared_task(name="spotify_automation.tasks.process_failed_tasks")
def process_failed_tasks():
    """Dispatcher: Find and retry failed tasks (runs every 30 min via Beat)"""
    # Query spotify_task_log for failed tasks
    # Dispatch retry_user_addition_task or retry_bar_addition_task
```

### Beat Schedule

```python
# In celery.py
beat_schedule = {
    "process-failed-tasks": {
        "task": "spotify_automation.tasks.process_failed_tasks",
        "schedule": crontab(minute="*/30"),  # Every 30 minutes
    },
    "cleanup-chrome-processes": {
        "task": "spotify_automation.tasks.cleanup_chrome_processes",
        "schedule": crontab(hour="*/6"),  # Every 6 hours
    },
    "cleanup-old-screenshots": {
        "task": "spotify_automation.tasks.cleanup_old_screenshots",
        "schedule": crontab(hour=2, minute=0),  # 2 AM daily
    },
}
```

---

## Error Handling & Observability

### Task Result Tracking

**New Database Table:**
```sql
CREATE TABLE clubfindr.spotify_task_log (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) UNIQUE NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50),  -- 'user' or 'bar'
    entity_id UUID,
    status VARCHAR(50),  -- 'pending', 'running', 'success', 'failed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    result JSONB,
    error TEXT,
    retries INT DEFAULT 0
);

CREATE INDEX idx_spotify_task_entity ON clubfindr.spotify_task_log(entity_type, entity_id);
CREATE INDEX idx_spotify_task_status ON clubfindr.spotify_task_log(status);
```

### Logging Strategy

**Adopt barfindr's structlog pattern:**
```python
import structlog

logger = structlog.get_logger()

@shared_task(name="spotify_automation.tasks.add_user", bind=True)
def add_user_task(self, user_id, spotify_email):
    logger.info("Starting user addition",
                user_id=user_id,
                task_id=self.request.id)
    try:
        result = perform_addition(user_id, spotify_email)
        logger.info("User addition successful", app_name=result["app_name"])
        return result
    except Exception as e:
        logger.error("User addition failed", error=str(e), exc_info=True)
        raise
```

### Monitoring Tools

1. **Flower** - Real-time Celery monitoring
   - Install: `pip install flower`
   - Run: `celery -A spotify_automation.celery flower --port=5556`
   - Access: http://localhost:5556

2. **Task Log Dashboard** - Query spotify_task_log table
   - Success rate by entity type
   - Average processing time
   - Failed tasks requiring manual intervention

3. **Alerts** - Monitor and alert on:
   - Queue depth > 100
   - Task failure rate > 10%
   - Worker health (any worker down)
   - Orphaned Chrome processes > 5

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Set up Celery infrastructure without breaking existing functionality

**Tasks:**
- [x] Create `src/spotify_automation/` directory structure
- [x] Implement `celery.py` with basic config (queues, routing, Beat schedule)
- [x] Implement `database/connection.py` with SQLAlchemy DatabaseManager
- [x] Extract core classes without modification:
  - [x] `BrokenPipeProtection` → `core/stream_protection.py`
  - [x] `EmailVerificationHandler` → `core/email_verification.py`
  - [x] `UserActionFilter` → `core/logging_config.py`
- [x] Set up structlog configuration
- [x] Create systemd service files for workers and beat
- [x] Deploy Celery worker (no tasks yet, just health check)

**Validation Criteria:**
- ✓ Celery worker starts successfully
- ✓ Connects to Redis (redis://localhost:6379/1)
- ✓ Database connection works
- ✓ Structured logging produces JSON output

---

### Phase 2: Service Layer Extraction (Weeks 3-4)

**Goal:** Extract business logic from BrowserSession into testable services

**Tasks:**
- [x] Create service modules:
  - [x] `services/auth_service.py` - Extract 15 methods (login, CAPTCHA, verification)
  - [x] `services/app_service.py` - Extract 10 methods (app CRUD, navigation, credentials)
  - [x] `services/user_service.py` - Extract 2 methods (user/bar addition orchestration)
  - [x] `services/notification_service.py` - Extract email notification logic
- [x] Refactor `BrowserSession` in `core/browser.py`:
  - [x] Keep only: initialize_browser(), close_browser(), random_delay(), simulate_human_typing(), safe_screenshot()
  - [x] Remove high-level orchestration (now in services)
- [ ] Services depend on BrowserSession via dependency injection
- [ ] Write unit tests for each service (mock browser)
- [ ] Write integration tests for service layer

**Validation Criteria:**
- ✓ All 54 methods accounted for and moved
- ✓ Services testable without real browser
- ✓ 80%+ unit test coverage on services
- ✓ Original functionality preserved (verified via manual testing)

---

### Phase 3: First Celery Tasks (Weeks 5-6)

**Goal:** Implement core tasks while maintaining file queue (dual-write for safety)

**Tasks:**
- [x] Implement `tasks/user_tasks.py`:
  - `add_user_task(user_id, spotify_email)` - Uses per-task browser
  - Dual-write: logs to Celery result backend AND file queue
  - Updates `spotify_task_log` table
- [x] Implement `tasks/bar_tasks.py`:
  - `add_bar_task(bar_id, spotify_email)` - Similar pattern
- [x] Create `spotify_task_log` database table (see schema above)
- [x] Update Flask API in `api/endpoints.py`:
  - POST /add_user dispatches Celery task, returns task_id
  - POST /add_bar dispatches Celery task, returns task_id
  - GET /task_status/<task_id> - Query AsyncResult
- [x] Add `?sync=true` parameter for backward compatibility
- [x] Write task unit tests (eager mode: `task_always_eager=True`)
- [x] Write integration tests (real Celery worker)
- [x] Deploy to dev environment

**Validation Criteria:**
- ✓ Tasks execute successfully end-to-end
- ✓ Both Celery queue and file queue contain same items (dual-write works)
- ✓ Database updates correctly (spotify_app_name populated)
- ✓ Email notifications sent
- ✓ No data loss compared to old system

---

### Phase 4: Queue Migration (Week 7)

**Goal:** Migrate from file-based queue to Celery, remove dual-write

**Tasks:**
- [x] Implement `tasks/queue_tasks.py`:
  - `migrate_file_queue_task()` - Reads pending_queue/*.json, dispatches to Celery
- [x] Run one-time migration in production (Skipped: No legacy files found)
- [x] Monitor for 1 week (compare file queue vs Celery for discrepancies)
- [x] If successful:
  - [x] Disable file queue writes in task code (Initial tasks don't use file queue)
  - [ ] Implement `process_failed_tasks()` scheduled task
- [ ] Remove file queue processing code (after backup)

**Validation Criteria:**
- ✓ All pending queue items migrated to Celery
- ✓ No new file queue entries created
- ✓ Failed tasks retry automatically via Beat schedule
- ✓ Zero data loss during migration

---

### Phase 5: Additional Tasks (Weeks 8-9)

**Goal:** Implement remaining functionality as Celery tasks

**Tasks:**
- [ ] Implement `tasks/app_tasks.py`:
  - `create_spotify_app_task(app_type)`
  - `refresh_app_credentials_task(app_name)`
- [ ] Implement `tasks/maintenance_tasks.py`:
  - `cleanup_chrome_processes_task()` - Reuses cleanup.py logic
  - `cleanup_old_screenshots_task()` - Removes screenshots older than 7 days
- [ ] Set up Celery Beat scheduler (systemd service)
- [ ] Configure Beat schedule in celery.py (see Beat Schedule section above)
- [ ] Implement dead letter queue handling (spotify_task_failures table)
- [ ] Update API endpoints for new tasks
- [ ] Write tests for all new tasks

**Validation Criteria:**
- ✓ All original functionality replicated as Celery tasks
- ✓ Scheduled tasks run correctly (verify via logs)
- ✓ Cleanup tasks work without interfering with workers
- ✓ Dead letter queue captures permanently failed tasks

---

### Phase 6: Optimization & Cleanup (Weeks 10-12)

**Goal:** Optimize performance and remove old code

**Tasks:**
- [ ] **Optimization (Week 10):**
  - Implement worker-level browser pooling (Celery signals)
  - Add browser health checks (verify_login_status before reuse)
  - Tune worker concurrency via benchmarking
  - Add Prometheus metrics (optional)
  - Set up Flower monitoring dashboard
  - Performance testing (compare throughput vs old system)
- [ ] **Cleanup (Week 11):**
  - Remove `SpotifyUserManagementService.py` (backup first!)
  - Remove all file queue code (pending_queue/ directory)
  - Remove dual-write logic from tasks
  - Clean up any temporary migration code
- [ ] **Documentation (Week 12):**
  - Update README.md with new architecture
  - Write operations runbook (how to monitor, troubleshoot)
  - Document common failure scenarios and solutions
  - Update CI/CD pipelines for new structure
  - Train team on new system

**Validation Criteria:**
- ✓ Task throughput improved (benchmark results)
- ✓ Browser overhead reduced (health metrics)
- ✓ Old monolithic file completely removed
- ✓ Clean codebase, no dead code
- ✓ Documentation complete and accurate
- ✓ Team trained and comfortable with new system

---

## Critical File Paths

### Source Files (Current State)
1. `/home/nathan/clubfinder-monorepo/spotify_service/SpotifyUserManagementService.py` - Monolithic file to refactor
2. `/home/nathan/clubfinder-monorepo/spotify_service/cleanup.py` - Reuse in maintenance tasks

### Reference Files (barfindr patterns)
1. `/home/nathan/clubfinder-monorepo/barfindr/src/barfindr/celery.py` - Celery configuration pattern
2. `/home/nathan/clubfinder-monorepo/barfindr/src/barfindr/tasks.py` - Task implementation patterns
3. `/home/nathan/clubfinder-monorepo/barfindr/src/barfindr/database.py` - DatabaseManager pattern
4. `/home/nathan/clubfinder-monorepo/barfindr/src/barfindr/encryption.py` - Credential encryption (may reuse)

### New Files (Target State)
1. `src/spotify_automation/celery.py` - NEW: Celery app initialization
2. `src/spotify_automation/tasks/user_tasks.py` - NEW: Core user addition tasks
3. `src/spotify_automation/services/auth_service.py` - NEW: Authentication logic
4. `src/spotify_automation/database/connection.py` - NEW: SQLAlchemy database manager

---

## Dependencies & Configuration

### New Dependencies (add to requirements.txt)
```
celery>=5.3.0
redis>=4.5.0
structlog>=23.1.0
python-dotenv>=1.0.0
SQLAlchemy>=2.0.0
flower>=2.0.0  # Optional, for monitoring
```

### Environment Variables (migrate from config.json to .env)
```bash
# Spotify credentials
SPOTIFY_EMAIL=
SPOTIFY_PASSWORD=

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/roh_db_dev

# Email
EMAIL_ADDRESS=
EMAIL_PASSWORD=
EMAIL_SERVER=mail.spacemail.com
EMAIL_PORT=993
SMTP_PORT=587

# CAPTCHA
CAPTCHA_API_KEY=

# Celery
REDIS_URL=redis://localhost:6379/1

# Browser
CHROME_DRIVER_PATH=/usr/bin/chromedriver
HEADLESS=true

# App Settings
MAX_USERS_PER_APP=25
```

### Systemd Services

**spotify-automation-worker-browser.service**
```ini
[Unit]
Description=Spotify Automation Celery Worker (Browser Queue)
After=network.target redis.service

[Service]
Type=simple
User=nathan
WorkingDirectory=/home/nathan/clubfinder-monorepo/spotify_service
Environment="PATH=/home/nathan/spotify_service_env/bin"
ExecStart=/home/nathan/spotify_service_env/bin/celery -A src.spotify_automation.celery:app worker --loglevel=info -Q spotify_browser --concurrency=2
Restart=always

[Install] WantedBy=multi-user.target
```

**spotify-automation-beat.service**
```ini
[Unit]
Description=Spotify Automation Celery Beat
After=network.target redis.service

[Service]
Type=simple
User=nathan
WorkingDirectory=/home/nathan/clubfinder-monorepo/spotify_service
Environment="PATH=/home/nathan/spotify_service_env/bin"
ExecStart=/home/nathan/spotify_service_env/bin/celery -A src.spotify_automation.celery:app beat --loglevel=info
Restart=always

[Install] WantedBy=multi-user.target
```

---

## Testing Strategy

### Unit Tests (80% coverage target)
- Test tasks in isolation with `task_always_eager=True`
- Mock BrowserSession for service layer tests
- Test database queries with in-memory SQLite

### Integration Tests (Key workflows)
- Test Celery task execution with real worker
- Test database interactions with test PostgreSQL
- Test Redis connectivity

### End-to-End Tests (Critical paths)
- Test API → Celery → Browser → Database flow
- Test retry mechanisms with simulated failures
- Test queue migration (file queue → Celery)

### Manual Tests (Browser automation)
- Browser automation is hard to fully automate
- Keep manual test scripts for visual verification
- Run in staging environment before production

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser state corruption | High | Health checks + per-task browser in Phase 1 |
| Queue migration data loss | High | Dual-write period (Phase 3) + verification before cutover |
| Task queue overload | Medium | Queue depth monitoring + alerts + rate limiting |
| Worker crashes | Medium | Celery's acks_late + task requeuing |
| Chrome process leaks | Medium | Periodic cleanup task + monitoring alerts |
| Network failures | Low | Task retries with exponential backoff |

---

## Rollback Plan

**If migration fails during Phase 3-4:**
1. Stop Celery workers and beat scheduler
2. Re-enable old Flask endpoints (still exist during migration)
3. File queue still works (dual-write in Phase 3 provides safety)
4. Investigate issues in dev environment
5. Roll forward with fixes

**Risk Mitigation:**
- Keep old code until Phase 6 complete (no deletion until Week 11)
- Dual-write provides safety net during critical migration period
- Database schema changes are additive only (no breaking changes)
- Feature flag support for gradual rollout (can toggle Celery vs direct execution)

---

## Success Metrics

### Performance
- Task processing time: < 5 minutes (p95)
- Queue depth: < 100 items during normal operation
- Browser overhead reduced by 50% (after Phase 6 optimization)
- Throughput: 2x current rate (with worker scaling)

### Reliability
- Task failure rate: < 5%
- Task retry success rate: > 80%
- Zero data loss during migration
- Worker uptime: > 99.5%

### Maintainability
- Average file size: < 500 lines (vs 3,688 current)
- Test coverage: > 80%
- Code duplication: < 5%
- Documentation completeness: 100%

---

## End-to-End Verification

After completing all phases, verify the refactoring with:

1. **Functional Testing:**
   ```bash
   # Add a test user via API
   curl -X POST http://localhost:5000/add_user \
     -H "Content-Type: application/json" \
     -d '{"user_id": "test-uuid", "spotify_email": "test@example.com"}'

   # Get task status
   curl http://localhost:5000/task_status/<task_id>

   # Verify in database
   psql -d roh_db_dev -c "SELECT spotify_app_name FROM clubfindr.users WHERE id = 'test-uuid';"
   ```

2. **Monitor Celery:**
   ```bash
   # Check Flower dashboard
   open http://localhost:5556

   # Check worker status
   celery -A src.spotify_automation.celery:app inspect active

   # Check scheduled tasks
   celery -A src.spotify_automation.celery:app inspect scheduled
   ```

3. **Check Logs:**
   ```bash
   # Task logs (structured JSON)
   tail -f spotify_automation.log | jq

   # Worker logs
   journalctl -u spotify-automation-worker-browser -f

   # Beat logs
   journalctl -u spotify-automation-beat -f
   ```

4. **Database Verification:**
   ```sql
   -- Check task log
   SELECT task_name, status, COUNT(*)
   FROM clubfindr.spotify_task_log
   GROUP BY task_name, status;

   -- Check success rate
   SELECT
     task_name,
     COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) as success_rate
   FROM clubfindr.spotify_task_log
   GROUP BY task_name;
   ```

5. **Performance Testing:**
   ```bash
   # Load test: Add 100 users concurrently
   ab -n 100 -c 10 -T application/json -p user_payload.json \
      http://localhost:5000/add_user

   # Monitor queue depth during load
   watch -n 1 'celery -A src.spotify_automation.celery:app inspect stats'
   ```

---

## Review Notes & Recommendations (Added Jan 24, 2026)

### 1. Python Packaging Strategy
*   **Recommendation:** Treat `spotify_service` as a proper Python package to avoid `PYTHONPATH` issues.
*   **Action:** Create a `pyproject.toml` in `spotify_service/` (referencing `barfindr`'s configuration) and install via `pip install -e .`. This ensures imports like `from spotify_automation.tasks import ...` work reliably in both Celery workers and tests.

### 2. Dependency Alignment
*   **Recommendation:** Align versions with `barfindr` to ensure monorepo consistency.
*   **Action:** Update `requirements.txt` to match `barfindr/requirements.txt` specific versions:
    *   `celery==5.3.6`
    *   `redis==5.0.1`
    *   `SQLAlchemy==2.0.23`
    *   `structlog==24.1.0`

### 3. Database Transition
*   **Observation:** Moving from raw `psycopg2` to `SQLAlchemy` requires strict adherence to the existing schema.
*   **Action:** Ensure the new `DatabaseManager` strictly maps to the columns verified in the original script's `SCHEMA` block (`spotify_app_name`, `app_type`, `app_id`). Copy the `barfindr` database pattern but avoid direct dependencies to keep services decoupled.

### 4. Queue Migration Robustness
*   **Edge Case:** The file-based queue may contain corrupt or empty JSON files.
*   **Action:** implementing `migrate_file_queue_task` must include `try/except` blocks around file parsing. Corrupt files should be moved to a `pending_queue/corrupt/` directory rather than crashing the migration batch.

---

## Next Steps

1. **Review this plan** - Identify any gaps or concerns
2. **Get stakeholder approval** - Confirm timeline and resource allocation
3. **Set up development environment** - Install Redis, update dependencies
4. **Begin Phase 1** - Foundation setup (weeks 1-2)
5. **Establish monitoring** - Set up Flower, configure alerts