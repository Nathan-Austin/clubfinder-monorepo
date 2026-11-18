-- Live music is an event attribute, not a genre (owner's decision 2026-11-17, ROADMAP
-- section 5).
--
-- A venue could only say "there is a band on" as a free-text event genre ("Live Music",
-- "Acoustic"), which the cluster matcher cannot place: the tag described the night to nobody and
-- scored nothing. Since event genres are checked against the matcher (KNOWN_ISSUES 91), such a
-- tag is now refused outright, so the attribute has to exist for the venues already using it.
--
-- The existing tags move into the new column and leave the genre list, so a venue's old nights
-- keep saying what they are and can be saved again.
--
-- Idempotent, like the other files in migrations/.

ALTER TABLE clubfindr.bar_events
  ADD COLUMN IF NOT EXISTS live_music boolean NOT NULL DEFAULT false;

-- Every spelling the forms allowed for the same thing. "Acoustic" is a way of playing live, so
-- it moves too; anything else a venue typed stays a genre and is left alone.
UPDATE clubfindr.bar_events
   SET live_music = true
 WHERE live_music = false
   AND EXISTS (
     SELECT 1
       FROM unnest(COALESCE(special_genres, ARRAY[]::text[])) AS genre
      WHERE lower(btrim(genre)) IN ('live music', 'live-music', 'livemusic', 'live', 'acoustic')
   );

UPDATE clubfindr.bar_events
   SET special_genres = (
     SELECT COALESCE(array_agg(genre ORDER BY genre), ARRAY[]::text[])
       FROM unnest(COALESCE(special_genres, ARRAY[]::text[])) AS genre
      WHERE lower(btrim(genre)) NOT IN ('live music', 'live-music', 'livemusic', 'live', 'acoustic')
   )
 WHERE EXISTS (
   SELECT 1
     FROM unnest(COALESCE(special_genres, ARRAY[]::text[])) AS genre
    WHERE lower(btrim(genre)) IN ('live music', 'live-music', 'livemusic', 'live', 'acoustic')
 );

CREATE INDEX IF NOT EXISTS idx_bar_events_live_music
  ON clubfindr.bar_events USING btree (live_music)
  WHERE live_music;
