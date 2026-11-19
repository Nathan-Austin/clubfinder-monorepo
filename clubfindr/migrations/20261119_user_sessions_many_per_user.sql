-- One session per device, not per account (KNOWN_ISSUES 95).
--
-- user_sessions had UNIQUE (user_id), so every login replaced the account's one session: logging
-- in on the website logged the phone out and the other way round (found 2026-11-19 while
-- testing the password reset). The constraint goes; a login inserts its own row, a logout,
-- a password reset or an account deletion removes what it should, and hooks.server.ts expires
-- rows it meets as before. The lookups keep their indexes: by session_id (every request) and by
-- user_id (a city change, a reset, a deletion).
--
-- Idempotent, like the other files in migrations/.

ALTER TABLE clubfindr.user_sessions DROP CONSTRAINT IF EXISTS unique_user_id;

CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_session_id_key
  ON clubfindr.user_sessions USING btree (session_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON clubfindr.user_sessions USING btree (user_id);
