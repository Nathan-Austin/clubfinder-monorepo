ALTER TABLE clubfindr.bars
  ADD COLUMN IF NOT EXISTS smoking_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bar_types TEXT[] NOT NULL DEFAULT '{}';

-- Optional: Index for filtering
CREATE INDEX IF NOT EXISTS idx_bars_bar_types ON clubfindr.bars USING GIN (bar_types);
CREATE INDEX IF NOT EXISTS idx_bars_smoking_allowed ON clubfindr.bars (smoking_allowed);

