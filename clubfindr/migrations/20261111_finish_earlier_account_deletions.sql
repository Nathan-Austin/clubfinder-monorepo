-- Finish the account deletions done before /api/delete-user-data was fixed (KNOWN_ISSUES 24).
--
-- Until 2026-11-11 "delete my data" cleared only the name and e-mail. Accounts deleted that way
-- still hold their Google and Facebook ids — which social sign-in looks an account up by, so
-- "Continue with Google" would sign the person straight back into the deleted account — plus
-- preferences, interested events, city, the Spotify app name, an unspent confirmation code,
-- their favourite artists, password reset tokens and live sessions. This brings those rows to
-- the state the fixed endpoint leaves behind.
--
-- Only rows the endpoint itself produced are touched: it replaced general_email with
-- `deleted-<ms>-<the row's own id>@example.com` and set password_hash to 'temp', and both must
-- hold, with the id in the address matching the row. No real account can look like that.
--
-- Deletes rows, so deploy/deploy.sh stops on it and prints it to be applied by hand, which is
-- intended for a one-off change to live personal data; it applies each file with
-- --single-transaction, so this has no BEGIN/COMMIT of its own. The users update runs last,
-- because the deletes find their rows by the password_hash and e-mail it leaves in place anyway.
-- Idempotent: a second run finds nothing left to clear. Data only, so dev/schema.sql needs no
-- counterpart.

DELETE FROM clubfindr.user_sessions
 WHERE user_id IN (SELECT id FROM clubfindr.users
                   WHERE password_hash = 'temp'
                     AND general_email ~ ('^deleted-[0-9]+-' || id::text || '@example\.com$'));

DELETE FROM clubfindr.user_favourite_artists
 WHERE user_id IN (SELECT id FROM clubfindr.users
                   WHERE password_hash = 'temp'
                     AND general_email ~ ('^deleted-[0-9]+-' || id::text || '@example\.com$'));

DELETE FROM clubfindr.password_resets
 WHERE user_id IN (SELECT id FROM clubfindr.users
                   WHERE password_hash = 'temp'
                     AND general_email ~ ('^deleted-[0-9]+-' || id::text || '@example\.com$'));

-- The Spotify columns are cleared only while they exist: 20261113_drop_spotify_connect.sql
-- drops them, and dev/schema.sql (which CI applies every migration to) no longer has them.
-- Before that change this was one UPDATE; on the old schema it does exactly the same.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'clubfindr' AND table_name = 'users'
                AND column_name = 'spotify_email') THEN
    EXECUTE $q$
      UPDATE clubfindr.users
         SET spotify_email = NULL,
             spotify_user_id = NULL,
             spotify_app_name = NULL,
             access_token = NULL,
             refresh_token = NULL
       WHERE password_hash = 'temp'
         AND general_email ~ ('^deleted-[0-9]+-' || id::text || '@example\.com$')
    $q$;
  END IF;
END
$$;

UPDATE clubfindr.users
   SET name = NULL,
       apple_music_email = NULL,
       deezer_email = NULL,
       apple_music_user_id = NULL,
       deezer_user_id = NULL,
       google_id = NULL,
       facebook_id = NULL,
       city = '',
       preferences = NULL,
       interested_events = NULL,
       confirmation_code = NULL,
       expires_at = NULL
 WHERE password_hash = 'temp'
   AND general_email ~ ('^deleted-[0-9]+-' || id::text || '@example\.com$');
