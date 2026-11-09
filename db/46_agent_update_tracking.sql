-- ITH-106: see when a device downloaded an agent update that it did not apply
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS update_fetched_at timestamptz;
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS update_fetched_version text;
