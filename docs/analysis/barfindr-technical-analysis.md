# Barfindr Technical Analysis & Scalability Report

**Date:** 2026-01-23
**Service:** `barfindr` (Background Music Intelligence)

## Executive Summary
The `barfindr` service is currently designed as a monolithic polling engine. While functional for a small number of venues (< 50), its current architecture uses **sequential processing** and **in-memory aggregation**, which guarantees failure at scale. To support "lots of bars" (100+ to 1000+), the system requires architectural refactoring to leverage parallel processing and database-level computation.

---

## 1. Scalability Bottlenecks

### A. Sequential Polling (Critical)
**Location:** `src/barfindr/tasks.py` -> `spotify_genre_polling`

**Current Logic:**
The task fetches *all* active bars and iterates through them one by one in a nested loop (grouped by Spotify App).
```python
# Pseudo-code of current implementation
all_bars = fetch_all_active_bars() # e.g., 500 bars
for app_group in bars_by_app:
    for bar in app_group:
        fetch_spotify_data(bar) # Takes ~1-2 seconds per bar
        update_database(bar)
```

**The Problem:**
- **Time Constraints:** If each Spotify API call takes 1.5 seconds, processing 500 bars takes **12.5 minutes**.
- **Task Expiry:** The task is scheduled every 20 minutes with a hard expiry of 20 minutes (`expires=1200`).
- **Result:** If the bar count grows, the task will inevitably time out before finishing, leaving the remaining bars un-updated. The queue will back up, and data freshness will degrade.

### B. In-Memory Aggregation (Critical)
**Location:** `src/barfindr/tasks.py` -> `update_genre_aggregates`

**Current Logic:**
The task fetches **all** `bar_genre_profiles` from the last 24 hours into Python memory to calculate averages.
```python
# Current implementation
profiles = session.execute("SELECT ... FROM bar_genre_profiles ...").fetchall()
# ... manually looping through thousands of rows in Python ...
```

**The Problem:**
- **Memory Pressure:** With 500 bars updating every 20 minutes, that's `500 * 3 * 24 = 36,000` rows per day. Loading large JSON blobs for all these rows into RAM will cause **Out-Of-Memory (OOM)** crashes.
- **CPU Inefficiency:** Python is slow at iterating through lists and dictionaries compared to a database engine designed for aggregation.

---

## 2. Proposed Architectural Improvements

### A. Parallelization via Task Chunking
**Goal:** Process bars in parallel to ensure all updates happen within the 20-minute window.

**Strategy:**
1.  **Dispatcher Task:** Create a lightweight "Dispatcher" task that runs every 20 minutes.
2.  **Logic:** The dispatcher queries for active bars but *does not* process them.
3.  **Chunking:** It groups bars into batches (e.g., 10 bars per batch) or by `spotify_app_name`.
4.  **Fan-out:** It spawns multiple `process_bar_batch` sub-tasks (one per batch).
5.  **Execution:** Celery workers process these batches in parallel.

**Benefit:** 1000 bars can be processed as fast as 10 bars, limited only by the number of worker processes.

### B. SQL-Based Aggregation
**Goal:** Move heavy computation from Python app memory to the PostgreSQL database.

**Strategy:**
Rewrite `update_genre_aggregates` to use a SQL query with `JSONB_EACH` (since the profiles are stored as JSONB).

```sql
-- Conceptual SQL approach
INSERT INTO bar_genre_aggregates (bar_id, genre, weight)
SELECT 
    p.bar_id, 
    key as genre, 
    AVG(value::float) as weight
FROM 
    bar_genre_profiles p, 
    jsonb_each_text(p.rolling_genre_profile)
WHERE 
    p.timestamp > NOW() - INTERVAL '24 hours'
GROUP BY 
    p.bar_id, key
HAVING 
    AVG(value::float) > 0.1;
```

**Benefit:**
- **Zero Python Memory Load:** No need to fetch rows into RAM.
- **Speed:** Postgres can aggregate thousands of rows in milliseconds.
- **Simplicity:** Reduces 50 lines of Python loop code to 1 SQL statement.

### C. Rate Limiting Strategy
**Goal:** Prevent hitting Spotify API rate limits when parallel workers share the same App Credentials.

**Strategy:**
- **Spotify App Sharding:** Ensure `Clubfindr Bars 1`, `Clubfindr Bars 2`, etc., are evenly distributed.
- **Shared Rate Limiter:** Use Redis to track API calls per `client_id` across all workers. If a worker sees the limit is near, it sleeps or retries.

---

## 3. Reliability & Maintenance

### A. Error Isolation
- **Current:** A crash in the main loop is caught, but a systemic failure (e.g., database connection loss) kills the entire batch.
- **Proposed:** With "Task Chunking," if one batch fails, only 10 bars are affected. The rest succeed.

### B. Database Connection Pooling
- **Current:** `QueuePool` is used, which is good.
- **Risk:** With many parallel workers, we might exhaust the DB connection pool.
- **Mitigation:** Ensure `pool_size` in `database.py` is tuned to match the number of Celery workers (e.g., if you have 4 workers, a pool size of 5-10 is sufficient).

---

## 4. Implementation Roadmap

### Phase 1: High Priority (Stability)
1.  [ ] **SQL Aggregation:** Rewrite `update_genre_aggregates` to use SQL instead of Python loops. (Fastest win).
2.  [ ] **Chunking:** Refactor `spotify_genre_polling` into a dispatcher/worker pattern.

### Phase 2: Medium Priority (Growth)
3.  [ ] **Redis Rate Limiter:** Implement a distributed rate limiter for Spotify calls.
4.  [ ] **Dynamic Workers:** Configure Celery to auto-scale workers based on queue depth.
