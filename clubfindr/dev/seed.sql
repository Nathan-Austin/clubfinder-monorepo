-- Synthetic seed data for local development and testing.
--
-- Everything here is invented: clubs, bars, artists, events, addresses and
-- people are fictional, and all e-mail addresses use the reserved .test domain.
-- Event dates are relative to CURRENT_DATE, so upcoming-event pages always
-- have content. Re-running this file wipes the clubfindr tables and reloads
-- the same data.
--
-- Test logins (see dev/TESTING.md):
--   listener@clubfindr.test  / Listener#2026    regular user   -> /login/users
--   promoter@clubfindr.test  / Promoter#2026    promoter       -> /login/bars
--   bar@clubfindr.test       / BarManager#2026  bar manager    -> /login/bars
--   fan@clubfindr.test       / Fan#2026         regular user without Spotify, with
--                                               favourite artists (taste profile) -> /login/users
--   newcomer@clubfindr.test  / Newcomer#2026    regular user without Spotify and with an
--                                               empty taste profile -> /login/users
--
-- Password hashes are bcrypt with 10 rounds, as made by hashPassword() in
-- src/lib/passwordUtils.ts.

\set ON_ERROR_STOP on

BEGIN;

-- Guard: only ever seed the local dev database. Inside the transaction on
-- purpose: if this fails, every later statement fails too and COMMIT rolls
-- back, even when the client keeps going after errors.
DO $$
BEGIN
	IF current_database() <> 'clubfindr_dev' THEN
		RAISE EXCEPTION 'seed.sql refuses to run in database "%": it only loads into clubfindr_dev',
			current_database();
	END IF;
END
$$;

TRUNCATE
	clubfindr.event_artists,
	clubfindr.events,
	clubfindr.artists,
	clubfindr.bar_events,
	clubfindr.bar_genre_aggregates,
	clubfindr.bar_genre_profiles,
	clubfindr.bar_music_profiles,
	clubfindr.bar_promoters,
	clubfindr.promotion_requests,
	clubfindr.user_checkins,
	clubfindr.bar_qr_codes,
	clubfindr.bar_sessions,
	clubfindr.bars,
	clubfindr.promoters,
	clubfindr.user_favourite_artists,
	clubfindr.taste_artists,
	clubfindr.user_sessions,
	clubfindr.password_resets,
	clubfindr.oauth_states,
	clubfindr.spotify_task_log,
	clubfindr.spotify_apps,
	clubfindr.users,
	clubfindr.venues
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- Users: one per role. Cities are stored normalised (lower case), as the app
-- does with normalizeCityName().
-- ---------------------------------------------------------------------------

INSERT INTO clubfindr.users
	(id, general_email, password_hash, name, role, city, confirmed, is_promoter,
	 onboarding_complete, preferences, interested_events)
VALUES
	-- Regular user: logs in at /login/users
	('00000000-0000-4000-8000-000000000001', 'listener@clubfindr.test',
	 '$2a$10$0pIcJC3htffMnJ/3AirUAeWnJlqV1Pw/crLGElY8e6CoJlRWCOsOW',
	 'Lena Listener', NULL, 'berlin', true, false, true,
	 '[{"genre": "techno", "search_count": 9, "last_searched": "2026-01-01"},
	   {"genre": "deep house", "search_count": 6, "last_searched": "2026-01-01"},
	   {"genre": "dub techno", "search_count": 4, "last_searched": "2026-01-01"},
	   {"genre": "uk garage", "search_count": 3, "last_searched": "2026-01-01"},
	   {"genre": "ambient", "search_count": 2, "last_searched": "2026-01-01"}]'::jsonb,
	 ARRAY['dev-ber-001', 'dev-ber-004', 'dev-lon-002']),
	-- Promoter: logs in at /login/bars, lands on /promoter-home
	('00000000-0000-4000-8000-000000000002', 'promoter@clubfindr.test',
	 '$2a$10$CkxlY9lmHkWJOB9xW8WAlu51DQPFxURM2kLQrj2JMziGTej2S0Fwe',
	 'Paz Promoter', 'manager', 'berlin', true, true, true, '[]'::jsonb, NULL),
	-- Bar manager: logs in at /login/bars, lands on /bars. The registration
	-- flow creates a users row with role 'manager' plus a bars row with the
	-- same e-mail and password hash; this mirrors it.
	('00000000-0000-4000-8000-000000000003', 'bar@clubfindr.test',
	 '$2a$10$/P75P1c.9/qjpX.ZbvABfeo.f938kHNpqPCHLEasNO2.9A9bsrk2O',
	 'Bo Barkeep', 'manager', 'berlin', true, false, true, '[]'::jsonb, NULL),
	-- Regular user who never connected Spotify (no spotify_email, empty
	-- preferences): taste comes only from the favourite artists below.
	('00000000-0000-4000-8000-000000000004', 'fan@clubfindr.test',
	 '$2a$10$XnvrXIPC16BZM/l32dMJUee0CFDXVbcY5fXNUfx8Q6/KK4pcrm9.W',
	 'Farid Fan', NULL, 'berlin', true, false, true, '[]'::jsonb, NULL),
	-- Regular user who never connected Spotify and has no favourite artists
	-- yet: the empty taste profile. Only the taste tests log in as this user.
	('00000000-0000-4000-8000-000000000005', 'newcomer@clubfindr.test',
	 '$2a$10$lniEoW9jfeprCXvwd7Yop.5w1B4i0YU4lzkQTkFeCqqr9RZSD8Ffq',
	 'Nia Newcomer', NULL, 'berlin', true, false, true, '[]'::jsonb, NULL);

-- ---------------------------------------------------------------------------
-- Taste profile: favourite artists (see docs/taste-profile-design.md).
-- taste_artists is the local catalogue; genres are stored as the provider
-- reported them, so /api/taste/artists never has to reach Spotify for these.
-- source_id values are Spotify-shaped (22 base-62 characters) but invented.
-- ---------------------------------------------------------------------------

INSERT INTO clubfindr.taste_artists (id, source, source_id, name, genres, image_url, fetched_at)
VALUES
	('00000000-0000-4000-8000-0000000000d1', 'spotify', 'devJunoPaperplane00001',
	 'Juno Paperplane', ARRAY['deep house', 'minimal'], NULL, now()),
	('00000000-0000-4000-8000-0000000000d2', 'spotify', 'devKasimirLow000000001',
	 'Kasimir Low', ARRAY['minimal techno', 'dub techno'], NULL, now()),
	('00000000-0000-4000-8000-0000000000d3', 'spotify', 'devTamsinOkra000000001',
	 'Tamsin Okra', ARRAY['afro house', 'amapiano'], NULL, now()),
	-- In the catalogue but nobody's favourite: adding it must not call Spotify either
	('00000000-0000-4000-8000-0000000000d4', 'spotify', 'devPerihelionChoir0001',
	 'Perihelion Choir', ARRAY['ambient', 'modern classical'], NULL, now());

INSERT INTO clubfindr.user_favourite_artists (user_id, artist_id, created_at)
VALUES
	('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000d1', now() - interval '3 days'),
	('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000d2', now() - interval '2 days'),
	('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000d3', now() - interval '1 day');

-- events.promoter_id references promoters(id), while /promoter-home looks
-- events up by the promoter's users.id, so the two ids are the same.
INSERT INTO clubfindr.promoters (id, name, email)
VALUES ('00000000-0000-4000-8000-000000000002', 'Paz Promoter', 'promoter@clubfindr.test');

-- ---------------------------------------------------------------------------
-- Bars (barfindr). Only the bar manager's bar has a password. music_service
-- is NULL so logging in does not try to reach Spotify.
-- ---------------------------------------------------------------------------

INSERT INTO clubfindr.bars
	(id, user_id, name, contact_person, general_email, phone, address, postcode,
	 website, music_service, city, confirmed, password_hash, description,
	 opening_hours, closing_hours, smoking_allowed, bar_types)
VALUES
	('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000003',
	 'The Copper Lantern', 'Bo Barkeep', 'bar@clubfindr.test', '+49 30 0000001',
	 'Fiktivstraße 12', '10999', 'https://copper-lantern.example', NULL, 'berlin', true,
	 '$2a$10$/P75P1c.9/qjpX.ZbvABfeo.f938kHNpqPCHLEasNO2.9A9bsrk2O',
	 'Candle-lit cocktail bar with a deep house and dub techno soundtrack.',
	 '18:00', '02:00', false, ARRAY['cocktail', 'lounge']),
	('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000002',
	 'Static Orchard', 'Paz Promoter', 'static-orchard@clubfindr.test', '+49 30 0000002',
	 'Beispielallee 3', '10245', 'https://static-orchard.example', NULL, 'berlin', true,
	 NULL, 'Courtyard bar run by the Orchard Sessions crew. Minimal and acid techno.',
	 '17:00', '03:00', true, ARRAY['dive', 'live music']),
	('00000000-0000-4000-8000-0000000000b3', NULL,
	 'Fern & Feedback', 'Ari Example', 'fern-feedback@clubfindr.test', '+49 30 0000003',
	 'Musterweg 45', '10437', 'https://fern-feedback.example', NULL, 'berlin', true,
	 NULL, 'Record bar spinning ambient, downtempo and nu jazz.',
	 '16:00', '01:00', false, ARRAY['wine', 'vinyl']),
	('00000000-0000-4000-8000-0000000000b4', NULL,
	 'The Mossy Anvil', 'Sam Sample', 'mossy-anvil@clubfindr.test', '+44 20 0000004',
	 '7 Placeholder Lane', 'E1 0XX', 'https://mossy-anvil.example', NULL, 'london', true,
	 NULL, 'Pub basement with UK garage, grime and dubstep nights.',
	 '17:00', '01:00', false, ARRAY['pub']),
	('00000000-0000-4000-8000-0000000000b5', NULL,
	 'Lighthouse Pantry', 'Kim Demo', 'lighthouse-pantry@clubfindr.test', '+31 20 0000005',
	 'Voorbeeldgracht 88', '1015 XX', 'https://lighthouse-pantry.example', NULL, 'amsterdam', true,
	 NULL, 'Canal-side bar with afro house and amapiano at weekends.',
	 '15:00', '01:00', false, ARRAY['canal', 'cocktail']);

INSERT INTO clubfindr.bar_genre_profiles
	(bar_id, "timestamp", current_track_id, current_track_name, current_genres, rolling_genre_profile)
VALUES
	('00000000-0000-4000-8000-0000000000b1', now() - interval '5 minutes', 'dev-track-1',
	 'Lantern Glow (Original Mix)', '["deep house", "dub techno"]',
	 '{"deep house": 0.5, "dub techno": 0.3, "minimal": 0.2}'),
	('00000000-0000-4000-8000-0000000000b2', now() - interval '8 minutes', 'dev-track-2',
	 'Orchard Acid', '["acid techno", "minimal techno"]',
	 '{"acid techno": 0.45, "minimal techno": 0.35, "techno": 0.2}'),
	('00000000-0000-4000-8000-0000000000b3', now() - interval '3 minutes', 'dev-track-3',
	 'Slow Fern', '["ambient", "nu jazz"]',
	 '{"ambient": 0.4, "downtempo": 0.35, "nu jazz": 0.25}'),
	('00000000-0000-4000-8000-0000000000b4', now() - interval '6 minutes', 'dev-track-4',
	 'Anvil Shuffle', '["uk garage", "grime"]',
	 '{"uk garage": 0.5, "grime": 0.3, "dubstep": 0.2}'),
	('00000000-0000-4000-8000-0000000000b5', now() - interval '2 minutes', 'dev-track-5',
	 'Pantry Groove', '["afro house", "amapiano"]',
	 '{"afro house": 0.55, "amapiano": 0.45}');

INSERT INTO clubfindr.bar_genre_aggregates (bar_id, genre, weight)
VALUES
	('00000000-0000-4000-8000-0000000000b1', 'deep house', 0.5),
	('00000000-0000-4000-8000-0000000000b1', 'dub techno', 0.3),
	('00000000-0000-4000-8000-0000000000b2', 'acid techno', 0.45),
	('00000000-0000-4000-8000-0000000000b2', 'minimal techno', 0.35),
	('00000000-0000-4000-8000-0000000000b3', 'ambient', 0.4),
	('00000000-0000-4000-8000-0000000000b4', 'uk garage', 0.5),
	('00000000-0000-4000-8000-0000000000b5', 'afro house', 0.55);

INSERT INTO clubfindr.bar_events
	(bar_id, event_date, theme_name, description, start_time, end_time, recurring,
	 recurrence_pattern, special_genres)
VALUES
	('00000000-0000-4000-8000-0000000000b1', CURRENT_DATE, 'Lantern Lounge',
	 'Resident selectors, deep cuts only.', '20:00', '01:00', true, 'weekly',
	 ARRAY['deep house', 'dub techno']),
	('00000000-0000-4000-8000-0000000000b1', CURRENT_DATE + 3, 'Copper Sundown',
	 'Early-evening warm-up session.', '18:00', '22:00', false, NULL, ARRAY['downtempo']),
	('00000000-0000-4000-8000-0000000000b2', CURRENT_DATE + 1, 'Orchard Sessions',
	 'Acid lines in the courtyard.', '21:00', '03:00', true, 'weekly',
	 ARRAY['acid techno', 'minimal techno']),
	('00000000-0000-4000-8000-0000000000b3', CURRENT_DATE + 2, 'Quiet Feedback',
	 'Listening session with a full album side.', '19:00', '23:00', false, NULL,
	 ARRAY['ambient', 'nu jazz']),
	('00000000-0000-4000-8000-0000000000b4', CURRENT_DATE, 'Anvil Garage Night',
	 'Two-step until close.', '21:00', '01:00', true, 'weekly', ARRAY['uk garage', 'grime']),
	('00000000-0000-4000-8000-0000000000b5', CURRENT_DATE + 4, 'Pantry Sunsets',
	 'Log drums by the water.', '17:00', '23:00', false, NULL, ARRAY['amapiano', 'afro house']);

INSERT INTO clubfindr.bar_music_profiles
	(id, bar_id, current_artist, current_track, is_active, last_updated, genre, music_style)
VALUES
	('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1',
	 'Mira Vantablack', 'Lantern Glow', true, now(), 'deep house', 'warm'),
	('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b2',
	 'Orbit Kestrel', 'Orchard Acid', true, now(), 'acid techno', 'driving');

INSERT INTO clubfindr.bar_qr_codes (bar_id, title, type)
VALUES
	('00000000-0000-4000-8000-0000000000b1', 'Table check-in', 'checkin'),
	('00000000-0000-4000-8000-0000000000b1', 'Happy hour', 'promotion');

INSERT INTO clubfindr.bar_promoters (bar_id, promoter_id)
VALUES ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Venues (not read by the web app today; kept consistent with the clubs below)
-- ---------------------------------------------------------------------------

INSERT INTO clubfindr.venues (venue_id, name, address, city, latitude, longitude)
VALUES
	('dev-v-01', 'Halle Nimbus', 'Fiktivstraße 101, 10997 Berlin', 'berlin', 52.50100000, 13.44100000),
	('dev-v-02', 'Parallax Cellar', 'Beispielufer 7, 10179 Berlin', 'berlin', 52.51200000, 13.42000000),
	('dev-v-03', 'Neon Heron', 'Musterplatz 2, 12043 Berlin', 'berlin', 52.48100000, 13.43500000),
	('dev-v-04', 'Hollow Moon Club', 'Platzhalterweg 9, 10115 Berlin', 'berlin', 52.53000000, 13.38500000),
	('dev-v-05', 'Basement Atlas', '12 Example Yard, London E2 0XX', 'london', 51.52700000, -0.07200000),
	('dev-v-06', 'Velvet Pylon', '40 Sample Arches, London SE1 0XX', 'london', 51.50100000, -0.09000000),
	('dev-v-07', 'Driftwood Hall', '3 Demo Wharf, London E14 0XX', 'london', 51.50500000, -0.02000000),
	('dev-v-08', 'Lumen Tide', 'Voorbeeldkade 21, 1019 XX Amsterdam', 'amsterdam', 52.37700000, 4.93000000),
	('dev-v-09', 'Ferro Garden', 'Testlaan 5, 1097 XX Amsterdam', 'amsterdam', 52.35000000, 4.92000000);

-- ---------------------------------------------------------------------------
-- Artists (all invented)
-- ---------------------------------------------------------------------------

INSERT INTO clubfindr.artists (artist_name, genres, primary_city, soundcloud_link, ra_link)
SELECT a.name, a.genres, a.city, NULL, NULL
FROM (VALUES
	('Mira Vantablack', ARRAY['techno', 'dub techno'], 'berlin'),
	('Orbit Kestrel', ARRAY['acid techno', 'hard techno'], 'berlin'),
	('Juno Paperplane', ARRAY['deep house', 'minimal'], 'berlin'),
	('Tilde & Tamarind', ARRAY['melodic techno', 'progressive house'], 'berlin'),
	('Kasimir Low', ARRAY['minimal techno', 'dub techno'], 'berlin'),
	('Vesna Quarry', ARRAY['industrial techno', 'hard techno'], 'berlin'),
	('Halcyon Static', ARRAY['ambient', 'downtempo'], 'berlin'),
	('DJ Pomelo', ARRAY['tech house', 'deep house'], 'berlin'),
	('Ottilie Echo', ARRAY['techno', 'minimal techno'], 'berlin'),
	('Brass Kettle Sound', ARRAY['dub', 'dancehall'], 'berlin'),
	('Ruby Gantry', ARRAY['uk garage', 'grime'], 'london'),
	('Moss Signal', ARRAY['dubstep', 'jungle'], 'london'),
	('Penny Farthing Crew', ARRAY['jungle', 'footwork'], 'london'),
	('Lark Ellery', ARRAY['uk garage', 'r&b'], 'london'),
	('Coda Marsh', ARRAY['post-punk', 'indie rock'], 'london'),
	('Wren Telescope', ARRAY['shoegaze', 'dream pop'], 'london'),
	('Sable Junction', ARRAY['trap', 'grime'], 'london'),
	('Nova Marigold', ARRAY['synthwave', 'minimal'], 'london'),
	('Tamsin Okra', ARRAY['afro house', 'amapiano'], 'amsterdam'),
	('Dirk Lantaarn', ARRAY['techno', 'hard techno'], 'amsterdam'),
	('Yara Mistral', ARRAY['deep house', 'afro house'], 'amsterdam'),
	('Basil Ferrous', ARRAY['acid techno', 'techno'], 'amsterdam'),
	('Cielo Banyan', ARRAY['reggaeton', 'salsa'], 'amsterdam'),
	('Nils Vapour', ARRAY['ambient', 'nu jazz'], 'amsterdam')
) AS a(name, genres, city);

-- ---------------------------------------------------------------------------
-- Club events: every city gets events on each day from 3 days ago to 21 days
-- ahead. event_id is stable ('dev-ber-001', ...) so users.interested_events
-- can point at it.
-- ---------------------------------------------------------------------------

WITH clubs(city, code, idx, club_name, club_address, lat, lng) AS (
	VALUES
		('berlin', 'ber', 0, 'Halle Nimbus', 'Fiktivstraße 101, 10997 Berlin', 52.501, 13.441),
		('berlin', 'ber', 1, 'Parallax Cellar', 'Beispielufer 7, 10179 Berlin', 52.512, 13.420),
		('berlin', 'ber', 2, 'Neon Heron', 'Musterplatz 2, 12043 Berlin', 52.481, 13.435),
		('berlin', 'ber', 3, 'Hollow Moon Club', 'Platzhalterweg 9, 10115 Berlin', 52.530, 13.385),
		('london', 'lon', 0, 'Basement Atlas', '12 Example Yard, London E2 0XX', 51.527, -0.072),
		('london', 'lon', 1, 'Velvet Pylon', '40 Sample Arches, London SE1 0XX', 51.501, -0.090),
		('london', 'lon', 2, 'Driftwood Hall', '3 Demo Wharf, London E14 0XX', 51.505, -0.020),
		('amsterdam', 'ams', 0, 'Lumen Tide', 'Voorbeeldkade 21, 1019 XX Amsterdam', 52.377, 4.930),
		('amsterdam', 'ams', 1, 'Ferro Garden', 'Testlaan 5, 1097 XX Amsterdam', 52.350, 4.920)
),
nights(n, night_name, genres, price, popularity) AS (
	VALUES
		(0, 'Subsurface', ARRAY['techno', 'dub techno', 'minimal techno'], '€15', '42'),
		(1, 'Acid Orchard', ARRAY['acid techno', 'hard techno'], '€18', '57'),
		(2, 'Velour', ARRAY['deep house', 'tech house', 'minimal'], '€12', '35'),
		(3, 'Two-Step Social', ARRAY['uk garage', 'grime', 'r&b'], '£10', '28'),
		(4, 'Bassline Almanac', ARRAY['dubstep', 'jungle', 'footwork'], '£12', '31'),
		(5, 'Sol Room', ARRAY['afro house', 'amapiano'], '€14', '46'),
		(6, 'Glasshouse', ARRAY['melodic techno', 'progressive house'], '€20', '63'),
		(7, 'Slow Bloom', ARRAY['ambient', 'downtempo', 'nu jazz'], '€8', '12'),
		(8, 'Night Shift Rock', ARRAY['post-punk', 'indie rock', 'shoegaze'], '£9', '19'),
		(9, 'Calor', ARRAY['reggaeton', 'salsa', 'dancehall'], '€10', '24')
),
days AS (
	SELECT d FROM generate_series(-3, 21) AS d
),
rows AS (
	SELECT
		c.city, c.code, c.club_name, c.club_address, c.lat, c.lng, d.d,
		(CURRENT_DATE + d.d) AS event_date,
		ni.night_name, ni.genres, ni.price, ni.popularity,
		row_number() OVER (PARTITION BY c.code ORDER BY d.d, c.idx) AS seq
	FROM clubs c
	CROSS JOIN days d
	JOIN nights ni ON ni.n = (abs(d.d) + c.idx * 3 + length(c.code)) % 10
)
INSERT INTO clubfindr.events
	(event_id, event_name, club_name, club_address, event_date, start_time, end_time,
	 event_genres, popularity, price, event_image, city, latitude, longitude, promoter_id)
SELECT
	'dev-' || code || '-' || lpad(seq::text, 3, '0'),
	night_name || ' at ' || club_name,
	club_name,
	club_address,
	event_date,
	'23:00',
	'06:00',
	genres,
	popularity,
	price,
	-- No flyer: the pages fall back to their own placeholder image
	NULL,
	city,
	lat,
	lng,
	-- The promoter runs the Parallax Cellar nights in Berlin
	CASE WHEN club_name = 'Parallax Cellar'
		THEN '00000000-0000-4000-8000-000000000002'::uuid END
FROM rows;

-- A fixed date for tests that must not depend on when the seed was loaded: four Berlin
-- nights on 2031-06-21 (far enough ahead never to collide with the relative ones above).
-- tests/taste.spec.ts opens /clubs?date=2031-06-21: the fan's profile reaches Velour and
-- Glasshouse but not Calor or Night Shift Rock.
INSERT INTO clubfindr.events
	(event_id, event_name, club_name, club_address, event_date, start_time, end_time,
	 event_genres, popularity, price, event_image, city, latitude, longitude)
VALUES
	('dev-ber-pinned-1', 'Velour at Hollow Moon Club', 'Hollow Moon Club', 'Platzhalterweg 9, 10115 Berlin',
	 DATE '2031-06-21', '23:00', '06:00', ARRAY['deep house', 'tech house', 'minimal'], '35', '€12',
	 NULL, 'berlin', 52.530, 13.385),
	('dev-ber-pinned-2', 'Glasshouse at Parallax Cellar', 'Parallax Cellar', 'Beispielufer 7, 10179 Berlin',
	 DATE '2031-06-21', '23:00', '06:00', ARRAY['melodic techno', 'progressive house'], '63', '€20',
	 NULL, 'berlin', 52.512, 13.420),
	('dev-ber-pinned-3', 'Calor at Neon Heron', 'Neon Heron', 'Musterplatz 2, 12043 Berlin',
	 DATE '2031-06-21', '23:00', '06:00', ARRAY['reggaeton', 'salsa', 'dancehall'], '24', '€10',
	 NULL, 'berlin', 52.481, 13.435),
	('dev-ber-pinned-4', 'Night Shift Rock at Halle Nimbus', 'Halle Nimbus', 'Fiktivstraße 101, 10997 Berlin',
	 DATE '2031-06-21', '23:00', '06:00', ARRAY['post-punk', 'indie rock', 'shoegaze'], '19', '£9',
	 NULL, 'berlin', 52.501, 13.441);

-- Line-ups: two or three artists from the event's city per event
INSERT INTO clubfindr.event_artists (event_id, artist_id, city)
SELECT e.id, a.id, e.city
FROM clubfindr.events e
JOIN LATERAL (
	SELECT ar.id
	FROM clubfindr.artists ar
	WHERE ar.primary_city = e.city
	ORDER BY md5(e.event_id || ar.artist_name)
	LIMIT 2 + (abs(hashtext(e.event_id)) % 2)
) a ON true;

-- Promoter's own bar night, shown on /promoter-home through the bars it owns
INSERT INTO clubfindr.bar_events (bar_id, event_date, theme_name, description, start_time, end_time, special_genres)
VALUES ('00000000-0000-4000-8000-0000000000b2', CURRENT_DATE + 7, 'Orchard All-Nighter',
	'Promoter-run courtyard all-nighter.', '22:00', '06:00', ARRAY['techno', 'acid techno']);

-- spotify_apps is left empty on purpose: with no client credentials the app
-- skips the Spotify OAuth redirect instead of sending testers to a broken
-- Spotify login page.

COMMIT;
