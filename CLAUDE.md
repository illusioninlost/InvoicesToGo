# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node.js lives at `C:\Program Files\nodejs\` and is not on the default bash PATH. It has been added to `~/.bashrc` so new terminals will have it automatically. If needed:
```bash
export PATH="/c/Program Files/nodejs:$PATH"
```

**Start both servers (dev):**
```bash
npm run dev
```

**Stop servers:**
```bash
taskkill //F //IM node.exe
```

**Start servers individually:**
```bash
npm run server   # Express on :3001
npm run client   # Vite on :5173
```

**Build client for production:**
```bash
npm --prefix client run build
```

**Install all dependencies (after cloning):**
```bash
npm install && npm --prefix client install
```

There are no tests or linting configured at the root level. The client has ESLint via `client/eslint.config.js` but no lint script is wired up.

## Architecture

This is a full-stack **rental invoice** SaaS app (branded **RentInvoicesToGo**) with a separate Express backend and Vite React frontend communicating via proxied `/api` requests.

**Live at:** https://rentinvoicestogo.com
**Frontend:** Vercel
**Backend:** Render (`rentinvoicestogo.onrender.com`)
**Database:** PostgreSQL via Supabase

### Backend (`server/`)

- **`db.js`** — Connects to PostgreSQL using the `pg` package and `DATABASE_URL` env var. Runs `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on startup via `initDb()`.
- **`routes/invoices.js`** — Invoice CRUD. All routes are async, use `$1/$2` positional params, and enforce free tier limit (5 invoices) before creation.
- **`routes/clients.js`** — Tenant CRUD. Scoped per `user_id`. Enforces free tier limit (3 tenants) before creation.
- **`routes/auth.js`** — Signup, login, logout, password reset (email via nodemailer).
- **`routes/billing.js`** — Stripe Checkout session creation, Customer Portal, and billing status endpoint.
- **`middleware/auth.js`** — `requireAuth` middleware — validates Bearer token against `sessions` table, sets `req.userId`.
- **`index.js`** — Mounts all routes. Stripe webhook handler lives here (must be before `express.json()` to receive raw body). Reports and email-invoice routes also live here.

### Payments (Stripe)

- Free tier: 3 tenants, 5 invoices
- Pro tier: $10/month, unlimited
- Stripe Checkout used for upgrades (hosted payment page)
- Stripe Customer Portal used for managing/cancelling subscriptions
- Webhook events handled: `checkout.session.completed` → set plan to `pro`, `customer.subscription.deleted` → set plan to `free`
- Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`

### Email (`nodemailer`)

Config lives in `server/email.config.js`. Password loaded from `.env` via `dotenv`:
```
EMAIL_PASS=your-app-password
```
- SMTP: Gmail (`smtp.gmail.com`, port 587)
- Gmail App Password required (not regular password)

### Frontend (`client/src/`)

- **`App.jsx`** — BrowserRouter, Navbar with user dropdown (Manage Subscription + Sign out), all routes.
- **`index.css`** — All styling as a single flat CSS file using CSS custom properties. No CSS modules.
- **`pages/InvoiceForm.jsx`** — Create/edit invoices. Shows `UpgradeNotice` on free tier limit.
- **`pages/InvoiceDetail.jsx`** — Read-only view. Print/PDF and Email to Tenant buttons.
- **`pages/Reports.jsx`** — Filtered reports with CSV export.
- **`pages/Billing.jsx`** — Plan comparison (Free vs Pro), Upgrade and Manage Subscription buttons.
- **`pages/TenantList.jsx`**, **`TenantForm.jsx`** — Tenant CRUD. Shows `UpgradeNotice` on free tier limit.
- **`components/ClientModal.jsx`** — Quick-add tenant modal. Shows `UpgradeNotice` on free tier limit.
- **`components/UpgradeNotice.jsx`** — Blue banner with "Upgrade Plan →" link to `/billing`, shown when free tier limit is hit.
- **`components/ConfirmModal.jsx`** — Generic confirmation modal.

### Deployment

- **Vercel** — hosts frontend. `vercel.json` in repo root sets build config and proxies `/api/*` to Render backend.
- **Render** — hosts Express backend. Required env vars: `DATABASE_URL`, `EMAIL_PASS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `APP_URL=https://rentinvoicestogo.com`

### Database tables (PostgreSQL)

- **`invoices`** — `user_id`, `invoice_number`, client info, `property_address`, `items` (JSON string), `total`, `status`, dates, `notes`
- **`clients`** — Tenant records (`name`, `address`, `phone`, `email`, `monthly_rent`) scoped per `user_id`
- **`users`** — Auth accounts (`name`, `email`, `password_hash`, `plan`, `stripe_customer_id`)
- **`sessions`** — Auth session tokens
- **`password_resets`** — Password reset tokens with expiry

### Data flow

All pages fetch from `/api/*`. Vite proxies `/api` to `http://localhost:3001` in dev. In production, Vercel rewrites `/api/*` to Render. The `items` column is stored as a JSON string and parsed in every API response via `parseItems()`.
