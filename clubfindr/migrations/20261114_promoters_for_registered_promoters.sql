-- A promoters row for every promoter account that has none.
--
-- events.promoter_id references promoters(id), and /promoter-home keys a promoter's events by
-- their users.id, so a promoter needs a promoters row with the same id as their users row (the
-- seed gives the seeded promoter both). /register/promoter wrote the user and the venue but never
-- that row, so a promoter registered through the form could not create an event: the INSERT
-- failed on the foreign key and the dashboard answered 500 (KNOWN_ISSUES 61). Registration writes
-- the row itself now; this backfills the accounts registered before.
--
-- The name is the user's name, else their venue's name, else the e-mail (promoters.name is NOT
-- NULL and the registration form stores no person name on the user). ON CONFLICT DO NOTHING
-- covers both constraints: an id that already has a row, and an e-mail already used by another
-- promoters row (promoters.email is unique).
--
-- Idempotent, like the other files in migrations/.

INSERT INTO clubfindr.promoters (id, name, email)
SELECT u.id,
       COALESCE(NULLIF(u.name, ''), v.name, u.general_email),
       u.general_email
  FROM clubfindr.users u
  LEFT JOIN LATERAL (
         SELECT b.name FROM clubfindr.bars b WHERE b.user_id = u.id ORDER BY b.created_at LIMIT 1
       ) v ON true
 WHERE u.is_promoter = true
   AND NOT EXISTS (SELECT 1 FROM clubfindr.promoters p WHERE p.id = u.id)
ON CONFLICT DO NOTHING;
