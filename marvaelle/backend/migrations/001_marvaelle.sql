-- Additive migration for the existing Marvaelle database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  dob TEXT,
  country TEXT,
  google_id TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_stock (
  product_id TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id),
  total_amount BIGINT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Confirmed',
  address_line1 TEXT,
  city TEXT,
  pincode TEXT,
  phone TEXT,
  tracking_status TEXT NOT NULL DEFAULT 'Processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_purchase BIGINT NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'Processing';

-- Seed stock only when the row is absent. Existing stock is never overwritten.
INSERT INTO product_stock(product_id,quantity) VALUES
('7',5),('10',3),('9',4),('11',8),('6',6),('5',12),('5-w',12)
ON CONFLICT(product_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
