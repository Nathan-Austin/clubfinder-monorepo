-- Venue taste profile: the artists a venue says it plays (ROADMAP section 1,
-- KNOWN_ISSUES 4). The genres of these artists describe the venue by hand, so matching no
-- longer depends on barfindr polling its Spotify playback.
--
-- Deliberately a separate table from user_favourite_artists rather than a reuse of it: a
-- venue is not a user (clubfindr.bars has its own id and its own login), and the two sides
-- of the match should not be able to overwrite each other. Both point at the same
-- taste_artists catalogue, so an artist looked up once serves users and venues alike.
--
-- Idempotent, like the other files in migrations/.

CREATE TABLE IF NOT EXISTS clubfindr.bar_favourite_artists (
  bar_id uuid NOT NULL REFERENCES clubfindr.bars (id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES clubfindr.taste_artists (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (bar_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_bar_favourite_artists_artist_id
  ON clubfindr.bar_favourite_artists (artist_id);
