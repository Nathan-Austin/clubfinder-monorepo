-- Password reset tokens for a venue's own login (bars.password_hash), KNOWN_ISSUES 68.
--
-- /api/request-password-reset only looked in users, so a venue registered with its own
-- password could never reset it. A table of its own rather than an account kind on
-- password_resets: that table's user_id is NOT NULL with a foreign key to users, and loosening
-- it would make this migration one deploy.sh stops for. Same shape and rules: one pending reset
-- per venue, only a hash of the token stored, gone with the venue.
--
-- Idempotent, like the other files in migrations/.

CREATE TABLE IF NOT EXISTS clubfindr.bar_password_resets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bar_id uuid NOT NULL UNIQUE REFERENCES clubfindr.bars (id) ON DELETE CASCADE,
  reset_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bar_password_resets_reset_token
  ON clubfindr.bar_password_resets (reset_token);
