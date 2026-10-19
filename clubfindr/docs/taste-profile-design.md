# Taste profile without Spotify

Replacing the Spotify-only taste flow: a trace of how a user's taste reaches the
matching today, a design for a manual taste profile (genres now, favourite artists and
tracks next, Last.fm import later), the schema changes that implies, and what in the
current code will get in the way. No code was changed for this step.

Everything below was read from the code and `dev/seed.sql`; the matching examples were
produced by running the `/clubs` and `/barfindr` matching functions (copied verbatim into a
scratch script) against `src/lib/data/genreClusters.json`.

---

## 1. How taste reaches the matching today

### 1.1 The one thing every path produces

Every path ends in the same intermediate: **a flat list of lower-cased genre strings**
(`genresList: string[]`). Artists, tracks and playlists never reach the matching; they are
converted to Spotify's `artist.genres` tags first and thrown away. The matching then maps
each string to a `(cluster, subCluster)` pair in `genreClusters.json` and compares sets of
pairs with a Jaccard score.

### 1.2 Entry points

| #   | Entry                                                      | Who                             | Where the genres come from                                                                                                                                                                                                                                                                                                         | Transport to the matching                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Genre picker on `/`                                        | guests and logged-in users      | `static/lib/unified-genres.json` (generated from `genreClusters.json` by `scripts/convert-clusters-to-unified.ts`). Four levels: category → subgenre → group → specific genre. Clicking any level adds **that level's label** to the list; "Select All" also adds the parent label (`handleSelectAll`, `src/routes/+page.svelte`). | "Find A club" / "Find A Bar" → `POST /storestate` with `{city, selectedGenre, address, formattedDate}` → server sets httpOnly cookies `city`, `date`, `address`, `genre` (comma list, 1 h) and also writes the blob to memory + `clubfindr.oauth_states` → `goto('/clubs')` or `/barfindr`. **Nothing is written per user**, even when logged in. |
| B   | "Artist or song…" search on `/`                            | guests and logged-in users      | `/spotify/search/+page.server.ts` gets a Spotify **client-credentials** token (app token, no user login, so **not** subject to the 5-user dev-mode cap) and calls `/v1/search?type=artist,track`. The user ticks artists/tracks; a track contributes only its first artist's id.                                                   | `POST /api/spotify/artists {selectedIds}` → `GET /v1/artists?ids=` → union of `artist.genres`. Because the `search` cookie is present it takes the "search-only" branch and sets the `genre` cookie (1 h) instead of writing to the database → `/clubs` or `/barfindr`.                                                                           |
| C   | "Connect with Spotify" (`/` when logged in, `/users-home`) | allow-listed Spotify users (≤5) | OAuth → `/spotify/login` (token exchange, writes tokens to `users` and `user_sessions`, creates a user on first login) → `/spotify` loads recently played, all playlists with all their tracks, top artists. User ticks items; again everything collapses to artist ids.                                                           | `POST /api/spotify/artists` → `artist.genres` → `UPDATE user_sessions SET genres WHERE session_id = $1 AND user_city = $2` and `users.preferences` counters (`search_count`, `last_searched`) → also stored in the module-level `lastFetchedGenres`. Then either `goto('/clubs')` (relies on the DB fallback) or `goto('/selectedGenres')`.       |
| C'  | `/selectedGenres`                                          | after C                         | `GET /api/spotify/artists` returns `lastFetchedGenres` (process global, not per user) and the page writes it to a `spotify-genres` cookie (24 h). User unticks genres and can add free-text "custom genres".                                                                                                                       | Browser JS sets `selected-genres` cookie (24 h, not httpOnly) → `/clubs` or `/barfindr`.                                                                                                                                                                                                                                                          |
| D   | SoundCloud / Tidal pages                                   | logged-in users                 | `POST /api/analyze-selections`: provider `genre`/`genres`, SoundCloud `tag_list` tokens, plus a keyword scan of the artist description against a hard-coded list of 22 genres.                                                                                                                                                     | `user_sessions.genres` + `users.preferences` (same queries as C). No cookie → `/clubs` depends entirely on the DB fallback.                                                                                                                                                                                                                       |
| E   | Mobile app (`/api/mobile/*`)                               | app users                       | App sends `genres` in the request body to `/api/mobile/events/matching` and `/api/mobile/bars/matching`; `/api/mobile/spotify/genres[/process]` stores them in `user_sessions` + `users.preferences` and a `spotify-genres` cookie.                                                                                                | Body parameter; the server never resolves a profile itself.                                                                                                                                                                                                                                                                                       |

### 1.3 Consumers

**`/clubs` (`src/routes/clubs/+page.server.ts`)**

1. Needs `city` and `date` cookies (throws 500 otherwise, known issue #3).
2. Genre source priority, first non-empty wins, and the cookie is **deleted after reading**:
   `selected-genres` → `genre` → `spotify-genres` → `user_sessions.genres WHERE session_id AND user_city = <searched city>`.
3. Loads `events WHERE city AND event_date`, splits `event_genres`.
4. `findClusters()` per genre string against a reverse index of the **leaf genres** of
   `genreClusters.json` (validated copy): exact (weight 1.0) → Levenshtein fuzzy (0.8) →
   word-boundary partial (0.6) → `Uncategorized/Other` (0.3, appended to `missing-genres.txt`).
   On an exact hit with several index entries it takes `exactEntries[0]`.
5. Weighted Jaccard over `(cluster, subCluster)` ids, adaptive threshold
   (`MIN_SIMILARITY 0.05`, `TARGET_RESULTS 50`, `MAX_RESULTS 100`), MMR diversity (0.3).
6. With an empty genre list every similarity is 0 and the threshold maths leaves **nothing**
   (the log line says "showing all events" but the page shows "no matches").

**`/barfindr` (`src/routes/barfindr/+page.server.ts`)**

1. Same cookie priority, but on a `?date=` change it reads without deleting.
2. `expandCompoundGenres()` splits multi-word genres unless in a hard-coded list of 10.
3. A **different** `findClusters()`: exact-only, different `normalizeGenre` (drops `-`, `&`,
   `/`), matches cluster-level `genres`, sub-cluster **names** and leaf genres, and keeps one
   hit per top-level cluster (so a genre present in three clusters yields three pairs).
4. Bar profile = latest `bar_genre_profiles.rolling_genre_profile` keys + upcoming
   `bar_events.special_genres` (weight 0.5, weights are then ignored because only keys are used).
5. Unweighted Jaccard, filter `> 0.05`, sort.

**Mobile** (`/api/mobile/events/matching`, `/api/mobile/bars/matching`): a third and fourth
copy of the matcher (substring match in both directions, `expandGenreGroups()` expands
sub-cluster names to their leaves, which the web never does).

### 1.4 Where taste is persisted today

| Store                                 | Written by                                       | Read by                                                                 | Lifetime / scope                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genre` cookie                        | `/storestate` (A), `/api/spotify/artists` (B)    | `/clubs`, `/barfindr`                                                   | 1 h, deleted on first `/clubs` read                                                                                                                                       |
| `selected-genres` cookie              | `/selectedGenres` page JS                        | `/clubs`, `/barfindr`                                                   | 24 h, deleted on first read                                                                                                                                               |
| `spotify-genres` cookie               | `/selectedGenres` load, mobile genres endpoints  | `/clubs`, `/barfindr`                                                   | 24 h, deleted on first read                                                                                                                                               |
| `user_sessions.genres text[]`         | C, D, E                                          | `/clubs`, `/barfindr` fallback, mobile GET genres                       | one row per user (`UNIQUE (user_id)`); **deleted on every login** (`/login/users` does `DELETE … WHERE user_id`); only readable when `user_city` equals the searched city |
| `users.preferences jsonb`             | C, D, E (`{genre, search_count, last_searched}`) | `/users-home` chart, mobile GET genres fallback. **Never by matching.** | permanent, append-only counters; the picker (A) never touches it                                                                                                          |
| `lastFetchedGenres` (module variable) | `/api/spotify/artists` POST                      | `/api/spotify/artists` GET → `/selectedGenres`                          | process lifetime, shared by all users                                                                                                                                     |
| `oauth_states`                        | `/storestate`                                    | `/spotify/login` only                                                   | 1 h                                                                                                                                                                       |

### 1.5 Flows to confirm

```
A  /  picker ──POST /storestate──▶ cookies(city,date,genre) ──▶ /clubs | /barfindr
B  /  search ──POST /storestate──▶ cookie(search) ──▶ /spotify/search (client-credentials)
      ──tick artists/tracks──▶ POST /api/spotify/artists ──▶ cookie(genre) ──▶ /clubs | /barfindr
C  /users-home or / ──Spotify OAuth──▶ /spotify/login ──▶ /spotify (recent, playlists, top artists)
      ──tick──▶ POST /api/spotify/artists ──▶ user_sessions.genres + users.preferences
          ├──▶ /clubs | /barfindr        (DB fallback, only if user_city == searched city)
          └──▶ /selectedGenres ──▶ cookie(spotify-genres) ──prune──▶ cookie(selected-genres) ──▶ /clubs | /barfindr
D  /soundcloud | /tidal ──tick──▶ POST /api/analyze-selections ──▶ user_sessions.genres ──▶ /clubs (DB fallback)
E  mobile app ──genres in body──▶ /api/mobile/{events,bars}/matching
```

Things worth confirming because they shape the design:

- The genre picker is the only taste input that works for everyone today, and it is
  stateless: a logged-in user who picks genres gets nothing on `/users-home`.
- Path B (artist search) already works **without** a Spotify user login: it uses the app's
  client-credentials token. It is still a Spotify dependency (catalogue + `artist.genres`),
  but it is not the thing the 5-user cap blocks. Worth checking in production that the
  search still returns non-empty `genres` arrays; Spotify has been thinning artist genre tags.
- Tracks and playlists never contribute anything of their own; only the artist ids behind them.

---

## 2. Design: a manual taste profile

### 2.1 Goal

A per-user **taste profile** that is the default input to `/clubs`, `/barfindr` and the
mobile matching endpoints, built from things the user can do without any streaming login:

1. pick genres (existing picker, but saved),
2. pick favourite artists (typeahead),
3. pick favourite tracks (typeahead, resolved through their artists),
4. later: import from Last.fm (top artists, loved tracks, tags) into the same structure.

Spotify / SoundCloud / Tidal become optional _importers_ into the same profile instead of the
only path.

### 2.2 Where manual profile data comes from and how it becomes a genre

```
 input item ──▶ raw tags (provider vocabulary) ──▶ canonical genres (our vocabulary) ──▶ (cluster, subCluster)
 genre pick     [the pick itself]                  alias table / taxonomy                 existing matcher
 artist         provider artist.genres / tags      alias table / taxonomy                 existing matcher
 track          artists of the track ──▶ as artist
 last.fm        artist.getTopTags / track.getTopTags (weighted folksonomy, needs a whitelist)
```

Two things are new compared with today:

- **Canonicalisation step.** Raw tags are kept for provenance, but the profile stores
  canonical genre ids (a leaf of `genreClusters.json`, or a group/category id when the user
  picked that level). Today raw strings go straight into the fuzzy matcher, which is where
  most of the weakness in section 3 comes from. An alias layer (`hip hop` → `Hip-Hop/Rap`,
  `house` → `Dance and Club-Oriented Music`, `dnb` → `Drum & Bass`, …) fixes the common
  cases without rewriting the big JSON.
- **Provenance and weights.** Each canonical genre in the profile knows which items produced
  it (picked directly, or "from artist X"), so the UI can show why something matched and the
  user can remove a derived genre they don't agree with. A simple weight (`picked = 1.0`,
  `from artist = 1/#genres of that artist`, summed and capped) is enough for v1; `/clubs`
  already supports weights, `/barfindr` ignores them.

**Artist catalogue options** (for the typeahead; they can be layered):

| Source                                         | Pros                                                                                      | Cons                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clubfindr.artists` (line-up artists)          | already there with `genres text[]`, `/api/artists/search` exists, matches actual line-ups | only scraped RA artists (mostly DJs), `artist_name UNIQUE` and `primary_city NOT NULL`, genres come from the scraper with no provenance                                      |
| Spotify search with client credentials         | works today, no user login, images, good coverage                                         | still Spotify; `artist.genres` increasingly empty; caching Spotify metadata in our DB needs a check against the developer terms; needs a valid `spotify_apps`/env credential |
| MusicBrainz                                    | free, no key, stable ids (MBID), genres + tags                                            | 1 request/s limit, no images, tags are sparse for small artists                                                                                                              |
| Last.fm (`artist.search`, `artist.getTopTags`) | free key, generous limits, the same API the import will use                               | tags are a folksonomy ("seen live", "favourites", "german"); needs the alias/whitelist layer                                                                                 |

Recommendation for step 1: local `artists` first (they are the artists that actually play in
the cities we cover), one external provider behind an adapter interface
(`searchArtists(term)`, `getArtistTags(id)`), so the Last.fm import reuses it. Whether that
first provider is Spotify client-credentials or Last.fm is decision 3 below.

### 2.3 Schema changes

Proposal only; nothing applied. Names are suggestions.

```sql
-- 1. Items the user picked or imported (artists, tracks, genre picks), with provenance.
CREATE TABLE clubfindr.user_taste_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES clubfindr.users(id) ON DELETE CASCADE,      -- NULL for guests (see decision 1)
  profile_key   text,                                                       -- guest profile cookie id, NULL for users
  item_type     text NOT NULL CHECK (item_type IN ('genre', 'artist', 'track')),
  source        text NOT NULL CHECK (source IN ('manual', 'spotify', 'lastfm', 'soundcloud', 'tidal', 'lineup')),
  name          text NOT NULL,                                              -- genre label, artist name, track title
  artist_name   text,                                                       -- tracks only
  external_ids  jsonb NOT NULL DEFAULT '{}',                                 -- {"spotify": "...", "mbid": "...", "lastfm": "..."}
  raw_tags      text[] NOT NULL DEFAULT '{}',                                -- what the provider said
  genres        text[] NOT NULL DEFAULT '{}',                                -- canonical genres after aliasing
  weight        real NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR profile_key IS NOT NULL)
);
CREATE UNIQUE INDEX ON clubfindr.user_taste_items (coalesce(user_id::text, profile_key), item_type, lower(name), coalesce(lower(artist_name), ''));

-- 2. Materialised genre profile: what the matchers read. Rebuilt whenever items change.
CREATE TABLE clubfindr.user_genre_profile (
  user_id     uuid REFERENCES clubfindr.users(id) ON DELETE CASCADE,
  profile_key text,
  genre       text NOT NULL,                       -- canonical genre id
  weight      real NOT NULL,
  sources     jsonb NOT NULL DEFAULT '[]',         -- [{"item_id": "...", "label": "from Juno Paperplane"}]
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coalesce(user_id::text, profile_key), genre)   -- or a surrogate key + unique index
);

-- 3. Alias layer so raw tags resolve deterministically (could also be a JSON file in src/lib/data).
CREATE TABLE clubfindr.genre_aliases (
  alias     text PRIMARY KEY,                      -- normalised raw tag: 'hip hop', 'dnb', 'house'
  genre     text NOT NULL,                         -- canonical genre id or group/category id
  source    text NOT NULL DEFAULT 'manual'         -- 'manual' | 'spotify' | 'lastfm' (where the alias was seen)
);

-- 4. Optional catalogue cache so typeahead and re-resolution do not hit providers every time.
CREATE TABLE clubfindr.taste_artists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  external_ids  jsonb NOT NULL DEFAULT '{}',
  raw_tags      text[] NOT NULL DEFAULT '{}',
  image_url     text,
  source        text NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  lineup_artist_id uuid REFERENCES clubfindr.artists(id)     -- link when it is also a line-up artist
);
```

Changes to existing tables and files:

- `users`: make `spotify_email` no longer required by the signup path (it is nullable already;
  the requirement is in code). Consider dropping `users.preferences` once `/users-home` reads
  `user_genre_profile`, or keep it as the legacy "search count" chart (decision 5).
- `user_sessions.genres`: keep as the **per-search override** only (what the user picked for
  this search), or drop in favour of the `selected-genres` cookie; either way remove the
  `user_city` condition (section 4, item 2).
- `artists`: if line-up artists feed the typeahead, add `spotify_id` / `mbid` (there is only
  `spotify_uri`) and relax `artist_name UNIQUE` (two different "DJ Shadow"s cannot coexist).
- `migrations/` gets a new file; `dev/schema.sql` and `dev/seed.sql` need the tables plus a
  seeded profile for `listener@clubfindr.test` (currently it only has `preferences`).
- `/api/delete-user-data` must clear the new tables (and should already clear `preferences`).

### 2.4 User flow for genre selection

1. **Entry points.** `/users-home` gets a "Your taste" card (edit / empty-state nudge);
   `/` gets a "Find clubs with my taste" button next to the picker when logged in; first login
   after signup lands on the taste page once.
2. **`/taste` page, three sections on one screen.**
   - _Genres_: the existing picker component, but a selection stores the **canonical id of
     the level picked** (category, group or leaf), not the label, and shows the level
     ("Techno and Rhythmic Electronic Music · 52 genres").
   - _Artists_: search box → results from local line-up artists (badge "plays in Berlin")
     and the external provider; click adds a chip with the artist's resolved genres under it.
   - _Tracks_: same, resolved through the track's artists; the chip shows "via <artist>".
3. **Live profile panel.** Derived canonical genres with weight bars and a provenance badge
   ("picked", "from Juno Paperplane"). The user can remove a derived genre or pin it. Tags
   that did not resolve are listed as "not recognised" with a one-click "treat as …"
   suggestion, instead of silently becoming `Uncategorized`.
4. **Save** writes `user_taste_items` and rebuilds `user_genre_profile`.
5. **Search.** On `/`, city + date + "with my taste" → `/clubs` / `/barfindr` read the profile
   when there is no explicit per-search selection. Results show "matches: techno, deep house
   (from Juno Paperplane)" and an "edit taste" link. Explicit picks for a single search still
   win (cookie), and optionally "add these to my profile".
6. **Guests.** Same page works against a `profile_key` cookie (or stays in
   `localStorage` + cookies, decision 1); sign-up merges it into the account.
7. **Importers.** Spotify / SoundCloud / Tidal / Last.fm pages post their selections as items
   with `source = <provider>`; the user reviews the resulting profile on the same panel
   (replacing `/selectedGenres`).

### 2.5 Matching reads the profile

New resolution order in `/clubs`, `/barfindr` and the mobile endpoints, ideally through one
shared `resolveTasteGenres({cookies, user})` in `$lib` (the refactor already suggested as
Issue #9 in `docs/ML_similarity_review.md`):

1. explicit per-search selection (`selected-genres` / `genre` cookie), not deleted on read;
2. saved profile (`user_genre_profile`), weights passed through;
3. nothing → show the picker / "build your taste" prompt rather than an empty result page.

---

## 3. Where the artist → genre mapping is weak

All examples were run through the actual `/clubs` `findClusters()` / similarity code and
`genreClusters.json` (1,012 leaf genres, 14 clusters).

1. **Vocabulary coverage.** Of the 6,416 Spotify genre strings in
   `src/lib/data/full_genre_list.csv`, the `/clubs` matcher resolves 499 exactly, 998 by
   fuzzy match, 651 by word-boundary partial, and **4,267 (66 %) fall into
   `Uncategorized/Other`**. Plain words users will type or that Spotify returns are not
   leaves at all: `house`, `disco`, `pop`, `hip hop`, `rap`, `jazz`, `soul`, `funk`, `trance`,
   `rock`, `metal`, `indie`, `edm`, `electro`, `nu disco`, `italo disco`, `afrobeats`,
   `breakbeat`, `ebm`, `drum and bass` (only `drum & bass` exists), `neo soul`, `k-pop`.
2. **Fuzzy false friends** (Levenshtein ≥ 0.66 on space-stripped strings): `funk → punk`,
   `hip hop → trip hop`, `edm → idm`, `dnb → dub`, `classic rock → classic house`,
   `german hip hop → reggae hip hop`, `dance pop → jangle pop`, `afro tech → aggrotech`,
   `alternative r&b → alternative metal`, `afropop → art pop`,
   `contemporary classical → contemporary blues`, `anime piano → amapiano`,
   `german dnb → german ebm`. Partial matches: `house → lo-fi house` (Ambient cluster),
   `metal → post-metal` (Alternative Rock), `disco → disco house`, `garage → garage house`,
   `classical → indie classical` (Indie Pop).
   Consequence from the seed: a user who picks **`house`** scores 0.30 against the techno
   night "Subsurface" and **0.00** against the house night "Velour"; `["hip hop", "pop", "r&b"]`
   scores 0.24 against "Subsurface".
3. **The `Uncategorized` bucket matches unknown with unknown.** Every unresolved string on
   either side becomes the same `(Uncategorized, Other)` id with weight 0.3, so
   `["Hip-Hop/Rap"]` vs an event tagged `["schlager"]` scores **1.0**, `["Rock Music"]` vs
   `["k-pop"]` scores 1.0, and `["Hip-Hop/Rap"]` vs `["pop", "hip hop"]` scores 0.27.
   (Introduced by Issue #10 in `ML_similarity_review.md`; not in `KNOWN_ISSUES.md`.)
4. **Picker labels are not matcher vocabulary.** The picker sends whatever level was clicked.
   In `/clubs` the category and most subgenre/group names are not leaves, so
   `Electronic/Dance (EDM)`, `Hip-Hop/Rap`, `Rock Music`, `Latin/Latino Music`,
   `Techno and Rhythmic Electronic Music`, `Modern Trap and Drill` all become `Uncategorized`
   (and then match anything else unknown, item 3). Some groups survive by luck:
   `Minimal and Techno` fuzzy-matches `minimal techno`, `Deep/Tech House` fuzzy-matches
   `deep disco house`, yet `["Deep/Tech House"]` vs `["deep house", "tech house", "minimal"]`
   still scores **0.00** because those leaves sit in other sub-clusters. `/barfindr` resolves
   group and category names (sub-cluster-name and cluster-genre match) but not `Rock Music`
   (its cluster genres are `Rock`, `Rock and Roll`). Mobile expands group names to leaves;
   the web does not.
5. **Duplicate leaves, first one wins.** 92 of the 1,012 leaves appear in more than one
   sub-cluster and `/clubs` takes `exactEntries[0]`: `tech house → Minimal and Techno`,
   `deep house → Classic House`, `deep tech house → Deep/Tech House`, so the seed night
   "Velour" (`deep house, tech house, minimal`) spans three sub-clusters and a `tech house`
   fan scores 0.5 against it. `reggaeton` resolves to **Reggae and Roots** first, while the
   picker's "Reggaeton" group lives under Latin. `indie rock`, `shoegaze`, `dream pop`,
   `post-punk` each sit in two or more clusters, so `/barfindr` counts them twice.
6. **Questionable placements** (the clusters were assigned by
   `src/lib/data/genre-classifier.ts`, whose `calculateSimilarity` counts how many characters
   of the shorter string occur anywhere in the longer one, so almost any pair passes its 0.6
   cut-off): `uk garage` and `gqom` in "Cultural House" next to `afro house`/`amapiano`, so
   the seed afro-house fan matches the UK garage/grime night at 0.33; `dub techno` in
   "Ambient with Rhythmic Elements", so `["dub techno"]` vs `["techno", "minimal techno"]` is
   0.0; `r&b` under Hip-Hop "Pop Rap and Melodic Rap"; `grime` under "Dubstep and Bass";
   `phonk` under "Modern Trap and Drill"; `["techno"]` vs `["hard techno"]` is 0.0 because
   they are different sub-clusters with no credit for the shared parent.
   `src/lib/data/unmatched_genres.txt` still lists `disco`, `r&b`, `salsa`, `k-pop`, `phonk`,
   `ska`, `tango`, `polka` as never placed by the classifier.
7. **The venue side uses other vocabularies.** Bar managers tag events from a preset list
   (`BarEventModal.svelte`: House, Hip-Hop, R&B, Jazz, Rock, Live Music, Indie, Latin, Pop,
   EDM, Soul, Funk, Acoustic…) of which only `Techno` and `R&B` resolve to a sub-cluster in
   `/barfindr`'s exact matcher; `Rock`, `Reggae`, `Latin`, `Blues`, `Country` resolve to a
   cluster-level id that only a category-level pick in the web picker can produce, and the rest (House, Hip-Hop,
   Jazz, Pop, EDM, Soul, Funk, Indie, Folk, Acoustic, Live Music) resolve to nothing. Promoters
   tag club events with
   `GenreSelector.svelte`, which loads the **legacy** `static/lib/genres.json` (a different
   taxonomy: "Alternative" → Art Punk, Britpunk, Steampunk…). Scraped `events.event_genres`
   and `artists.genres` come from RA with no normalisation.
8. **Spotify's own tags are the ceiling.** `artist.genres` is coarse, often empty for smaller
   artists, and is reported to have become sparser since Spotify's 2024/25 API changes (worth
   verifying against the live API); tracks and playlists have no genres, so
   a track selection is just "first artist of the track". The code keeps the union of all
   tags with equal weight, so one eclectic playlist flattens the profile.
9. **Four matchers, three normalisers.** `/clubs` keeps `/` and turns `&` into `and`;
   `/barfindr` drops `-`, `&`, `/`; mobile matches by substring in both directions. The same
   genre list gives different results on `/clubs`, `/barfindr` and the app.

---

## 4. Things in the current flow that will get in the way

New findings, not listed in `docs/KNOWN_ISSUES.md`; noted here rather than fixed.

1. **Signing up requires a Spotify e-mail.** `/login/users` (`isNewUser`) rejects the request
   without `spotifyEmail` ("Missing required fields"), the form validates it as required, and
   the server then calls `spotify_service` `add_user` to allow-list the address. Mobile signup
   (`/api/mobile/signup`) requires a `musicService` choice and falls back to the account
   e-mail for `spotify_email`, which is `UNIQUE`. A Spotify-free taste profile needs this
   relaxed first.
2. **`user_sessions.genres` is the wrong shape for a profile.** Login deletes the user's
   session rows (wiping genres), the row is scoped by `user_city` = the user's home city, and
   both the write (`/api/spotify/artists`, `/api/analyze-selections`:
   `WHERE session_id = $2 AND user_city = $3`) and the `/clubs` fallback compare it with the
   **searched** city. A Berlin user who searches London and goes Spotify → "Let's go" reaches
   `/clubs` with no genres. The write uses `city.toLowerCase()` while login uses
   `normalizeCityName()` (underscores), latent for multi-word cities.
3. **`lastFetchedGenres` is shared by all users.** `/selectedGenres` shows whoever loads it
   the genres of the last `POST /api/spotify/artists` from anyone; a restart empties it.
4. **`/clubs` deletes the genre cookies on first read**, so "Change Date" (`?date=` reload)
   loses a guest's genres and the adaptive threshold then shows "no matches". `/barfindr`
   special-cases `isDateChange`; `TESTING.md` documents the single use only for `/barfindr`.
5. **Empty genres never "show everything".** With no genres every event scores 0 and
   `Math.max(MIN_SIMILARITY, 0)` filters all of them out, contrary to the log message.
6. **`Uncategorized` false positives** (section 3, item 3) would make any new profile look
   broken the first time it contains a tag the taxonomy does not know.
7. **`users.preferences` is write-only.** Matching never reads it, the picker never writes
   it, and `/api/delete-user-data` does not clear it (or `interested_events`).
8. **The picker stores labels at mixed levels** and "Select All" adds the parent as well; the
   web never expands groups to leaves (mobile does).
9. **Profile lives in short cookies.** `genre` 1 h, `selected-genres`/`spotify-genres` 24 h,
   two of them set from browser JS; the `search` cookie flips `/api/spotify/artists` into its
   cookie-only branch for an hour, so a logged-in user who used the search earlier gets no DB
   write from the Spotify flow either.
10. **Client-credentials token in the user cookie.** `/spotify/search` stores the app token in
    `spotifyAccessToken`; after an hour `withAccessToken` tries a refresh, which needs a
    refresh token a guest does not have → 500. Logged-in refreshes also need a `spotify_apps`
    row named `default` (the seed has none).
11. **`query('BEGIN')` on the pool is not a transaction.** `$lib/db.query()` checks out a
    client per call, so `/spotify/login`'s BEGIN/COMMIT/ROLLBACK run on different
    connections. Saving a profile (items + rebuilt genre rows) needs a real client-scoped
    transaction helper.
12. **`artists` table constraints** (`artist_name UNIQUE`, `email UNIQUE`,
    `primary_city NOT NULL`, only `spotify_uri`) make it unsuitable as a general favourite-
    artist catalogue without changes; it is also never used by matching, although
    `event_artists` would allow "your favourite artist plays here" matches directly.
13. **Rate limit vs typeahead.** 60 requests/minute per IP (known #5) is one request a second;
    a debounced artist search plus page loads will hit it.
14. **Stale data copies.** `src/lib/data/unified-genres.json` (840 leaves, a "Roots Music"
    category) is not the file the picker loads (`static/lib/unified-genres.json`, 1,012) and
    nothing reads it; `processed_genres.json` and `unmatched_genres.txt` reflect an old
    classifier run.
15. **`/users-home` has no taste UI**, only connect buttons; the profile chart is the
    `preferences` counters.
16. **Spotify terms.** If provider genres are cached in our own catalogue table, check the
    Spotify Developer Policy on storing metadata before choosing Spotify as the first
    provider.

---

## 5. Decisions taken (2026-10-17)

The questions the first version of this document ended with, and the answers. Section 2 is
the original proposal; where it differs from the answers, the answers win.

| #   | Question                | Decision                                                                                                                                                                                                        |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Who has a profile       | **Logged-in users only.** No guest profiles, no merge on signup. `user_favourite_artists.user_id` is `NOT NULL`.                                                                                                |
| 2   | Signup without Spotify  | **Done.** The Spotify e-mail is optional at `/login/users`; the `spotify_service` call only runs when one is given. Mobile signup untouched.                                                                    |
| 3   | Artist catalogue        | **Local catalogue table that stores the source** (`taste_artists`), filled from **Spotify** (client credentials, the same search as the guest "Artist or song…" path) for v1. **Last.fm tags in a later step.** |
| 4   | Vocabulary              | **Keep `genreClusters.json`, add an alias layer** when the matching is done. The `Uncategorized` false-positive bug (section 3, item 3) is fixed in that step too, not before.                                  |
| 5   | Precedence and learning | **Explicit saves only.** No automatic learning from searches. `users.preferences` stays as it is for now.                                                                                                       |
| 6   | One matcher             | **No.** Out of scope and would clash with other work. The profile is wired into **both existing matchers** in the matching step; unification is a follow-up.                                                    |
| 7   | Weights                 | **Plain set** of genre strings for v1.                                                                                                                                                                          |
| 8   | `user_sessions.genres`  | Untouched for now; revisit with the matching step.                                                                                                                                                              |
| 9   | Tracks                  | **Artists only.** The genres come from the artists anyway.                                                                                                                                                      |
| 10  | Mobile                  | **Out of scope.**                                                                                                                                                                                               |
| 11  | Deletion                | Favourites go with the user through the **FK cascade**. The existing `preferences` / `interested_events` gap in `/api/delete-user-data` stays a known issue (section 4, item 7), not fixed here.                |

### 5.1 What exists now

- `clubfindr.taste_artists` (source, source_id, name, genres as the provider reported them,
  image, fetched_at) and `clubfindr.user_favourite_artists`;
  `migrations/20261017_add_taste_artists.sql`, mirrored in `dev/schema.sql`.
- `GET/POST /api/taste/artists`, `DELETE /api/taste/artists/:artistId` (`src/lib/taste/`).
  Adding an artist by Spotify id fetches it once with the app token, stores it, links it;
  catalogue rows younger than **30 days** are reused without Spotify, older ones refreshed
  (kept if Spotify fails). Capped at 50 favourites. Every response carries `genres`, the
  sorted set of the favourites' genres, which is what the matchers will read.
- Seed: `fan@clubfindr.test` (no Spotify) with three favourites whose genres are stored, so
  nothing in the tests needs the network.

- Picker on `/` for logged-in users (`TasteProfile.svelte`, linked from `/users-home`):
  artist search (`/api/taste/search`: catalogue + Spotify client-credentials search, mocked
  by `tests/mock-spotify.ts` in the e2e suite), add/remove, the genre set, and "Find clubs /
  bars with my taste".
- Matching: `/clubs` and `/barfindr` fall back to the profile after the per-search cookies
  and the Spotify session genres (`src/lib/taste/profileGenres.ts`, one added block per
  `load`). The `Uncategorized` fallback id no longer counts as a match on `/clubs` (section 3,
  item 3). Everything else in section 3 still stands.

- Last.fm import on `/users-home` (`/api/taste/lastfm/import`, `src/lib/taste/lastfm.ts`):
  top artists by username and period become favourites with `source = 'lastfm'`; each
  artist's top tags pass through the `/clubs` classifier (`isKnownGenre`) and only recognised
  tags are stored as genres. Unknown user, rate limit, outage and a missing key have their own
  messages; `LASTFM_API_KEY` / `LASTFM_API_BASE` are runtime settings, mocked by
  `tests/mock-lastfm.ts`. The tag → genre step inherits section 3's gaps (`nu disco`,
  `italo disco` are dropped today), which the alias layer below would fix.
- `/` remembers the city of the last search, so "Change the vibe" does not ask for it again.

- Spotify failures: the development-mode 403 ("user not registered") is explained on `/`,
  `/spotify` loads its sections independently, `SPOTIFY_CONNECT_ENABLED` hides the connect
  buttons. See `HANDOVER.md` for what was not verified against the live APIs.

### 5.2 Still open (see `HANDOVER.md` section 4 for the full list)

- Alias layer for the common raw tags that the clusters do not know (`house`, `hip hop`,
  `pop`, `dnb`, …), de-duplication of the 92 repeated leaves, and unifying the four matchers
  (a follow-up; not done here to keep `/clubs` and `/barfindr` easy to rebase).
- Last.fm artists are matched to existing favourites by name only; the same artist added from
  Spotify and from Last.fm would be two catalogue rows if the names differ in spelling.
- Whether the `spotify_service` add_user call should go entirely, even when a Spotify e-mail
  is given (it mostly fails under the 5-user cap).
