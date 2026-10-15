# Marvaelle storefront and checkout verification

## Required deployment configuration

Frontend (Vite build-time variables):

- `VITE_API_BASE_URL`: backend deployment origin only, e.g. `https://your-backend-domain.vercel.app`.
- `VITE_RAZORPAY_KEY_ID`: the same Razorpay Key ID as the backend, using test keys until testing is complete.

Backend runtime variables:

- `DATABASE_URL`: the PostgreSQL database used by the storefront.
- `JWT_SECRET`: at least 16 non-whitespace characters; use a strong random secret.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: Razorpay credentials. The secret must only exist on the backend.
- `GOOGLE_CLIENT_ID`: set in the backend project to the intended Google Web application OAuth Client ID. The frontend fetches the public ID from `/api/auth/google/config`, so no separate frontend Google ID variable is needed.

After changing a `VITE_*` variable, rebuild/redeploy the frontend. Run migrations against the exact database configured by `DATABASE_URL`, never a different database by mistake.

## Test sequence

1. Open `/api/health`. Confirm `database: true`, `jwt_configured: true`, and `payments_configured: true` when payments are intended to work.
2. Open `/api/products`. Confirm that IDs `7`, `10`, `9`, `11`, `6`, and `5-w` have positive quantities for the currently sellable collection. Zero is treated as sold out, not archived.
3. On the storefront, check both Men and Women collections. Current products should be visible even if sold out; explicit archive pieces are only shown when “Include archive” is selected. Search should load `/search` rather than a not-found page.
4. Open a current product through its card and confirm the detail route loads. Try add-to-bag with available stock, increase/decrease quantity, remove it in the cart, and verify the cart count and INR subtotal.
5. Try checkout with missing delivery fields, invalid pincode/phone, a sold-out product, and a quantity above stock. Checkout should prevent payment or show the backend's inventory error.
6. With Razorpay **test** credentials, complete a test payment. Verify `/api/orders/create` is called, the order amount is in paise and matches the server-side product prices, `/api/orders/confirm` returns success, the cart clears, the success screen appears, and stock decreases once.
7. Test a failed payment and dismiss the Razorpay modal. The cart should remain and the pay button should become usable again. If payment succeeds but order confirmation fails, the page should keep a pending payment reference and offer “Retry order confirmation”; do not start a second payment until the first payment is reconciled.
8. Sign in and check account order history. Verify admin order listing/status changes using an account that is actually marked `is_admin=true`; a normal account should be denied.

## Inventory recovery

If current products are unexpectedly zero because the database already had zero-quantity rows, run `migrations/002_restore_current_catalog_inventory.sql` **once** against the live database. It restores the initial launch quantities from the catalog. Never rerun it after sales, because it would restock items that may legitimately have sold out.

## What is not validated by a local source check

The code bundle can be checked without production credentials, but a real payment cannot be completed without your deployed backend, PostgreSQL connection, and matching Razorpay test keys. Verify those steps in Razorpay test mode before enabling live keys.


Before testing the updated checkout, apply backend migration `003_order_item_variants.sql`. Add an available item to the bag with a size and colour selected, confirm both are shown in the bag and checkout summary, then complete a Razorpay test payment and verify the order item has the selected size and colour.
