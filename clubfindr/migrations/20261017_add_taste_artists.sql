-- Manual taste profile, step 1: favourite artists (see docs/taste-profile-design.md).
--
-- taste_artists is a local catalogue of artists a user can mark as a favourite. Each
-- row remembers where it came from (source + source_id, Spotify for now, Last.fm later)
-- and the genres the provider reported at fetch time, so matching never needs the
-- provider again. user_favourite_artists links users to it; favourites disappear with
-- the user (ON DELETE CASCADE). Used by /api/taste/artists.

CREATE TABLE IF NOT EXISTS clubfindr.taste_artists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('spotify', 'lastfm')),
  source_id text NOT NULL,
  name text NOT NULL,
  genres text[] NOT NULL DEFAULT '{}',
  image_url text,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT taste_artists_source_source_id_key UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS clubfindr.user_favourite_artists (
  user_id uuid NOT NULL REFERENCES clubfindr.users (id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES clubfindr.taste_artists (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favourite_artists_artist_id
  ON clubfindr.user_favourite_artists (artist_id);
