-- ITH-076: masters — activate / deactivate only (no deletion), audit trail, ITSM lookup lists kept as master rows
ALTER TABLE masters ADD COLUMN IF NOT EXISTS parent text;                -- e.g. incident subcategory → its category
ALTER TABLE masters ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS status_reason text;          -- why it was last deactivated / activated
CREATE INDEX IF NOT EXISTS masters_category ON masters (category, is_active, sort_order);

-- masters are never deleted: refuse DELETE at the database too
CREATE OR REPLACE FUNCTION masters_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Master values cannot be deleted — deactivate them instead'; END $$;
DROP TRIGGER IF EXISTS masters_no_delete ON masters;
CREATE TRIGGER masters_no_delete BEFORE DELETE ON masters FOR EACH ROW EXECUTE FUNCTION masters_no_delete();
