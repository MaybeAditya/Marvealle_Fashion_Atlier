# Marvaelle Express API

This replaces the previous Rust/Axum backend with a conventional Node.js + Express application. It preserves the API paths consumed by the existing React frontend and uses the existing PostgreSQL schema.

## Deploy on Vercel

1. Push the `frontend/` and `backend/` folders to the same repository (or deploy each folder from its own repository).
2. In the existing `marvaelle-backend` Vercel project, set **Root Directory** to `backend`.
3. Use Node.js (Vercel's Express detection is zero-config). Do not keep the old Rust `Cargo.toml`, `api/index.rs`, Rust `vercel.json` catch-all rewrite, or `src/lib.rs` in this backend root. This replacement bundle removes them.
4. Keep these environment variables on the backend project's Production environment:
   - `DATABASE_URL`: the same PostgreSQL database connection string as before.
   - `JWT_SECRET`: the same secret as before, or a new long random secret. If changed, existing login tokens will need to sign in again.
   - `GOOGLE_CLIENT_ID`: your Google OAuth **Web application** Client ID. The frontend loads the same public ID from `/api/auth/google/config`, eliminating the separate `VITE_GOOGLE_CLIENT_ID` setting.
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: server-side payment credentials.
5. Redeploy the backend after changing its Root Directory and code.
6. Test `https://YOUR-BACKEND-DOMAIN/` and `/api/health`. `/` should return JSON even if the database is down; `/api/health` reports the database/configuration status and uses a bounded database timeout.

The Express entry point is `src/index.js` and default-exports the app, which matches Vercel’s documented Express entry-point convention. Keep Vercel Root Directory set to the directory containing this `package.json`; no old Rust rewrite should remain. This revision removes the native `argon2` addon because a missing native binary can crash module initialization before any route handles a request. It uses `hash-wasm` (WebAssembly) for Argon2 password verification and hashing, while preserving Argon2 PHC-encoded hashes from the Rust service. The same app can run on a normal Node host using `npm start`.

## Local run

```bash
npm install
cp .env.example .env
# Set real values in .env; don't commit it.
npm start
```

The SQL schema migration is `migrations/001_marvaelle.sql`. Run it once against the database in `DATABASE_URL` if it has not already been applied. Do not apply it to a different database by mistake. If the current sellable collection is still at zero because old rows already existed, run `migrations/002_restore_current_catalog_inventory.sql` exactly once against that same database to restore the documented launch stock. Do not rerun migration 002 after real sales because it resets these quantities.

## API routes retained

- `GET /`, `GET /api/health`, `GET /api/products`
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/google`
- `GET /api/profile`, `GET /api/orders`, `GET /api/orders/:id`
- `POST /api/orders/create`, `POST /api/orders/confirm`
- `GET /api/admin/orders`, `POST /api/admin/orders/status`

Password login verifies existing Argon2 hashes created by the Rust backend and bcrypt hashes if present. Argon2 uses the pure WebAssembly `hash-wasm` package rather than a native Node addon, avoiding native-binary loading failures in serverless deployments. JWTs retain the `user_id` and `email` claims with HS256 and a seven-day expiry.

## Environment notes

- `VITE_*` values belong only in the frontend project. Never put `RAZORPAY_KEY_SECRET`, `DATABASE_URL`, or `JWT_SECRET` into a Vite variable.
- The backend does not automatically run migrations during cold start. This avoids running schema changes concurrently on multiple serverless instances.
- Health checks do not disclose database credentials; the server logs keep detailed errors while API responses return safe messages.


### Order variant migration

Apply `migrations/003_order_item_variants.sql` to the production database before deploying the release that stores selected size and colour on order items. This migration only adds nullable columns and keeps existing orders intact.
