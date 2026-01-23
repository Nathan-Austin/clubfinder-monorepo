# barfindr Analysis

**Last Updated: 2026-01-23**

## Component Overview

### Purpose
`barfindr` is a specialized **background worker service** responsible for real-time music intelligence. Unlike a traditional backend API, its primary role is to asynchronously poll music data from connected venues (via Spotify), process this data into "Live" and "Offline" genre profiles, and update the shared database.

### Tech Stack
- **Runtime**: Python 3.x
- **Task Queue**: Celery (handles scheduling and execution)
- **Broker**: Redis
- **ORM**: SQLAlchemy (Shared `clubfindr` schema)
- **External API**: Spotify Web API (via `spotipy`)
- **Encryption**: `cryptography` (AES-GCM for token security)

### Current State
The service is fully functional as a background polling engine. It is **not** responsible for user-facing API routes (bookings, venue management endpoints, etc.), which are handled by the SvelteKit frontend (`clubfindr`).

## Core Logic & Workflows

The service operates on three main scheduled tasks defined in `src/barfindr/celery.py`:

### 1. Live Data Polling (`spotify_genre_polling`)
- **Schedule**: Every 20 minutes (respects `active_hours` configuration).
- **Goal**: Capture the "Now," "Recent," and "Future" vibe of a venue.
- **Process**:
    1.  Queries `clubfindr.bars` for venues with active Spotify connections.
    2.  Decrypts stored Spotify tokens.
    3.  Fetches data from Spotify:
        -   **Currently Playing**: What is on the speakers right now.
        -   **Recently Played**: Context for the last ~20 mins.
        -   **Queue**: Crucial for predicting the "Future" vibe (especially for playlists).
    4.  **Genre Mapping**: Maps tracks to genres using Spotify's artist metadata.
    5.  **Storage**: Creates a time-series snapshot in the `bar_genre_profiles` table containing:
        -   `current_genres`: List of genres for the current track.
        -   `immediate_genre_profile`: Weighted profile based on the **queue**.
        -   `rolling_genre_profile`: Weighted profile based on **recent history**.

### 2. Static Profile Aggregation (`update_genre_aggregates`)
- **Schedule**: Every hour.
- **Goal**: Generate a stable "General Profile" for the venue (used when the venue is offline).
- **Process**:
    1.  Aggregates all `rolling_genre_profile` snapshots from the last **24 hours**.
    2.  Calculates the average weight for each genre.
    3.  **Filtering**: Discards genres with an average weight below **0.1 (10%)** to eliminate noise.
    4.  **Storage**: Updates the `bar_genre_aggregates` table. This table drives the "Top Genres" display on the frontend.

### 3. Maintenance (`database_cleanup`)
- **Schedule**: Daily at midnight.
- **Goal**: Prevent database bloat.
- **Process**: Deletes `bar_genre_profiles` entries older than 24 hours (since they have already been aggregated).

## Data Architecture

### Database Schema (Shared `clubfindr` Schema)
The service reads from and writes to the shared PostgreSQL database used by the web app.

- **`bars` (Read/Write)**:
    -   Reads: OAuth tokens (`spotify_access_token`, `spotify_refresh_token`), `active_hours`.
    -   Writes: Refreshed tokens (if they expire during polling).
- **`bar_genre_profiles` (Write Only)**:
    -   Stores high-frequency, time-series snapshots of venue music states.
    -   Transient data (cleaned up after 24h).
- **`bar_genre_aggregates` (Write Only)**:
    -   Stores the persistent, condensed "Vibe" of the venue.
    -   Source of truth for the "Offline" view.

### Security
- **Token Management**: Spotify Access and Refresh tokens are stored **encrypted** in the database using Fernet (AES-GCM).
- **Isolation**: Each poll operation instantiates a fresh `SpotifyService` context to prevent token leakage between venues.

## Configuration
Configuration is managed via `config/config.yaml` and environment variables:
- **Active Hours**: Polling is restricted to specific hours (e.g., 18:00 - 03:00) to optimize API usage and server resources.
- **Workers**: Scalable Celery worker count.

## Service Management
The service is managed via systemd units or the provided shell scripts:
- `run_celery_worker.sh`: Starts the processing workers.
- `barfindr-celery-beat.service`: Handles the scheduler.

## Conclusion
`barfindr` is effectively the "sensory organ" of the Clubfinder platform. It autonomously monitors the audio environment of connected venues and translates raw Spotify data into meaningful "Vibe" metrics (Immediate vs. General) for the frontend to display.