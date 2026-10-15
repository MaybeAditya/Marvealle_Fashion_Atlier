# Apply the live-inventory frontend fix

Replace your existing frontend repository files with the files in this archive. This ZIP is laid out with `package.json` and `src/` at its root.

Required Vercel environment variable: `VITE_API_BASE_URL` set to your live Express backend origin (for example, `https://marvaelle-backend.vercel.app`).

The storefront reads `GET /api/products`; each response key must match a product `id` in `src/data.js` and map to a non-negative quantity. Products missing from the stock response are treated as out of stock after the live response has loaded.

After replacing files, commit/push and redeploy the frontend so Vite embeds the environment variables and the updated code.


## Product archive vs stock

The storefront now uses an explicit `archived` flag in `src/data.js`. A live quantity of zero means **sold out**, not archived; current products remain discoverable and their detail pages remain accessible. Checkout is blocked for unavailable/archived items, and the backend continues to enforce inventory and server-side prices. If existing database stock rows are incorrectly zero, run the backend's `migrations/002_restore_current_catalog_inventory.sql` exactly once against the database configured by `DATABASE_URL`. This resets the current collection to the quantities shown in the catalog, so do not rerun it after taking orders.


### Product detail and order variants

For the corrected product-detail, cart, and checkout flow, deploy the matching frontend and backend bundles. Apply `backend/migrations/003_order_item_variants.sql` before the first production checkout with the updated backend, so the customer's chosen size and colour can be stored on order items. This migration is additive and safe for existing orders.
