-- Cancelling one date of a recurring venue event (KNOWN_ISSUES 89).
--
-- A recurring event is one row expanded into dates ($lib/events/recurrence, KNOWN_ISSUES 90), so
-- a venue closing on one of those nights had only one way out: delete the series and lose every
-- other date. A skipped date is a row here; the occurrence function leaves it out, so the night
-- disappears from the venue's list, from both matchers and from /barfindr, and the series goes
-- on as before.
--
-- Idempotent, like the other files in migrations/.

CREATE TABLE IF NOT EXISTS clubfindr.bar_event_skips (
  event_id uuid NOT NULL REFERENCES clubfindr.bar_events (id) ON DELETE CASCADE,
  skip_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, skip_date)
);

CREATE INDEX IF NOT EXISTS idx_bar_event_skips_event_id
  ON clubfindr.bar_event_skips USING btree (event_id);
