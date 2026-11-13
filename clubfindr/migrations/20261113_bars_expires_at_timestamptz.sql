-- bars.expires_at (venue and promoter confirmation codes) becomes timestamp with time zone.
--
-- It was timestamp without time zone, and every writer stores new Date(...).toISOString(), so
-- the values are UTC wall-clock time; node-pg read them back as local time, and on a server east
-- of UTC a fresh code looked expired (fixed in code by d25f205, $lib/server/barCodeExpiry). The
-- existing values are therefore converted AT TIME ZONE 'UTC'.
--
-- Idempotent, like the other files in migrations/: the conversion only runs while the column is
-- still without time zone (converting a timestamptz again would shift it by the session zone).

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'clubfindr' AND table_name = 'bars' AND column_name = 'expires_at')
     = 'timestamp without time zone' THEN
    ALTER TABLE clubfindr.bars
      ALTER COLUMN expires_at TYPE timestamp with time zone USING expires_at AT TIME ZONE 'UTC';
  END IF;
END
$$;
