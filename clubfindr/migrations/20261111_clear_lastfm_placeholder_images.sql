-- Clear the Last.fm placeholder image from artists imported before it was recognised
-- (KNOWN_ISSUES 21).
--
-- Last.fm stopped serving artist images in 2019 and sends the same grey star for every artist,
-- at every size. The import stored it as the artist's own picture, so every artist imported
-- from Last.fm shows the identical placeholder. `pickImage` ($lib/taste/lastfm) now skips it,
-- but a taste_artists row keeps the image it was created with: only rows written before that
-- fix carry the star, and nothing else would ever clear them.
--
-- Matched by the image hash, since the URL differs by size (34s, 64s, 174s, 300x300) and by
-- CDN host over the years. Nothing else can legitimately carry that hash. Artists whose
-- picture came from Spotify are untouched: those URLs are i.scdn.co and carry no such hash.
--
-- Data only, so dev/schema.sql needs no counterpart. Idempotent: a second run matches nothing,
-- because the first set those rows to NULL.

UPDATE clubfindr.taste_artists
   SET image_url = NULL
 WHERE image_url LIKE '%2a96cbd8b46e442fc41c2b86b821562f%';
