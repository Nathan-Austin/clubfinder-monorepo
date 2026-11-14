-- An event_id for every event that has none.
--
-- events.event_id is the key PATCH/DELETE /promoter-home/events/[eventId] look an event up by
-- (the scrapers fill it with the source's id). It has no default, and the promoter dashboard's
-- INSERT never set it, so no event created there could be edited or removed through those
-- routes (KNOWN_ISSUES 63). The dashboard sets a random uuid on creation now; this gives the
-- events created before one as well. The column is varchar(50); a uuid is 36 characters.
--
-- Idempotent, like the other files in migrations/.

UPDATE clubfindr.events
   SET event_id = gen_random_uuid()::text
 WHERE event_id IS NULL;
