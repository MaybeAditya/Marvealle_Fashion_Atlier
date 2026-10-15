# Marvaelle Express backend deployment

## Vercel configuration

This service is a Node.js + Express API. When deploying the backend folder as a standalone repository, set the Vercel Root Directory to `.`. If it lives inside a monorepo with the frontend, set the Root Directory to `backend` (the directory containing this `package.json`).

- Framework/runtime: Node.js / Express
- Install command: `npm install`
- Build command: no separate build required
- Start command for a normal Node host: `npm start`
- Syntax check: `npm run check`

The entry point is `src/index.js`, which default-exports the Express app for Vercel's Express detection. Do not deploy an old Rust/Axum entry point or rewrite configuration over this Node backend.

## Environment variables

Set these as backend runtime variables in Vercel (or in `.env` for local development):

- `DATABASE_URL`: PostgreSQL connection string for the live store database.
- `JWT_SECRET`: strong random secret (at least 16 non-whitespace characters in this app).
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: matching server-side Razorpay credentials. Use test credentials while testing. Keep the secret on the backend only.

**Troubleshooting `POST /api/orders/create` returning 503 `Payments are not configured on the backend`:** this response means the deployed backend process cannot read one or both of `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. In the Vercel project that deploys the backend (not the frontend), add both variables using matching credentials from Razorpay Dashboard → Account & Settings → API Keys. For demo/test checkout, use a test Key ID (`rzp_test_…`) and its matching test Key Secret. Ensure the variables apply to the Production environment (or the Preview environment if testing a preview deployment), then redeploy the backend. Separately set `VITE_RAZORPAY_KEY_ID` in the frontend Vercel project to the exact same Key ID and redeploy the frontend. Never put the secret in a `VITE_*` variable. Verify `GET /api/health` reports `payments_configured: true` before trying checkout again.
- `GOOGLE_CLIENT_ID`: the Google **Web application** OAuth Client ID. The frontend reads this public ID from `GET /api/auth/google/config`, so you do not need a separate `VITE_GOOGLE_CLIENT_ID`. In Google Cloud Console, authorize the exact storefront origins under Authorized JavaScript origins, including `https://marvealle.vercel.app` if that is the deployed storefront. After changing this variable, redeploy the backend and reload the storefront. The backend still validates the token audience against this ID; do not disable audience validation.

The repository includes `.env.example` with placeholders only. Copy it to `.env` for local use and replace the placeholder values. Never commit a real `.env` file or production secrets.

## Database migrations

Apply `migrations/001_marvaelle.sql` once to the exact PostgreSQL database specified in `DATABASE_URL` if the schema has not already been created. The API does not execute migrations automatically on startup.

If the current catalogue's stock rows already exist with quantity zero and those items should be restored to their initial launch quantities, run `migrations/002_restore_current_catalog_inventory.sql` exactly once against that same database. It resets quantities for IDs `7`, `10`, `9`, `11`, `6`, and `5-w` to the initial quantities in the frontend catalogue. Do **not** rerun it after real sales because it would restock sold items.

## Verify the API

1. Open `https://YOUR-BACKEND-DOMAIN/`. It should return JSON identifying the service.
2. Open `https://YOUR-BACKEND-DOMAIN/api/health`. For a healthy deployment, `database` and `jwt_configured` must be `true`; `payments_configured` must be `true` to use Razorpay.
3. Open `https://YOUR-BACKEND-DOMAIN/api/products`. Confirm the current product IDs have the expected quantities.
4. Run `npm run check` after code changes and inspect Vercel Function Logs if a route responds with a 500.

## Checkout/payment flow

The frontend calls `POST /api/orders/create`. The backend calculates prices in paise from its allowlisted product-price map, verifies inventory, and creates the Razorpay order using server-side credentials. After Checkout returns its payment ID, order ID, and signature, the frontend calls `POST /api/orders/confirm`; the backend validates the signature and checks the Razorpay payment/order/amount before creating the database order and decrementing stock transactionally.

Run the browser checkout checklist in the frontend's `CHECKOUT_TESTING.md` using Razorpay **test** keys first. The frontend `VITE_RAZORPAY_KEY_ID` and backend `RAZORPAY_KEY_ID` must match. A real end-to-end payment test also requires a reachable database, correctly configured environment variables, and an actual deployed backend; static source checks cannot verify those credentials.


### Order variant migration

Apply `migrations/003_order_item_variants.sql` to the production database before deploying the release that stores selected size and colour on order items. This migration only adds nullable columns and keeps existing orders intact.

### Newsletter subscriber migration

Apply `migrations/004_newsletter_subscribers.sql` to the same PostgreSQL database configured by `DATABASE_URL` before enabling the footer signup form. This creates a separate table for normalized email opt-ins and does not modify users, orders, or inventory. The signup endpoint stores addresses for future campaign use; outbound newsletter delivery is not configured by this application and requires a mailing provider to be connected separately.
