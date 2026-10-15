# Marvaelle frontend deployment

## Vercel configuration

This is a Vite + React single-page app. When deploying this folder as a standalone frontend repository, set the Vercel Root Directory to `.`. If the frontend folder lives inside a monorepo containing both services, set the Root Directory to `frontend`.

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

`vercel.json` rewrites storefront routes to `index.html` so paths such as `/product/7`, `/cart`, `/checkout`, and `/search` work on refresh.

## Frontend environment variables

Set these in Vercel → Project Settings → Environment Variables, then redeploy:

- `VITE_API_BASE_URL`: the deployed Express backend origin only, for example `https://your-backend-project.vercel.app`. Do not include `/api` at the end.
- `VITE_RAZORPAY_KEY_ID`: the Razorpay Key ID. Use the matching test Key ID until test checkout passes.

Vite embeds `VITE_*` variables during the build, so updating them without redeploying does not update the site. Google sign-in obtains the public Web Client ID from `GET /api/auth/google/config`; there is deliberately no frontend Google Client ID variable to drift out of sync. Never put `RAZORPAY_KEY_SECRET`, `DATABASE_URL`, `JWT_SECRET`, or Google client secrets in the frontend environment.

## Backend and inventory prerequisites

The backend needs the environment variables and database migrations documented in the backend's `DEPLOYMENT.md`. Check `https://YOUR-BACKEND-DOMAIN/api/health` and `https://YOUR-BACKEND-DOMAIN/api/products` before testing checkout. The current catalogue contains six sellable products with IDs `7`, `10`, `9`, `11`, `6`, and `5-w`.

A quantity of zero is now shown as **sold out**, not **archived**. Explicit archive items are identified in `src/data.js`. If the database already contains zero-quantity rows for the current catalogue and you need to restore launch stock, run the backend's `migrations/002_restore_current_catalog_inventory.sql` exactly once against the database configured by `DATABASE_URL`. Do not rerun it after real sales because it resets those quantities.

See `CHECKOUT_TESTING.md` for the storefront, cart, payment, and account smoke-test checklist.
