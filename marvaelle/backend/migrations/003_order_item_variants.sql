-- Preserve the size and colour selected by the customer on each order line.
-- Safe to apply to existing databases; old orders remain valid and may have NULL variants.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color TEXT;
