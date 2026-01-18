# barfindr Analysis

**Priority: LOWER**
**Last Updated: 2026-01-17**

## Component Overview

### Purpose
Python FastAPI backend for venue management operations. Handles venue-specific business logic, background tasks, and Spotify credential management for venues.

### Tech Stack
- **Framework**: FastAPI
- **ORM**: SQLAlchemy
- **Database**: PostgreSQL
- **Task Queue**: Celery with Redis
- **Migrations**: Alembic
- **Encryption**: cryptography (Fernet)

### Current State
The service is functional but incomplete. Several API routes exist but are not fully implemented. Test coverage is limited, and there are some hardcoded fallback credentials that pose a security risk.

## Architecture

### File Structure
```
barfindr/
├── src/
│   └── barfindr/
│       ├── main.py            # FastAPI app entry point
│       ├── database.py        # SQLAlchemy setup
│       ├── models.py          # Database models
│       ├── schemas.py         # Pydantic schemas
│       ├── tasks.py           # Celery tasks
│       ├── spotify_service.py # Spotify API integration
│       └── encryption.py      # Credential encryption
├── migrations/                # Alembic migrations
├── tests/                     # pytest tests
├── requirements.txt           # Python dependencies
├── run_celery_worker.sh      # Celery worker script
└── alembic.ini               # Alembic configuration
```

### Key Patterns
- FastAPI with dependency injection
- SQLAlchemy ORM with Alembic migrations
- Celery for async background tasks
- Redis as message broker
- Fernet encryption for stored credentials

### API Routes (Current)
```
/                          # Health check
/venues/                   # Venue CRUD
/venues/{id}/credentials   # Venue Spotify credentials
/bars/                     # Bar management
/tasks/                    # Background task status
```

## Critical Issues

### 1. Hardcoded Fallback Credentials
**Severity**: High
**Location**: `src/barfindr/spotify_service.py`

Fallback Spotify credentials are hardcoded in the source:

```python
# PROBLEMATIC PATTERN
FALLBACK_CLIENT_ID = "abc123..."
FALLBACK_CLIENT_SECRET = "secret..."
```

**Impact**: Credentials exposed in version control, potential unauthorized access.

**Recommended Fix**:
1. Remove hardcoded credentials
2. Require proper credential configuration
3. Fail gracefully if credentials unavailable

## Technical Debt

### 1. Incomplete API Routes
**Location**: `src/barfindr/main.py`
**Issue**: Several routes are defined but not fully implemented

```python
@app.get("/venues/{venue_id}/analytics")
async def get_venue_analytics(venue_id: int):
    # TODO: Implement
    pass
```

**Incomplete Routes**:
- Venue analytics
- Booking management
- Event scheduling

### 2. Limited Test Coverage
**Current State**: Basic tests exist but coverage is limited

```
tests/
├── test_main.py        # Basic API tests
├── test_database.py    # DB connection tests
└── conftest.py         # pytest fixtures
```

**Missing Tests**:
- Celery task testing
- Spotify integration tests
- Encryption/decryption tests
- Error handling paths

### 3. Outdated Dependencies
**Location**: `requirements.txt`
**Issue**: Some dependencies may be outdated

Run `pip list --outdated` to check for updates.

### 4. Missing Input Validation
**Location**: API routes
**Issue**: Some endpoints lack comprehensive input validation

```python
# Should validate venue data more thoroughly
@app.post("/venues/")
async def create_venue(venue: VenueCreate):
    # Add validation for required fields, formats, etc.
```

### 5. Error Handling Gaps
**Issue**: Inconsistent error responses across endpoints

Some routes return proper HTTP error codes, others may expose internal errors.

### 6. Celery Configuration
**Location**: `tasks.py`, worker scripts
**Issue**: Basic configuration, missing:
- Task retry policies
- Dead letter queues
- Task result cleanup

### 7. Database Session Management
**Location**: `database.py`
**Issue**: Session lifecycle could be better managed with context managers

### 8. Missing API Documentation
**Issue**: FastAPI auto-docs exist but need descriptions

```python
# Should have descriptions
@app.get("/venues/", response_model=List[Venue])
async def list_venues():
    """List all venues."""  # Add docstrings
```

## Improvement Checklist

### Critical (Fix Immediately)
- [ ] Remove hardcoded fallback credentials
- [ ] Add proper error handling for missing credentials
- [ ] Audit all routes for security issues

### High Priority (This Sprint)
- [ ] Complete partially implemented API routes
- [ ] Add comprehensive input validation
- [ ] Increase test coverage (target: 60%)
- [ ] Update outdated dependencies

### Medium Priority (Next Sprint)
- [ ] Add Celery task retry policies
- [ ] Implement proper error responses
- [ ] Add API endpoint documentation
- [ ] Add request logging middleware
- [ ] Implement database session context managers

### Lower Priority (Backlog)
- [ ] Add performance monitoring
- [ ] Implement caching layer
- [ ] Add integration tests
- [ ] Create Docker configuration
- [ ] Add API rate limiting

## Verification Steps

### Removing Hardcoded Credentials
```bash
# 1. Search for hardcoded credentials
grep -r "FALLBACK\|hardcoded\|default.*secret" --include="*.py" barfindr/

# 2. Verify environment variable usage
grep -r "os.environ\|os.getenv" --include="*.py" barfindr/

# 3. Test with missing credentials
unset SPOTIFY_CLIENT_ID
python -m pytest tests/ -v

# Should fail gracefully, not crash
```

### Running Tests
```bash
cd barfindr

# Install dependencies
pip install -r requirements.txt
pip install pytest pytest-cov

# Run tests with coverage
pytest --cov=src/barfindr tests/

# Target metrics:
# - Statements: >60%
# - Branches: >50%
```

### Checking API Documentation
```bash
# Start the server
uvicorn src.barfindr.main:app --reload

# Visit auto-generated docs
# http://localhost:8000/docs (Swagger UI)
# http://localhost:8000/redoc (ReDoc)
```

### Database Migration Check
```bash
cd barfindr

# Check migration status
alembic current
alembic history

# Ensure migrations are up to date
alembic upgrade head

# Test rollback
alembic downgrade -1
alembic upgrade head
```

### Celery Health Check
```bash
# Start Redis (if not running)
redis-server

# Start Celery worker
./run_celery_worker.sh

# In another terminal, check status
celery -A src.barfindr.tasks inspect ping
celery -A src.barfindr.tasks inspect active
```

## Environment Variables Required

```bash
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/barfindr

# Redis (Celery broker)
REDIS_URL=redis://localhost:6379/0

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Encryption key for stored credentials
ENCRYPTION_KEY=
```

## API Route Status

| Route | Status | Tests |
|-------|--------|-------|
| GET / | Complete | Yes |
| GET /venues/ | Complete | Basic |
| POST /venues/ | Complete | Basic |
| GET /venues/{id} | Complete | Basic |
| PUT /venues/{id} | Partial | No |
| DELETE /venues/{id} | Partial | No |
| GET /venues/{id}/credentials | Complete | No |
| GET /venues/{id}/analytics | Not Implemented | No |
| POST /tasks/process | Complete | No |
| GET /tasks/{id}/status | Partial | No |

## Related Components

- **clubfindr**: Calls barfindr for venue operations
- **spotify_service**: Provides credential management
- **data_collection**: May interact for venue data

## Database Schema

Key tables managed by barfindr:
- `venues` - Venue information
- `venue_credentials` - Encrypted Spotify credentials
- `venue_events` - Scheduled events
- `booking_requests` - Artist booking requests

## Celery Tasks

| Task | Purpose | Schedule |
|------|---------|----------|
| refresh_venue_tokens | Refresh Spotify tokens | Every 50 minutes |
| sync_venue_events | Sync events from Spotify | Daily |
| cleanup_expired_tokens | Remove expired credentials | Daily |
| process_booking_queue | Process booking requests | Every 5 minutes |

## Notes

The barfindr service is the least critical component in the immediate term, as the clubfindr web app handles most venue operations directly. However, it provides important background task processing and is designed to offload venue-specific operations. Completing the partially implemented routes and improving test coverage should be done before adding new features.

The service architecture is sound (FastAPI + Celery is a good pattern), but execution is incomplete. Priority should be on finishing what's started rather than adding new capabilities.
