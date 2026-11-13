# Tonight's vibe and saved mixes (proposal)

Status: proposal, design only (2026-11-13). Not built. Linked from ROADMAP section 3.

With per-account Spotify connect retired (ROADMAP section 1), users can no longer pull a live
playlist to say what they feel like tonight. The taste profile (`docs/taste-profile-design.md`)
is the right default, but it is a standing description. This proposal adds a quick, temporary
way to say "tonight I'm into this", and named mixes to come back to, without ever changing the
saved profile.

## Product

**Tonight.** A temporary list of a few artists, built on the fly, that matching uses instead of
the profile.

- Entry points: a card at the top of the app's Discover tab and next to the taste profile on
  the web home page: "Tonight I'm into…", an artist search box, the picked artists as chips
  with their genres, and Find bars / Find clubs.
- Search is the one the pickers already use (`GET /api/taste/search`: the server-side Spotify
  app plus the catalogue). Genres come with each artist, and the Last.fm / MusicBrainz fallback
  (`$lib/taste/genreFallback`) fills in artists Spotify has no genres for. If Spotify is down,
  the catalogue and a MusicBrainz name search keep it usable without new keys.
- Temporary by default: it lapses at 06:00 local time the next morning and matching falls back
  to the profile. Results say so: "Matching tonight's vibe · back to my taste".
- It never writes to `user_favourite_artists`.

**Mixes.** Named, saved lists ("Sunday chill", "Peak-time techno").

- "Save as mix" turns tonight's list into one (a name is required). Mixes appear as chips under
  the Tonight card; tapping one searches with it. Rename, edit and delete from Profile.
- Limits: 10 mixes, 1-10 artists each.

**Later, optional.** A "my taste + tonight" blend toggle; offering a mix as the starting point
for the after-the-night thumbs up/down in ROADMAP section 3.

## Technical design

**Data** (migration, mirrored in `dev/schema.sql`):

- `taste_lists`: `id uuid`, `user_id uuid` → `users`, `name text` (1-40 chars), `created_at`,
  `updated_at`, `last_used_at`; unique `(user_id, lower(name))`.
- `taste_list_artists`: `list_id` → `taste_lists` (on delete cascade), `taste_artist_id` →
  `taste_artists`, `position`; primary key `(list_id, taste_artist_id)`. Reusing the
  `taste_artists` catalogue means stored genres and the genre fallback are shared, with no new
  provider calls.
- Tonight needs no rows in v1: the client holds the artist ids (app: memory + AsyncStorage; web:
  a `tonight-vibe` cookie expiring at 06:00, like the `selected-genres` cookie).

**API** (session cookie or the app's Bearer token through `getSessionUserId`, like `/api/taste/*`):

- `GET/POST /api/taste/lists`, `PATCH/DELETE /api/taste/lists/:id`,
  `POST /api/taste/lists/:id/artists`, `DELETE /api/taste/lists/:id/artists/:artistId`.
  Another user's list is a 404.
- Matching (`POST /api/mobile/bars/matching`, `POST /api/mobile/events/matching`, `/clubs`,
  `/barfindr`) gains one optional input: `listId`, or `artists: [{ source, sourceId }]` for
  Tonight. It becomes a weighted genre profile through the code the taste profile uses
  (`FavouriteArtistsProfile.genreWeights`, KNOWN_ISSUES 32), which is better than sending a flat
  genre list (sent genres are unweighted). Precedence: explicit list > Tonight > profile.

**Relation to ROADMAP section 2.** A mix is a side the user picks themselves. That delivers part
of "score a listener's taste in sides" without settling its granularity question, and is worth
weighing before that decision.

**Validation** (ROADMAP section 4): shared validators for list names, artist counts and ids;
oversized or malformed input is a 400 before any query.

**Tests:** e2e against `tests/mock-spotify.ts`: search, build Tonight, results differ from the
profile's, the profile is unchanged, save as mix, reuse it, another user cannot read it. Jest
for the app's expiry and selection logic. No live API calls.

**Size:** about one stage: one migration, five endpoints, one matching parameter in four places,
a Discover card and Profile management in the app, a web card.

## Open questions

- Expiry: 06:00 local next morning, or a fixed 12 hours?
- Replace the profile for the night, or blend with it?
- Should venues get the same ("tonight's set") for their dashboard?
- Naming: "Tonight", "Vibe", "Mix"?
