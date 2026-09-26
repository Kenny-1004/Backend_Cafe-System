# Campus Café Ordering & Inventory System — API

Express + TypeScript REST API on PostgreSQL. Business rules (order flow, stock deduction,
availability, cash payment) live in PostgreSQL functions; the API authenticates staff,
validates input, calls those functions and streams live updates.
The frontend lives in `../Frontend_Cafe-System`.

## Login info

Sign in at **http://localhost:5173/staff/login**. Each role lands on its own screen.

| Username | Password | Role | Opens | Can use |
| --- | --- | --- | --- | --- |
| `admin` | `cafe12345` | Manager | `/staff/admin` | Everything: back office, cashier, board, kiosk preview |
| `cashier1` | `cafe12345` | Cashier | `/staff/cashier` | Cashier + orders board |
| `cashier2` | `cafe12345` | Cashier | `/staff/cashier` | Cashier + orders board |
| `barista1` | `cafe12345` | Barista (kitchen) | `/staff/board` | Orders board |
| `barista2` | `cafe12345` | Barista (kitchen) | `/staff/board` | Orders board |

- `cafe12345` is a **development password** set by `npm run db:seed` / `npm run db:dev-passwords`
  (never in production). Change one with `npm run staff:password -- admin "new-password"`, or from
  *Back office → Staff*. Setting a password signs that person out everywhere.
- 5 wrong passwords in a minute locks that username for a minute on that computer.
- **Kiosk (`http://localhost:5173/`)** has no login: a tablet is paired once. Sign in as `admin`,
  open *Back office → Kiosks → Register kiosk*, then type the 8-character code on the tablet
  (valid 15 minutes, works once). Signed-in managers can open the kiosk directly as a preview.
- **Database logins** (in `Backend_Cafe-System/.env`, never committed):
  `DATABASE_URL` uses `cafe_api` (the API's restricted login) and `MIGRATION_DATABASE_URL` uses
  your `postgres` owner account (migrations and seeding). Reset the API's database password with
  `npm run db:app-login -- cafe_api "<new password>"` and update `.env`.

## Requirements

- Node.js 20.6+ (22 recommended)
- PostgreSQL 13+ (16 recommended)

## Setup

```bash
npm install
cp .env.example .env          # set MIGRATION_DATABASE_URL (owner) and JWT_SECRET (openssl rand -base64 48)
createdb cafe                 # or create the database in pgAdmin
npm run db:setup              # migrations, then menu + staff seed
npm run db:app-login -- cafe_api "<a strong password>"   # the API's restricted login
                              # then put that password in DATABASE_URL
npm run dev                   # http://localhost:5006
```

**Database roles (design §7).** The API connects as `cafe_api`, a member of `cafe_app`: it can read,
edit catalog/staff data and execute the business functions, but cannot write orders, payments, the
stock ledger or `stock_qty` directly (verified by `test/security.test.ts`). Migrations and seeding use
`MIGRATION_DATABASE_URL`, the database owner.

**Kiosk tablets (design §5.2).** Kiosk endpoints only answer paired tablets. A manager opens
*Back office → Kiosks*, registers the tablet and gets a one-time code (15 minutes); the tablet opens
the site and enters it. Deactivating or re-pairing a kiosk locks the old tablet out at once.
Signed-in managers can preview the kiosk.

Outside production, `db:setup` also gives the staff accounts a development password: see **Login info** above.

**Existing database?** `npm run db:migrate` recognises a database created before migrations
were tracked: it marks `001_baseline.sql` as applied and runs only the newer files.
Back it up first: `pg_dump "$MIGRATION_DATABASE_URL" > backup.sql`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload |
| `npm run build` / `npm start` | Compile to `dist/` / run the build |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | 78 integration tests against a throwaway `<db>_test` database, run as a restricted role |
| `npm run db:migrate` | Apply pending files in `db/migrations` |
| `npm run db:seed` | Seed an empty database (menu, staff, suppliers, stock) |
| `npm run db:dev-passwords` | Give placeholder accounts the dev password |
| `npm run staff:password -- <user> <password>` | Set a password (signs that user out) |
| `npm run db:app-login -- <user> <password>` | Create / update the API's restricted database login |

Tests never touch your data: they recreate `<your database>_test` from the migrations and seed.
Override with `TEST_DATABASE_URL`.

## How it works

- **One write path per concept.** Orders, payments and stock change only through the functions in
  `db/migrations/002_panels_and_rules.sql` (`create_order`, `confirm_payment`, `mark_order_serving`,
  `complete_orders`, `record_stock_movement`, `receive_delivery` …), each one transaction with row locks.
- **Cash only (simulated).** The cashier enters the customer's name and the cash received;
  `confirm_payment` validates, deducts ingredients, records the payment and returns the change.
- **Stock ledger.** `ingredients.stock_qty` is never written directly: every change is a
  `stock_movements` row (sale, delivery, restock, waste, adjustment). `/readyz` checks it never drifts.
- **Errors.** Database functions raise `CF001`–`CF007`; `src/utils/pgErrorMap.ts` maps them to
  `NOT_FOUND`, `INVALID_STATE`, `OUT_OF_STOCK`, `INSUFFICIENT_CASH`, `VALIDATION_FAILED`, `PRODUCT_UNAVAILABLE`.
- **Auth.** argon2id passwords; a 15-minute access JWT + 8-hour refresh token in httpOnly,
  SameSite=Strict cookies; refresh tokens rotate and are stored hashed. Every staff request
  re-checks the session, so sign-out, deactivation and role changes apply immediately.
- **Realtime.** Triggers `NOTIFY` on every committed status/stock change; one `LISTEN` connection
  per instance fans out over Server-Sent Events. Kiosks only ever receive their own order.
- **24-hour expiry.** A job (advisory-lock leader election) closes orders left open for 24 hours.

## Response format

```json
{ "success": true, "message": "Order placed", "data": { }, "error": null }
{ "success": false, "message": "Validation failed", "data": null,
  "error": { "code": "VALIDATION_FAILED", "details": [{ "field": "items", "message": "…" }] } }
```

Every response carries `X-Request-Id` (also in the access log). API responses are `Cache-Control: no-store`.

## Endpoints (`/api/v1`)

| Area | Method & path | Who |
| --- | --- | --- |
| Health | `GET /healthz`, `GET /readyz` (root) | public |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/session`, `GET /auth/me` | public / staff |
| Kiosk pairing | `POST /kiosk/pair` `{ code }`, `GET /kiosk/session` | public |
| Kiosk | `GET /menu`, `GET /menu/events` (SSE) | paired kiosk / manager |
| | `POST /orders` (header `Idempotency-Key`), `GET /orders/:publicId`, `GET /orders/:publicId/events` (SSE) | paired kiosk / manager |
| Cashier | `GET /cashier/orders?status=`, `GET /cashier/orders/by-number/:n`, `GET /cashier/orders/:id` | cashier, admin |
| | `POST /cashier/orders/:id/payment` `{ customerName, cashTendered }`, `POST /cashier/orders/:id/cancel` | cashier, admin |
| | `GET /cashier/summary`, `GET /cashier/events` (SSE) | cashier, admin |
| Board | `GET /board`, `POST /board/orders/:id/serve`, `POST /board/orders/complete` `{ orderIds }`, `GET /board/events` (SSE) | kitchen, cashier, admin |
| Catalog | `GET/POST /admin/categories`, `PATCH /admin/categories/:id` | admin |
| | `GET/POST /admin/products`, `GET/PATCH /admin/products/:id`, `PUT /admin/products/:id/recipe` | admin |
| Inventory | `GET/POST /admin/ingredients`, `GET/PATCH /admin/ingredients/:id` | admin |
| | `POST/GET /admin/ingredients/:id/movements`, `GET /admin/stock/low`, `GET /admin/events` (SSE) | admin |
| Suppliers | `GET/POST /admin/suppliers`, `GET/PATCH /admin/suppliers/:id`, `PUT /admin/suppliers/:id/ingredients` | admin |
| Deliveries | `GET/POST /admin/deliveries`, `GET /admin/deliveries/:id`, `POST …/:id/receive`, `POST …/:id/cancel` | admin |
| Staff | `GET/POST /admin/employees`, `GET/PATCH /admin/employees/:id` | admin |
| Orders | `GET /admin/orders?date=&status=&search=&limit=&cursor=`, `GET /admin/orders/:id` | admin |
| Reports | `GET /admin/dashboard`, `GET /admin/reports/daily-sales|best-sellers|summary?from=&to=` | admin |
| Kiosks | `GET/POST /admin/kiosks`, `PATCH /admin/kiosks/:id`, `POST /admin/kiosks/:id/pairing-code` | admin |

Manual requests for all of these: `testing/test.http` (VS Code REST Client).

## Project structure

```
src/
  app.ts, server.ts           app wiring; startup + graceful shutdown
  config/env.ts               validated environment variables
  db/pool.ts                  pg Pool + withTransaction()
  middlewares/                requestId, responseFormatter, authenticate, authorize,
                              rateLimit, validate, notFound, errorHandler
  modules/<feature>/          <feature>.routes → .controller → .service → .repository
                              (+ .validator). Features: auth, kiosk, cashier, board, health,
                              admin/{catalog, inventory, suppliers, deliveries, staff, orders, reports, kiosks}
  realtime/                   hub (pub/sub), listener (LISTEN), sse (streams)
  jobs/expiryJob.ts           24-hour order expiry with leader election
  utils/                      AppError, pgErrorMap, validators, pagination
db/migrations/                001_baseline (schema snapshot), 002_panels_and_rules, 003_kiosks_and_least_privilege
db/seeds/                     menu (298 products, 100 ingredients), staff, suppliers, stock
db/reference/design-v1.0/     the SQL from the design document, for reference
test/                         Vitest + Supertest integration tests
```
