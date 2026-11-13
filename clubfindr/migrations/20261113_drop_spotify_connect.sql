-- Drop what per-account and per-venue Spotify connect stored (ROADMAP section 1).
--
-- DESTRUCTIVE, so deploy/deploy.sh stops for it. Apply it by hand only once the code that no
-- longer reads these columns is live (deploy/TEARDOWN-spotify-service.md has the order, the
-- backup to take first and the rollback). Nothing in clubfindr, barfindr or data_collection
-- reads them any more; spotify_apps and spotify_task_log belonged to spotify_service.
--
-- Kept on purpose: artists.spotify_uri (artist data from data_collection, not connect), the
-- server-side Spotify app's credentials (they live in .env, never in spotify_apps), and the
-- Apple Music / Deezer columns (another clean-up, not Spotify's).
--
-- Idempotent, like the other files in migrations/: every step checks or uses IF EXISTS.

-- Every account keeps its login e-mail: users.general_email is NOT NULL, so no account was
-- reachable through spotify_email alone (the old fallbacks to it in hooks.server.ts and the
-- delete-account endpoints are gone with this change).

-- 1. spotify_service's tables. No CASCADE: anything still depending on them should stop this.
DROP TABLE IF EXISTS clubfindr.spotify_task_log;
DROP TABLE IF EXISTS clubfindr.spotify_apps;

-- 2. Per-user connect: users and their sessions (access_token / refresh_token were Spotify's
--    only; SoundCloud and Tidal keep theirs in cookies). Their UNIQUE constraints go with them.
ALTER TABLE clubfindr.users
  DROP COLUMN IF EXISTS spotify_email,
  DROP COLUMN IF EXISTS spotify_user_id,
  DROP COLUMN IF EXISTS spotify_app_name,
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token;

ALTER TABLE clubfindr.user_sessions
  DROP COLUMN IF EXISTS spotify_user_id,
  DROP COLUMN IF EXISTS spotify_email,
  DROP COLUMN IF EXISTS spotify_username,
  DROP COLUMN IF EXISTS spotify_app_id,
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token;

-- 3. Per-venue connect
ALTER TABLE clubfindr.bars
  DROP COLUMN IF EXISTS music_service,
  DROP COLUMN IF EXISTS spotify_access_token,
  DROP COLUMN IF EXISTS spotify_refresh_token,
  DROP COLUMN IF EXISTS spotify_app_name,
  DROP COLUMN IF EXISTS spotify_email,
  DROP COLUMN IF EXISTS spotify_id,
  DROP COLUMN IF EXISTS spotify_connected;
