# data_collection Analysis

**Priority: HIGH**
**Last Updated: 2026-01-18**

## Component Overview

### Purpose
Python-based data collection system that scrapes event data from Resident Advisor (RA.co) and enriches it with genre information from Spotify and SoundCloud APIs. This is the foundation of the entire Clubfinder platform - without it, there are no events to display.

### Tech Stack
- **Language**: Python 3.x
- **Database**: PostgreSQL (via psycopg2)
- **APIs**: RA.co GraphQL, Spotify Web API, SoundCloud API
- **Libraries**: requests, spotipy, fuzzywuzzy, beautifulsoup4
- **Scheduling**: Cron via bash script
- **Environment**: Conda (data_col_env)

### Current State
The system is functional and runs on a scheduled basis, processing 9 European cities. However, it has accumulated technical debt including duplicate code, hardcoded configurations, no test coverage, and potential security concerns with pickle-based state management.

## Architecture

### Data Flow
```
run_data_collection.sh (Cron Entry Point)
       │
       ▼
data_collection.py (Orchestrator)
       │
       ├── Lock file check (/tmp/clubfinder_running.lock)
       │
       ├── Load cities from live_cities.txt
       │
       └── For each city:
           │
           ├──► event_fetcher.py (5 min timeout)
           │    │
           │    ├── GraphQL query to ra.co/graphql
           │    ├── Extract events, artists, venues
           │    ├── Fetch venue coordinates (separate query)
           │    └── Save to clubfindr.events, artists, venues, event_artists
           │
           ├──► spotipy_search.py (10 min timeout)
           │    │
           │    ├── Query artists without genres
           │    ├── Multi-key rotation for rate limiting
           │    ├── Fuzzy matching for artists without URI
           │    └── Update artist genres → propagate to events
           │
           └──► soundcloud_api.py (15 min timeout)
                │
                ├── OAuth2 token management
                ├── Resolve artist by URL or search
                ├── Fetch genres from tracks
                └── Update artist genres → propagate to events
```

### File Structure
```
data_collection/
├── data_collection.py       # Main orchestrator (247 lines)
├── event_fetcher.py         # RA.co GraphQL scraper (443 lines)
├── spotipy_search.py        # Spotify enrichment (824 lines)
├── soundcloud_api.py        # SoundCloud enrichment (534 lines)
├── utils.py                 # Database utilities (852 lines)
├── simple_spotipy.py        # Simplified Spotify script (alternate)
├── run_data_collection.sh   # Cron entry point
├── graphql_query_template.json  # RA.co GraphQL query
├── live_cities.txt          # Cities to process
├── full_genre_list.csv      # Valid genres for validation
├── requirements.txt         # Python dependencies
├── database.ini             # DB credentials (not in repo)
└── logs/                    # Per-city log directories
```

### Database Tables Used
```sql
-- Primary tables
clubfindr.events          -- Event listings
clubfindr.artists         -- Artist profiles
clubfindr.venues          -- Venue information with coordinates
clubfindr.event_artists   -- Many-to-many relationship

-- Key columns
events: event_id, event_name, club_name, event_date, event_genres[], latitude, longitude, city
artists: artist_name (unique), spotify_uri, soundcloud_link, genres[], primary_city
venues: name, address, city, latitude, longitude
event_artists: event_id, artist_id, city
```

### Cities Currently Processed
| City | RA Code | Country |
|------|---------|---------|
| London | 13 | UK |
| Berlin | 34 | DE |
| Amsterdam | 29 | NL |
| Rotterdam | 174 | NL |
| Barcelona | 20 | ES |
| Ibiza | 25 | ES |
| Madrid | 41 | ES |
| Paris | 44 | FR |
| Stockholm | 396 | SE |

## Critical Issues

### 1. Pickle Files for State Management
**Severity**: High
**Locations**:
- `spotipy_search.py:46` - API call log
- `soundcloud_api.py:372` - Failed artists log
- `soundcloud_api.py:480` - API call log

```python
# Current (insecure)
with open(api_call_log_file, 'rb') as f:
    api_call_log = pickle.load(f)
```

**Impact**: Pickle deserialization can execute arbitrary code if files are tampered with. While these are local files, any compromise could lead to code execution.

**Recommended Fix**:
```python
# Use JSON instead
import json
with open(api_call_log_file, 'r') as f:
    api_call_log = json.load(f)
    # Convert datetime strings back to datetime objects
    api_call_log = {k: datetime.fromisoformat(v) for k, v in api_call_log.items()}
```

### 2. No Input Validation on GraphQL Response
**Severity**: High
**Location**: `event_fetcher.py:78-98`

```python
def get_events(self, page_number):
    # ...
    return data["data"]["eventListings"]["data"]  # No validation
```

**Impact**: Malformed API responses could cause crashes or unexpected behavior. RA.co API changes would break the system silently.

**Recommended Fix**:
```python
def get_events(self, page_number):
    # ... fetch data ...
    if not data or 'data' not in data:
        logging.error(f"Invalid API response structure")
        return []

    listings = data.get('data', {}).get('eventListings', {})
    if not isinstance(listings, dict):
        logging.error(f"Unexpected eventListings format: {type(listings)}")
        return []

    return listings.get('data', [])
```

### 3. Credentials in Environment Variables Parsed as JSON
**Severity**: Medium
**Location**: `spotipy_search.py:97-112`

```python
spotify_credentials_str = os.environ.get('SPOTIFY_CREDENTIALS', '[]')
spotify_credentials = json.loads(spotify_credentials_str)
```

**Impact**: Complex JSON in environment variables is error-prone. A malformed JSON string causes immediate script failure.

**Recommended Fix**: Use a dedicated credentials file or separate environment variables per credential set.

### 4. Lock File Race Condition
**Severity**: Medium
**Location**: `data_collection.py:34-46`

```python
def check_lock():
    if os.path.exists(LOCK_FILE):
        lock_time = os.path.getmtime(LOCK_FILE)
        # ... check if stale ...

    # Race condition: another process could create file between check and create
    with open(LOCK_FILE, 'w') as f:
        f.write(str(time.time()))
```

**Impact**: Two processes could simultaneously pass the lock check and run concurrently.

**Recommended Fix**: Use `fcntl.flock()` for atomic file locking or use a PID file approach.

## Technical Debt

### 1. Duplicate Function Definitions
**Location**: `utils.py`
**Issue**: Multiple functions defined twice with slight variations

| Function | Line 1 | Line 2 |
|----------|--------|--------|
| `split_and_clean_genres` | 523 | 782 |
| `extract_genres_from_database` | 398 | 489 |
| `filter_genres` | 568 | 728 |

**Impact**: Confusion about which version is used, maintenance nightmare, potential bugs.

### 2. No Test Coverage
**Coverage**: 0%
**Impact**: Any changes risk breaking existing functionality. No regression protection.

**Critical Paths Needing Tests**:
- GraphQL response parsing
- Genre cleaning/validation
- Database insert/update operations
- API rate limiting logic
- Lock file management

### 3. Excessive Logging with Potential PII
**Locations**: Throughout all scripts
**Issue**: Debug logs may contain artist names, URLs, and API responses

```python
# Example from spotipy_search.py:278
logging.info(f"Top result: '{found_name}' (Popularity: {found_popularity}, URI: {found_uri})")
```

**Impact**: Log files could grow very large; may contain data that shouldn't be persisted.

### 4. Hardcoded Timeouts and Limits
**Locations**: Multiple files

| Setting | Value | Location |
|---------|-------|----------|
| Event fetcher timeout | 300s | data_collection.py:139 |
| Spotify timeout | 600s | data_collection.py:149 |
| SoundCloud timeout | 900s | data_collection.py:144 |
| Lock staleness | 14400s (4hr) | data_collection.py:39 |
| API call cooldown | 14 days | spotipy_search.py:186 |
| Requests per key | 80 | spotipy_search.py:119 |

**Recommended**: Move to a configuration file or environment variables.

### 5. Mixed Logging Patterns
**Issue**: Inconsistent logging levels and formats across scripts

- `data_collection.py`: INFO level, file + console
- `event_fetcher.py`: INFO level, file + console
- `spotipy_search.py`: INFO level with separate fuzzy match logger
- `soundcloud_api.py`: ERROR level only

### 6. Date Range Hardcoded
**Location**: `data_collection.py:80-83`

```python
def get_dates():
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.datetime.now() + datetime.timedelta(days=15)).strftime("%Y-%m-%d")
```

**Impact**: Can't easily adjust the scraping window without code changes.

### 7. Error Recovery is Limited
**Issue**: If a city fails partway through, there's no way to resume from where it left off.

```python
# data_collection.py:185-223
for city in cities:
    try:
        # Process city...
    except Exception as e:
        logging.error(f"Error processing city {city_name}: {e}")
        continue  # Skips to next city, losing partial progress
```

### 8. Genre Validation CSV Loading
**Issue**: CSV is loaded repeatedly inside loops instead of once at startup

```python
# spotipy_search.py:282, 429, 603, 722
valid_genres = load_genres_from_csv("/home/nathan/clubfinder/data_collection/full_genre_list.csv")
```

**Impact**: Unnecessary I/O operations, slower execution.

### 9. Database Connection Per Query
**Location**: `utils.py` - Every query function creates new connection

```python
def execute_query(query, params=None, fetch=False, autocommit=True):
    conn = None
    try:
        params_config = config()
        conn = psycopg2.connect(**params_config)  # New connection each time
```

**Impact**: Connection overhead, potential connection exhaustion under load.

**Recommended**: Use connection pooling (e.g., psycopg2.pool).

### 10. No Retry Logic for Database Operations
**Issue**: Database operations don't retry on transient failures

**Recommended**: Add exponential backoff for database connections.

## Improvement Checklist

### Critical (Fix Immediately)
- [ ] Replace pickle with JSON for state files
- [ ] Add response validation for GraphQL API calls
- [ ] Implement atomic file locking (fcntl)
- [ ] Move credentials to secure storage or separate env vars

### High Priority (This Sprint)
- [ ] Add unit tests for core functions (genre cleaning, name cleaning)
- [ ] Add integration tests for database operations
- [ ] Consolidate duplicate function definitions in utils.py
- [ ] Standardize logging across all scripts
- [ ] Load genre CSV once at startup, not in loops

### Medium Priority (Next Sprint)
- [ ] Implement database connection pooling
- [ ] Move hardcoded values to configuration file
- [ ] Add retry logic with exponential backoff
- [ ] Implement partial progress checkpointing
- [ ] Add health check endpoint for monitoring
- [ ] Create proper Python package structure

### Lower Priority (Backlog)
- [ ] Add metrics collection (processing times, success rates)
- [ ] Implement async/parallel city processing
- [ ] Add support for additional cities via config
- [ ] Create admin dashboard for monitoring runs
- [ ] Add data quality validation and alerts

## Verification Steps

### Running the Data Collection Manually
```bash
# Activate environment
source /home/nathan/anaconda3/etc/profile.d/conda.sh
conda activate data_col_env

# Run full collection
cd /home/nathan/clubfinder/data_collection
python data_collection.py

# Run individual scripts for testing
python event_fetcher.py 2026-01-18 2026-01-20 london 13 uk
python spotipy_search.py london
python soundcloud_api.py london
```

### Checking Lock File Status
```bash
# Check if lock exists
ls -la /tmp/clubfinder_running.lock

# Check lock age
stat /tmp/clubfinder_running.lock

# Force remove stale lock (if needed)
rm /tmp/clubfinder_running.lock
```

### Verifying Database Population
```sql
-- Check recent events
SELECT city, COUNT(*) as event_count, MAX(event_date) as latest_date
FROM clubfindr.events
GROUP BY city
ORDER BY city;

-- Check artists with genres
SELECT COUNT(*) as total,
       COUNT(CASE WHEN genres IS NOT NULL AND cardinality(genres) > 0 THEN 1 END) as with_genres
FROM clubfindr.artists;

-- Check recent event-artist associations
SELECT COUNT(*) FROM clubfindr.event_artists
WHERE event_id IN (
    SELECT id FROM clubfindr.events WHERE event_date >= CURRENT_DATE
);
```

### Monitoring Logs
```bash
# Watch live logs
tail -f /home/nathan/clubfinder/data_collection/clubfinder_data_collection.log

# Check for errors
grep -i "error\|exception\|failed" /home/nathan/clubfinder/data_collection/*.log

# Check API rate limiting
grep -i "rate limit" /home/nathan/clubfinder/data_collection/logs/*/spotify_api.log
```

### Testing Individual Components
```bash
# Test genre cleaning (Python REPL)
python3 -c "
from utils import split_and_clean_genres, load_genres_from_csv
valid = load_genres_from_csv('full_genre_list.csv')
result = split_and_clean_genres(['tech house', 'TechHouse', 'invalid-genre'], valid)
print(result)
"

# Test database connection
python3 -c "
from utils import config, execute_query
result = execute_query('SELECT COUNT(*) FROM clubfindr.events', fetch=True)
print(f'Total events: {result[0][0]}')
"
```

## Environment Variables Required

```bash
# Database (via database.ini file)
# [postgresql]
# host=localhost
# database=roh_db_dev
# user=roh_user
# password=roh_password

# Spotify (JSON array of credential objects)
SPOTIFY_CREDENTIALS='[{"client_id":"xxx","client_secret":"xxx"},{"client_id":"yyy","client_secret":"yyy"}]'

# SoundCloud
SC_CLIENT_ID=your_soundcloud_client_id
SC_CLIENT_SECRET=your_soundcloud_client_secret
```

## Files Not in Repository

These files must exist but are not tracked in git:
- `database.ini` - Database credentials
- `logs/` - Log output directory
- `*.pkl` - Pickle state files (api_call_log.pkl, failed_artists.pkl)
- `api_call_count.json` - SoundCloud API tracking

## Related Components

- **clubfindr**: Consumes the data populated by this system
- **app_clubfindr**: Mobile app that displays events from this data
- **barfindr**: May manage venue data that overlaps with venues table

## Dependency on External APIs

| API | Purpose | Rate Limits | Failure Impact |
|-----|---------|-------------|----------------|
| RA.co GraphQL | Event data | Unknown (undocumented) | No new events |
| Spotify Web API | Genre enrichment | 80 req/min per key | Events lack genres |
| SoundCloud API | Genre enrichment | 15k/day | Events lack genres |

## Performance Characteristics

| Metric | Typical Value |
|--------|---------------|
| Full run (9 cities) | 30-60 minutes |
| Events per city | 50-200 |
| Artists per city | 100-500 |
| Spotify API calls per city | 200-1000 |
| Database writes per run | 2000-5000 |

## Security Checklist

- [ ] Pickle files replaced with JSON
- [ ] Database credentials not in code (uses database.ini)
- [x] Parameterized SQL queries (mostly)
- [ ] API credentials in secure storage
- [ ] Log files don't contain secrets
- [ ] Lock file uses atomic operations

## Notes

The data_collection system is the backbone of Clubfinder - if it stops working, no new events appear. The code has grown organically and shows signs of technical debt, but it's fundamentally sound. The main concerns are:

1. **Reliability**: No checkpointing means failed runs waste work
2. **Security**: Pickle files and complex env vars are risky
3. **Maintainability**: Duplicate code and inconsistent patterns
4. **Testability**: Zero test coverage makes changes risky

Priority should be given to adding tests and improving reliability before adding new features.
