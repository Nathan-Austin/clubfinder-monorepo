-- user_checkins.qr_code_id becomes nullable.
--
-- Its foreign key to bar_qr_codes is ON DELETE SET NULL, but the column was NOT NULL, so
-- deleting a QR code that had ever been scanned failed on the constraint and
-- DELETE /api/mobile/bars/:barId/qrcodes/:qrId answered 500 (found while fixing that route's
-- schema-less table names; docs/section4-inventory.md). The check-in itself stays, counted by
-- bar_id in the venue's figures; only the link to the deleted code is cleared.
--
-- Idempotent, like the other files in migrations/.

ALTER TABLE clubfindr.user_checkins ALTER COLUMN qr_code_id DROP NOT NULL;
