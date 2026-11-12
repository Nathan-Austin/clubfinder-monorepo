-- Venue taste profile: the genres a venue declares outright (ROADMAP section 1,
-- KNOWN_ISSUES 4). The artist picker already lets a venue describe itself through artists,
-- but a venue could not say "we play techno" without naming an artist. These genres join the
-- venue's artist genres as its self-description in matching, at the same weight.
--
-- Stored lower-cased and de-duplicated by the API ($lib/taste/venueGenres), which accepts
-- only genres the cluster matcher knows, so a declared genre always scores.
--
-- Idempotent, like the other files in migrations/.

ALTER TABLE clubfindr.bars
  ADD COLUMN IF NOT EXISTS declared_genres text[] DEFAULT '{}'::text[] NOT NULL;
