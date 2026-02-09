ALTER TABLE foods ADD COLUMN normalized_name TEXT;
ALTER TABLE foods ADD COLUMN source_detail TEXT DEFAULT 'seed';

UPDATE foods SET normalized_name = lower(trim(name)) WHERE normalized_name IS NULL OR normalized_name = '';
UPDATE foods SET source_detail = source WHERE source_detail IS NULL OR source_detail = '';

DELETE FROM foods
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM foods
  WHERE normalized_name IS NOT NULL AND normalized_name <> ''
  GROUP BY normalized_name
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_normalized_name ON foods(normalized_name);
