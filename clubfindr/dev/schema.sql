--
-- PostgreSQL database dump
--

\restrict pWxowDGBd4vcxWPxSXNRoFngPuqjHqHe7SKNWqsXFLPC22T3V4lp001vSlau5K1

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: clubfindr; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA clubfindr;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: artists; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.artists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    artist_name character varying(150) NOT NULL,
    spotify_uri character varying(255),
    soundcloud_link character varying(255),
    bandcamp_link character varying(255),
    facebook_link character varying(255),
    instagram_link character varying(255),
    ra_link character varying(255),
    genres text[],
    email text,
    website text,
    primary_city character varying(100) NOT NULL
);


--
-- Name: bar_events; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bar_id uuid NOT NULL,
    event_date date NOT NULL,
    theme_name character varying(255) NOT NULL,
    description text,
    start_time time without time zone,
    end_time time without time zone,
    recurring boolean DEFAULT false,
    recurrence_pattern character varying(50),
    special_genres text[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bar_genre_aggregates; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bar_genre_aggregates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bar_id uuid NOT NULL,
    genre character varying NOT NULL,
    weight double precision NOT NULL,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bar_genre_profiles; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bar_genre_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bar_id uuid NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    current_track_id character varying,
    current_track_name character varying,
    current_genres jsonb,
    rolling_genre_profile jsonb,
    immediate_genre_profile jsonb,
    track_counts jsonb
);


--
-- Name: bar_music_profiles; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bar_music_profiles (
    id uuid NOT NULL,
    bar_id uuid NOT NULL,
    current_artist character varying(255),
    current_track character varying(255),
    is_active boolean,
    last_updated timestamp with time zone,
    genre text,
    music_style text
);


--
-- Name: bar_promoters; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bar_promoters (
    bar_id uuid NOT NULL,
    promoter_id uuid NOT NULL
);


--
-- Name: bar_qr_codes; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bar_qr_codes (
    id integer NOT NULL,
    bar_id uuid NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bar_qr_codes_id_seq; Type: SEQUENCE; Schema: clubfindr; Owner: -
--

CREATE SEQUENCE clubfindr.bar_qr_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bar_qr_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: clubfindr; Owner: -
--

ALTER SEQUENCE clubfindr.bar_qr_codes_id_seq OWNED BY clubfindr.bar_qr_codes.id;


--
-- Name: bar_sessions; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bar_sessions (
    session_id uuid NOT NULL,
    bar_id uuid NOT NULL,
    last_accessed timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    platform character varying(50),
    version character varying(50),
    is_mobile boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bars; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.bars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name character varying(255) NOT NULL,
    contact_person character varying(255) NOT NULL,
    general_email character varying(255) NOT NULL,
    phone character varying(20),
    address text,
    postcode character varying(20),
    website character varying(255),
    music_service character varying(50),
    spotify_access_token character varying(1024),
    spotify_refresh_token character varying(1024),
    apple_music_access_token character varying(255),
    apple_music_refresh_token character varying(255),
    deezer_access_token character varying(255),
    deezer_refresh_token character varying(255),
    city character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    confirmation_code character varying(10),
    confirmed boolean DEFAULT false,
    resend_attempts integer DEFAULT 0,
    expires_at timestamp without time zone,
    password_hash character varying(255),
    spotify_app_name character varying(255),
    spotify_email character varying(255),
    spotify_id character varying(255),
    spotify_connected boolean DEFAULT false,
    description text,
    opening_hours character varying(255),
    closing_hours character varying(255),
    smoking_allowed boolean DEFAULT false NOT NULL,
    bar_types text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: event_artists; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.event_artists (
    event_id uuid NOT NULL,
    artist_id uuid NOT NULL,
    city character varying(100) NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying(50),
    event_name character varying(256) NOT NULL,
    club_name character varying(256),
    club_address character varying(300),
    event_date date,
    start_time time without time zone,
    end_time time without time zone,
    event_genres text[],
    popularity character varying(6),
    price character varying(30),
    event_image character varying(256),
    city character varying(100) NOT NULL,
    promoter_id uuid,
    track_ids jsonb DEFAULT '[]'::jsonb,
    bar_id uuid,
    latitude double precision,
    longitude double precision
);


--
-- Name: oauth_states; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.oauth_states (
    key text NOT NULL,
    state_data text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);


--
-- Name: promoters; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.promoters (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: promotion_requests; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.promotion_requests (
    id integer NOT NULL,
    bar_id uuid NOT NULL,
    qr_id integer NOT NULL,
    request_type character varying(50) NOT NULL,
    qr_value text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    processed_at timestamp without time zone
);


--
-- Name: promotion_requests_id_seq; Type: SEQUENCE; Schema: clubfindr; Owner: -
--

CREATE SEQUENCE clubfindr.promotion_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotion_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: clubfindr; Owner: -
--

ALTER SEQUENCE clubfindr.promotion_requests_id_seq OWNED BY clubfindr.promotion_requests.id;


--
-- Name: spotify_apps; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.spotify_apps (
    id integer NOT NULL,
    app_name character varying(255) NOT NULL,
    client_id character varying(255) NOT NULL,
    client_secret character varying(255) NOT NULL,
    user_count integer DEFAULT 0,
    is_active boolean DEFAULT false,
    created_at timestamp without time zone NOT NULL,
    app_type character varying(50) DEFAULT 'user'::character varying,
    app_id character varying(32)
);


--
-- Name: spotify_apps_id_seq; Type: SEQUENCE; Schema: clubfindr; Owner: -
--

CREATE SEQUENCE clubfindr.spotify_apps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spotify_apps_id_seq; Type: SEQUENCE OWNED BY; Schema: clubfindr; Owner: -
--

ALTER SEQUENCE clubfindr.spotify_apps_id_seq OWNED BY clubfindr.spotify_apps.id;


--
-- Name: spotify_task_log; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.spotify_task_log (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    task_name character varying(255) NOT NULL,
    entity_type character varying(50),
    entity_id uuid,
    status character varying(50),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    result jsonb,
    error text,
    retries integer DEFAULT 0
);


--
-- Name: spotify_task_log_id_seq; Type: SEQUENCE; Schema: clubfindr; Owner: -
--

CREATE SEQUENCE clubfindr.spotify_task_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spotify_task_log_id_seq; Type: SEQUENCE OWNED BY; Schema: clubfindr; Owner: -
--

ALTER SEQUENCE clubfindr.spotify_task_log_id_seq OWNED BY clubfindr.spotify_task_log.id;


--
-- Name: taste_artists; Type: TABLE; Schema: clubfindr; Owner: -
-- (not in the production dump this file was taken from; see migrations/20261017_add_taste_artists.sql)
--

CREATE TABLE clubfindr.taste_artists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    source_id text NOT NULL,
    name text NOT NULL,
    genres text[] DEFAULT '{}'::text[] NOT NULL,
    image_url text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT taste_artists_source_check CHECK ((source = ANY (ARRAY['spotify'::text, 'lastfm'::text])))
);


--
-- Name: user_checkins; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.user_checkins (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    bar_id uuid NOT NULL,
    qr_code_id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_checkins_id_seq; Type: SEQUENCE; Schema: clubfindr; Owner: -
--

CREATE SEQUENCE clubfindr.user_checkins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: clubfindr; Owner: -
--

ALTER SEQUENCE clubfindr.user_checkins_id_seq OWNED BY clubfindr.user_checkins.id;


--
-- Name: user_favourite_artists; Type: TABLE; Schema: clubfindr; Owner: -
-- (not in the production dump this file was taken from; see migrations/20261017_add_taste_artists.sql)
--

CREATE TABLE clubfindr.user_favourite_artists (
    user_id uuid NOT NULL,
    artist_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_sessions; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id uuid NOT NULL,
    genres text[],
    access_token character varying(1000),
    refresh_token character varying(1000),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_accessed timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_city character varying(100),
    spotify_user_id character varying(100),
    spotify_email character varying(150),
    spotify_username character varying(150),
    spotify_app_id integer
);


--
-- Name: password_resets; Type: TABLE; Schema: clubfindr; Owner: -
-- (not in the production dump this file was taken from; see migrations/20261012_add_password_resets.sql)
--

CREATE TABLE clubfindr.password_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    reset_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    general_email character varying(255) NOT NULL,
    spotify_email character varying(255),
    apple_music_email character varying(255),
    deezer_email character varying(255),
    spotify_user_id character varying(255),
    apple_music_user_id character varying(255),
    deezer_user_id character varying(255),
    password_hash text NOT NULL,
    name character varying(255),
    role character varying(50),
    city character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    preferences jsonb DEFAULT '[]'::jsonb,
    cookie_preferences jsonb,
    confirmation_code character varying(10),
    confirmed boolean DEFAULT false,
    resend_attempts integer DEFAULT 0,
    expires_at timestamp with time zone,
    access_token character varying(1000),
    refresh_token character varying(1000),
    interested_events text[],
    google_id character varying(255),
    facebook_id character varying(255),
    is_promoter boolean DEFAULT false,
    spotify_app_name character varying(255),
    is_first_time boolean DEFAULT false,
    onboarding_complete boolean DEFAULT false
);


--
-- Name: venues; Type: TABLE; Schema: clubfindr; Owner: -
--

CREATE TABLE clubfindr.venues (
    id integer NOT NULL,
    venue_id character varying(50),
    name character varying(255) NOT NULL,
    address text,
    city character varying(100) NOT NULL,
    latitude numeric(10,8),
    longitude numeric(11,8),
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: venues_id_seq; Type: SEQUENCE; Schema: clubfindr; Owner: -
--

CREATE SEQUENCE clubfindr.venues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venues_id_seq; Type: SEQUENCE OWNED BY; Schema: clubfindr; Owner: -
--

ALTER SEQUENCE clubfindr.venues_id_seq OWNED BY clubfindr.venues.id;


--
-- Name: bar_qr_codes id; Type: DEFAULT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_qr_codes ALTER COLUMN id SET DEFAULT nextval('clubfindr.bar_qr_codes_id_seq'::regclass);


--
-- Name: promotion_requests id; Type: DEFAULT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.promotion_requests ALTER COLUMN id SET DEFAULT nextval('clubfindr.promotion_requests_id_seq'::regclass);


--
-- Name: spotify_apps id; Type: DEFAULT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.spotify_apps ALTER COLUMN id SET DEFAULT nextval('clubfindr.spotify_apps_id_seq'::regclass);


--
-- Name: spotify_task_log id; Type: DEFAULT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.spotify_task_log ALTER COLUMN id SET DEFAULT nextval('clubfindr.spotify_task_log_id_seq'::regclass);


--
-- Name: user_checkins id; Type: DEFAULT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_checkins ALTER COLUMN id SET DEFAULT nextval('clubfindr.user_checkins_id_seq'::regclass);


--
-- Name: venues id; Type: DEFAULT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.venues ALTER COLUMN id SET DEFAULT nextval('clubfindr.venues_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: artists artists_artist_name_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.artists
    ADD CONSTRAINT artists_artist_name_key UNIQUE (artist_name);


--
-- Name: artists artists_email_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.artists
    ADD CONSTRAINT artists_email_key UNIQUE (email);


--
-- Name: artists artists_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.artists
    ADD CONSTRAINT artists_pkey PRIMARY KEY (id);


--
-- Name: bar_events bar_events_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_events
    ADD CONSTRAINT bar_events_pkey PRIMARY KEY (id);


--
-- Name: bar_music_profiles bar_music_profiles_bar_id_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_music_profiles
    ADD CONSTRAINT bar_music_profiles_bar_id_key UNIQUE (bar_id);


--
-- Name: bar_music_profiles bar_music_profiles_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_music_profiles
    ADD CONSTRAINT bar_music_profiles_pkey PRIMARY KEY (id);


--
-- Name: bar_promoters bar_promoters_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_promoters
    ADD CONSTRAINT bar_promoters_pkey PRIMARY KEY (bar_id, promoter_id);


--
-- Name: bar_qr_codes bar_qr_codes_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_qr_codes
    ADD CONSTRAINT bar_qr_codes_pkey PRIMARY KEY (id);


--
-- Name: bar_sessions bar_sessions_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_sessions
    ADD CONSTRAINT bar_sessions_pkey PRIMARY KEY (session_id);


--
-- Name: bars bars_general_email_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bars
    ADD CONSTRAINT bars_general_email_key UNIQUE (general_email);


--
-- Name: bars bars_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bars
    ADD CONSTRAINT bars_pkey PRIMARY KEY (id);


--
-- Name: bar_genre_aggregates clubfindr.bar_genre_aggregates_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_genre_aggregates
    ADD CONSTRAINT "clubfindr.bar_genre_aggregates_pkey" PRIMARY KEY (id);


--
-- Name: bar_genre_profiles clubfindr.bar_genre_profiles_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_genre_profiles
    ADD CONSTRAINT "clubfindr.bar_genre_profiles_pkey" PRIMARY KEY (id);


--
-- Name: event_artists event_artists_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.event_artists
    ADD CONSTRAINT event_artists_pkey PRIMARY KEY (event_id, artist_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: oauth_states oauth_states_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.oauth_states
    ADD CONSTRAINT oauth_states_pkey PRIMARY KEY (key);


--
-- Name: promoters promoters_email_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.promoters
    ADD CONSTRAINT promoters_email_key UNIQUE (email);


--
-- Name: promoters promoters_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.promoters
    ADD CONSTRAINT promoters_pkey PRIMARY KEY (id);


--
-- Name: promotion_requests promotion_requests_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.promotion_requests
    ADD CONSTRAINT promotion_requests_pkey PRIMARY KEY (id);


--
-- Name: spotify_apps spotify_apps_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.spotify_apps
    ADD CONSTRAINT spotify_apps_pkey PRIMARY KEY (id);


--
-- Name: spotify_task_log spotify_task_log_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.spotify_task_log
    ADD CONSTRAINT spotify_task_log_pkey PRIMARY KEY (id);


--
-- Name: spotify_task_log spotify_task_log_task_id_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.spotify_task_log
    ADD CONSTRAINT spotify_task_log_task_id_key UNIQUE (task_id);


--
-- Name: artists unique_artist_city; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.artists
    ADD CONSTRAINT unique_artist_city UNIQUE (artist_name, primary_city);


--
-- Name: events unique_event_id_date; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.events
    ADD CONSTRAINT unique_event_id_date UNIQUE (event_id, event_date);


--
-- Name: taste_artists taste_artists_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.taste_artists
    ADD CONSTRAINT taste_artists_pkey PRIMARY KEY (id);


--
-- Name: taste_artists taste_artists_source_source_id_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.taste_artists
    ADD CONSTRAINT taste_artists_source_source_id_key UNIQUE (source, source_id);


--
-- Name: user_favourite_artists user_favourite_artists_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_favourite_artists
    ADD CONSTRAINT user_favourite_artists_pkey PRIMARY KEY (user_id, artist_id);


--
-- Name: user_sessions unique_user_id; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_sessions
    ADD CONSTRAINT unique_user_id UNIQUE (user_id);


--
-- Name: user_checkins user_checkins_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_checkins
    ADD CONSTRAINT user_checkins_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_user_id_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.password_resets
    ADD CONSTRAINT password_resets_user_id_key UNIQUE (user_id);



--
-- Name: users users_apple_music_email_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_apple_music_email_key UNIQUE (apple_music_email);


--
-- Name: users users_apple_music_user_id_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_apple_music_user_id_key UNIQUE (apple_music_user_id);


--
-- Name: users users_deezer_email_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_deezer_email_key UNIQUE (deezer_email);


--
-- Name: users users_deezer_user_id_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_deezer_user_id_key UNIQUE (deezer_user_id);


--
-- Name: users users_general_email_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_general_email_key UNIQUE (general_email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_spotify_email_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_spotify_email_key UNIQUE (spotify_email);


--
-- Name: users users_spotify_user_id_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.users
    ADD CONSTRAINT users_spotify_user_id_key UNIQUE (spotify_user_id);


--
-- Name: venues venues_name_city_key; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.venues
    ADD CONSTRAINT venues_name_city_key UNIQUE (name, city);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: idx_artist_email; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_artist_email ON clubfindr.artists USING btree (email);


--
-- Name: idx_artist_name; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_artist_name ON clubfindr.artists USING btree (artist_name);


--
-- Name: idx_bar_events_bar_date; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_bar_events_bar_date ON clubfindr.bar_events USING btree (bar_id, event_date);


--
-- Name: idx_bar_genre_aggregates_bar_id_genre; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE UNIQUE INDEX idx_bar_genre_aggregates_bar_id_genre ON clubfindr.bar_genre_aggregates USING btree (bar_id, genre);


--
-- Name: idx_bar_genre_profiles_bar_id_timestamp; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_bar_genre_profiles_bar_id_timestamp ON clubfindr.bar_genre_profiles USING btree (bar_id, "timestamp");


--
-- Name: idx_bar_sessions_bar_id; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_bar_sessions_bar_id ON clubfindr.bar_sessions USING btree (bar_id);


--
-- Name: idx_bar_sessions_last_accessed; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_bar_sessions_last_accessed ON clubfindr.bar_sessions USING btree (last_accessed);


--
-- Name: idx_bars_bar_types; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_bars_bar_types ON clubfindr.bars USING gin (bar_types);


--
-- Name: idx_bars_smoking_allowed; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_bars_smoking_allowed ON clubfindr.bars USING btree (smoking_allowed);


--
-- Name: idx_event_artist_artist_id; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_event_artist_artist_id ON clubfindr.event_artists USING btree (artist_id);


--
-- Name: idx_event_artist_event_id; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_event_artist_event_id ON clubfindr.event_artists USING btree (event_id);


--
-- Name: idx_events_promoter_id; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_events_promoter_id ON clubfindr.events USING btree (promoter_id);


--
-- Name: idx_spotify_task_entity; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_spotify_task_entity ON clubfindr.spotify_task_log USING btree (entity_type, entity_id);


--
-- Name: idx_spotify_task_status; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_spotify_task_status ON clubfindr.spotify_task_log USING btree (status);


--
-- Name: idx_user_favourite_artists_artist_id; Type: INDEX; Schema: clubfindr; Owner: -
--

CREATE INDEX idx_user_favourite_artists_artist_id ON clubfindr.user_favourite_artists USING btree (artist_id);


--
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES clubfindr.users(id) ON DELETE CASCADE;


--
-- Name: bar_events bar_events_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_events
    ADD CONSTRAINT bar_events_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON DELETE CASCADE;


--
-- Name: bar_music_profiles bar_music_profiles_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_music_profiles
    ADD CONSTRAINT bar_music_profiles_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bar_promoters bar_promoters_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_promoters
    ADD CONSTRAINT bar_promoters_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id);


--
-- Name: bar_promoters bar_promoters_promoter_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_promoters
    ADD CONSTRAINT bar_promoters_promoter_id_fkey FOREIGN KEY (promoter_id) REFERENCES clubfindr.promoters(id);


--
-- Name: bar_qr_codes bar_qr_codes_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_qr_codes
    ADD CONSTRAINT bar_qr_codes_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON DELETE CASCADE;


--
-- Name: bar_sessions bar_sessions_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_sessions
    ADD CONSTRAINT bar_sessions_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON DELETE CASCADE;


--
-- Name: bars bars_user_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bars
    ADD CONSTRAINT bars_user_id_fkey FOREIGN KEY (user_id) REFERENCES clubfindr.users(id) ON DELETE SET NULL;


--
-- Name: bar_genre_aggregates clubfindr.bar_genre_aggregates_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_genre_aggregates
    ADD CONSTRAINT "clubfindr.bar_genre_aggregates_bar_id_fkey" FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON DELETE CASCADE;


--
-- Name: bar_genre_profiles clubfindr.bar_genre_profiles_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.bar_genre_profiles
    ADD CONSTRAINT "clubfindr.bar_genre_profiles_bar_id_fkey" FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON DELETE CASCADE;


--
-- Name: event_artists event_artists_artist_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.event_artists
    ADD CONSTRAINT event_artists_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES clubfindr.artists(id) ON DELETE CASCADE;


--
-- Name: events events_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.events
    ADD CONSTRAINT events_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id);


--
-- Name: events events_promoter_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.events
    ADD CONSTRAINT events_promoter_id_fkey FOREIGN KEY (promoter_id) REFERENCES clubfindr.promoters(id);


--
-- Name: promotion_requests promotion_requests_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.promotion_requests
    ADD CONSTRAINT promotion_requests_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON DELETE CASCADE;


--
-- Name: promotion_requests promotion_requests_qr_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.promotion_requests
    ADD CONSTRAINT promotion_requests_qr_id_fkey FOREIGN KEY (qr_id) REFERENCES clubfindr.bar_qr_codes(id) ON DELETE CASCADE;


--
-- Name: user_checkins user_checkins_bar_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_checkins
    ADD CONSTRAINT user_checkins_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES clubfindr.bars(id) ON DELETE CASCADE;


--
-- Name: user_checkins user_checkins_qr_code_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_checkins
    ADD CONSTRAINT user_checkins_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES clubfindr.bar_qr_codes(id) ON DELETE SET NULL;


--
-- Name: user_checkins user_checkins_user_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_checkins
    ADD CONSTRAINT user_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES clubfindr.users(id) ON DELETE CASCADE;


--
-- Name: user_favourite_artists user_favourite_artists_artist_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_favourite_artists
    ADD CONSTRAINT user_favourite_artists_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES clubfindr.taste_artists(id) ON DELETE CASCADE;


--
-- Name: user_favourite_artists user_favourite_artists_user_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_favourite_artists
    ADD CONSTRAINT user_favourite_artists_user_id_fkey FOREIGN KEY (user_id) REFERENCES clubfindr.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: clubfindr; Owner: -
--

ALTER TABLE ONLY clubfindr.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES clubfindr.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict pWxowDGBd4vcxWPxSXNRoFngPuqjHqHe7SKNWqsXFLPC22T3V4lp001vSlau5K1

