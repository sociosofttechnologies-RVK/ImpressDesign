# Impress Design — web app

React 18 + Vite storefront (`/`) with a Node.js + Express + MySQL API (`server/`).

Order flow: customer browses → customises (print/embroidery placements, artwork) → cart → checkout (address, delivery method) →
garments are ordered from TopTex → received at the workshop → customised → shipped with the delivery partner → tracked → delivered → feedback.
Orders **without customisation** are sent to TopTex for delivery straight to the customer.

## Run locally

Prerequisite: **Node.js 20+**. Nothing else — the local database is SQLite via sql.js (WebAssembly, no native build).

```bash
npm install
npm run dev        # starts the API (:4000) and the web app (:5173) together
```

The first run installs the server's packages, creates the database file `server/data/impress-design.db`
with all tables, and creates the admin account `admin@impress-design.local` / `ChangeMe123!`.
Open http://localhost:5173 and use **Admin** in the header after signing in as admin.

- Optional settings: copy `server/.env.example` to `server/.env` (TopTex keys, prices, workshop address…).
- Reset the local data: stop the app and delete `server/data/impress-design.db`.
- If the API crashes, `npm run dev` restarts it and the error is written to `server/data/api-error.log`.
- `npm run dev:web` / `npm run dev:api` start just one side.

### Production database (MySQL)

Set `DB_CLIENT=mysql` plus `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `server/.env`, then `cd server && npm run db:init`
(or run `server/db/schema.sql` in phpMyAdmin / `mysql -u root -p < server/db/schema.sql`). The code is the same for both databases.

## Database (`server/db/schema.sqlite.sql` local · `server/db/schema.sql` MySQL)

| Table | Purpose |
|---|---|
| `users`, `addresses` | Customers and admins (bcrypt passwords, JWT sessions, `disabled` = blocked); saved delivery addresses |
| `orders` | Order header: fulfilment type (`customised` / `direct`), status, address snapshot, goods / marking / shipping / VAT totals, internal `admin_notes` |
| `order_items` | Order detail: one row per SKU + customisation, artwork link, supplier status, link to the TopTex order |
| `order_status_history` | Timeline shown to the customer |
| `vendor_orders`, `vendor_order_lines` | Purchase orders sent to TopTex (request/response JSON kept), grouped by SKU |
| `shipments`, `shipment_events` | Delivery partner / TopTex shipments and tracking history |
| `invoices` | One per order, generated with the first shipment; addresses captured at that moment |
| `feedback` | 1–5 rating + comment once delivered |
| `uploads` | Customer artwork files (stored in `server/uploads/`) |

## TopTex integration (`server/src/services/TopTexService.js`)

Separate service class, configured from `.env` (`TOPTEX_URL`, `TOPTEX_API_KEY`, `TOPTEX_USERNAME`, `TOPTEX_PASSWORD`).
Two-factor auth as in the Postman collection: authenticates with the credentials, then sends `x-api-key` + `x-toptex-authorization` on every call;
the token is cached and refreshed automatically on expiry or a 401.

- **Catalog:** with credentials set, the API downloads the full TopTex catalog through `GET /v3/products/all` (paged) when it starts,
  then every `CATALOG_REFRESH_HOURS` (24 h). On the first download products appear in the shop page by page. It is saved to
  `server/data/catalog.json`, so restarts are instant. Admin → Catalog shows progress and has a "Download now" button;
  `npm run catalog:sync` does the same from the terminal. Without credentials the shop shows the 50-product sample.
- **Supplier orders** (`POST /v3/orders`), `VENDOR_ORDER_MODE`:
  - `grouped` (default): customised items wait in Admin → Supplier orders; select items from many orders → one TopTex order, quantities summed per SKU,
    every item linked back to it. "Mark received" moves complete orders to *Garments at workshop*.
  - `immediate`: one TopTex order per customer order at checkout.
  - Direct (non-customised) orders are always sent immediately with the customer's address and a neutral delivery note.
- **Dry run:** with no TopTex credentials, supplier orders are recorded locally (`DRYRUN-…`) and nothing is sent. `TOPTEX_TEST_MODE=true` sends `testMode: true`.

## Delivery partner (`server/src/services/shipping/`)

- `flatrate` (default): works offline. Price = (base + per-kg × weight) × zone factor (distance from the workshop: Île-de-France / rest of France / EU / world).
  Shipping is added to the order total. Rates are placeholders in `server/src/config.js`.
- `http`: template for a partner REST API (quote, create shipment + label, tracking). Fill in the three mapping blocks in `HttpProvider.js`.
- Direct orders: the admin enters the carrier + tracking number from the TopTex delivery note.

## Pages

| Route | |
|---|---|
| `/`, `/clothing`, `/clothing/:slug` | Storefront (listing now loads page by page on scroll; artwork uploads to the server) |
| `/login` | Sign in / create account |
| `/checkout` | Address, delivery options with live prices, totals incl. marking + VAT |
| `/account`, `/account/orders/:no` | Orders, progress timeline, tracking, invoice, feedback |
| `/invoice/:no` | Printable invoice (Print / save as PDF) |
| `/admin` | Orders, Supplier orders (grouping), Users, Feedback, Catalog sync |
| `/admin/orders/:no` | Status actions + manual status change, edit contact / address / notes, internal notes, order garments, ship / record tracking, payment status, artwork download |

## Admin

- **Orders** — status chips with counts; filters for search (order no., name, email, phone, company, city), garments stage
  (to order / ordered / received), type, payment, country, date range and sort. Filters are kept in the URL, so views can be bookmarked.
  Tick orders (selection is kept across pages) to:
  - **Order garments** — preview the per-SKU quantities summed across the selected orders, see which orders are left out and why
    (direct delivery, cancelled, already ordered), then place one TopTex order. "Show these orders" filters by that supplier order.
  - **Set status** / **Set payment** for all selected orders, or **export CSV**.
- **Order page** — "Change status to…" sets any step of the order's flow (or cancel) with a timeline note; steps outside the normal
  next action ask for confirmation and only change the status. Contact, delivery address and customer notes are editable
  (totals are not recalculated); **internal notes** are admin-only.
- **Users** — search, role / state filters, sort by orders or spend; add users (customer or admin), edit details, reset password,
  block / unblock (blocked users cannot sign in). You cannot demote or block yourself, and the last active admin cannot be removed.
- Existing databases get the new columns (`users.disabled`, `orders.admin_notes`) automatically when the API starts.

## Still to decide / connect

- **Payment gateway**: orders are placed as *unpaid*; the admin sets payment status. Add Stripe/PayPal at checkout when chosen.
- **Real prices**: marking (`PRINT_*`, `EMBROIDERY_*`) and shipping rates in `.env` / `config.js` are placeholders.
- **Delivery partner API**: confirm which partner and wire `HttpProvider.js`.
- **Emails** to the customer at each status change are not sent yet.

## Deploying

`npm run build` → upload `dist/` as before (Apache `.htaccess` included). The API needs a Node.js host + MySQL (cPanel "Setup Node.js App" works);
use `DB_CLIENT=mysql` there; set `VITE_API_URL=https://your-api-host/api` before building if the API is on a different domain, and `CORS_ORIGIN` in `server/.env` to the site URL.
