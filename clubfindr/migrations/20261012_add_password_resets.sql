-- Password reset tokens, used by /api/request-password-reset and /api/reset-password.
-- One pending reset per user (the request endpoint upserts ON CONFLICT (user_id)).
CREATE TABLE IF NOT EXISTS clubfindr.password_resets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES clubfindr.users (id) ON DELETE CASCADE,
  reset_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_reset_token ON clubfindr.password_resets (reset_token);
