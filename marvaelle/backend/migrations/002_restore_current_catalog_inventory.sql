-- ONE-TIME recovery migration for the current Marvaelle collection.
-- Run this exactly once if previously-existing product_stock rows were left at zero
-- and the shop should be restored to the initial inventory listed in src/data.js.
-- Do NOT rerun after real sales: this intentionally resets quantities to launch stock.
INSERT INTO product_stock (product_id, quantity) VALUES
  ('7', 5),
  ('10', 3),
  ('9', 4),
  ('11', 8),
  ('6', 6),
  ('5-w', 12)
ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity;
