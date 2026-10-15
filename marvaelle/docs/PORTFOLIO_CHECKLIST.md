# Portfolio polish checklist

Before adding this project to a resume:

- [ ] Replace the storefront and API URL placeholders in `README.md` with working public links.
- [ ] Capture 3–5 screenshots of the actual deployed site (homepage/catalogue, product/variant selection, cart, checkout UI without payment or personal data, and account/order area). Save them under `docs/screenshots/` and embed them in the README.
- [ ] Run `npm install` in both `frontend/` and `backend/`, verify the frontend build and backend syntax check, then commit both generated package-lock files.
- [ ] Review `git status` and scan the staged diff for credentials, `.env` files, database connection strings, customer details, and local build output before pushing.
- [ ] Verify product imagery and brand assets can be included in a public repository.
- [ ] Keep commits descriptive, for example `docs: add architecture and setup guide` or `fix: normalize newsletter signup emails`.
- [ ] Add measured facts only: don't invent conversion, revenue, latency, or user metrics.
- [ ] Choose a license only if you are comfortable granting the permissions it describes; don't add an MIT license by default for a proprietary project.
