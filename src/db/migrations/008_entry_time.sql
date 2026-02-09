ALTER TABLE food_entries ADD COLUMN entry_time TEXT;
UPDATE food_entries
SET entry_time = substr(created_at, 12, 5)
WHERE entry_time IS NULL AND created_at IS NOT NULL;
