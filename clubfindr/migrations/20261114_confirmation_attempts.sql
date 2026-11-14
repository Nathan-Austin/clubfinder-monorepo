-- A budget of guesses for the e-mailed confirmation codes (KNOWN_ISSUES 55).
--
-- The confirm endpoints accepted unlimited guesses at a six-hex-digit code; the "3 attempts"
-- limit was in the browser only. Every row that carries a code now counts the guesses made at
-- it: each guess adds one in the statement that reads the code ($lib/server/codeAttempts), a new
-- code or a confirmed one sets it back to 0, and at CODE_MAX_ATTEMPTS the endpoint answers 429
-- until a new code is issued. In the database rather than in memory so a restart does not
-- refill the budget.
--
-- Idempotent, like the other files in migrations/. Mirrored into dev/schema.sql.

ALTER TABLE clubfindr.bars
    ADD COLUMN IF NOT EXISTS confirmation_attempts integer DEFAULT 0 NOT NULL;

ALTER TABLE clubfindr.users
    ADD COLUMN IF NOT EXISTS confirmation_attempts integer DEFAULT 0 NOT NULL;
