-- =====================================================================
-- Campus Café Ordering & Inventory System
-- 001_tables.sql  -  types, tables, indexes
-- Target: PostgreSQL 13+ (gen_random_uuid() is built in)
-- =====================================================================

-- ---------- Enumerated types -----------------------------------------
CREATE TYPE employee_role   AS ENUM ('cashier', 'kitchen', 'admin');
CREATE TYPE product_type    AS ENUM ('prepared', 'ready_made');
CREATE TYPE order_status    AS ENUM ('unpaid', 'pending', 'serving', 'completed', 'cancelled', 'expired');
CREATE TYPE service_type    AS ENUM ('dine_in', 'take_out');
CREATE TYPE movement_type   AS ENUM ('delivery', 'restock', 'sale', 'adjustment', 'waste');
CREATE TYPE delivery_status AS ENUM ('ordered', 'received', 'cancelled');

-- The single definition of "today" for the café (order numbers reset daily)
CREATE FUNCTION cafe_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Manila')::date $$;

-- ---------- Staff ----------------------------------------------------
CREATE TABLE employees (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name     text          NOT NULL CHECK (btrim(full_name) <> ''),
  username      text          NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash text          NOT NULL,
  role          employee_role NOT NULL,
  is_active     boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- ---------- Menu -----------------------------------------------------
CREATE TABLE categories (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text     NOT NULL UNIQUE,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id  integer       NOT NULL REFERENCES categories(id),
  name         text          NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  description  text,
  product_type product_type  NOT NULL DEFAULT 'prepared',
  price        numeric(10,2) NOT NULL CHECK (price >= 0),
  image_url    text,
  is_active    boolean       NOT NULL DEFAULT true,   -- admin on/off switch
  created_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products (category_id);

-- ---------- Inventory ------------------------------------------------
CREATE TABLE ingredients (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text          NOT NULL UNIQUE,
  unit          text          NOT NULL,                       -- 'g', 'ml', 'pcs'
  stock_qty     numeric(12,3) NOT NULL DEFAULT 0,             -- maintained ONLY by the ledger trigger
  reorder_level numeric(12,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  is_active     boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ingredients_stock_nonneg CHECK (stock_qty >= 0)
);

-- Recipe rows exist only for 'prepared' products. Ready-made products have none.
CREATE TABLE product_ingredients (
  product_id        bigint        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id     bigint        NOT NULL REFERENCES ingredients(id),
  quantity_required numeric(12,3) NOT NULL CHECK (quantity_required > 0),
  PRIMARY KEY (product_id, ingredient_id)
);
CREATE INDEX idx_product_ingredients_ingredient ON product_ingredients (ingredient_id);

-- ---------- Suppliers & deliveries -----------------------------------
CREATE TABLE suppliers (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text        NOT NULL UNIQUE,
  contact_person text,
  phone          text,
  email          text,
  address        text,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplier_ingredients (
  supplier_id   bigint        NOT NULL REFERENCES suppliers(id),
  ingredient_id bigint        NOT NULL REFERENCES ingredients(id),
  unit_cost     numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  PRIMARY KEY (supplier_id, ingredient_id)
);
CREATE INDEX idx_supplier_ingredients_ingredient ON supplier_ingredients (ingredient_id);

CREATE TABLE deliveries (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id bigint          NOT NULL REFERENCES suppliers(id),
  status      delivery_status NOT NULL DEFAULT 'ordered',
  ordered_at  timestamptz     NOT NULL DEFAULT now(),
  expected_at date,
  received_at timestamptz,
  created_by  bigint          NOT NULL REFERENCES employees(id),
  received_by bigint          REFERENCES employees(id),
  notes       text,
  CHECK ((status = 'received') = (received_at IS NOT NULL))
);
CREATE INDEX idx_deliveries_supplier_status ON deliveries (supplier_id, status);

CREATE TABLE delivery_items (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id       bigint        NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  ingredient_id     bigint        NOT NULL REFERENCES ingredients(id),
  quantity_ordered  numeric(12,3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(12,3) CHECK (quantity_received >= 0),
  unit_cost         numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  UNIQUE (delivery_id, ingredient_id)
);

-- ---------- Orders ---------------------------------------------------
CREATE TABLE order_counters (            -- one row per day -> short order numbers
  business_date date    PRIMARY KEY,
  last_number   integer NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id       uuid          NOT NULL DEFAULT gen_random_uuid() UNIQUE,  -- what the kiosk sees (not guessable)
  idempotency_key uuid          UNIQUE,                                     -- kiosk double-tap protection
  business_date   date          NOT NULL DEFAULT cafe_today(),
  order_number    integer       NOT NULL CHECK (order_number > 0),
  status          order_status  NOT NULL DEFAULT 'unpaid',
  service_type    service_type  NOT NULL DEFAULT 'dine_in',
  customer_name   text          CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 60),
  total_amount    numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  serving_at      timestamptz,
  closed_at       timestamptz,                       -- set on completed / cancelled / expired
  UNIQUE (business_date, order_number),
  CHECK (paid_at IS NULL OR customer_name IS NOT NULL)   -- a paid order always has a name
);
-- Panels and the cleanup job only read live orders, so index only those
CREATE INDEX idx_orders_active ON orders (status, created_at)
  WHERE status IN ('unpaid', 'pending', 'serving');

CREATE TABLE order_items (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     bigint        NOT NULL REFERENCES orders(id),
  product_id   bigint        NOT NULL REFERENCES products(id),
  product_name text          NOT NULL,                                   -- snapshot
  unit_price   numeric(10,2) NOT NULL CHECK (unit_price >= 0),           -- snapshot
  quantity     integer       NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  line_total   numeric(10,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  notes        text          CHECK (char_length(notes) <= 200)
);
CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

-- Cash only (school project: amounts are typed in, no real money moves)
CREATE TABLE payments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      bigint        NOT NULL UNIQUE REFERENCES orders(id),
  amount_due    numeric(10,2) NOT NULL CHECK (amount_due >= 0),
  cash_tendered numeric(10,2) NOT NULL,
  change_given  numeric(10,2) GENERATED ALWAYS AS (cash_tendered - amount_due) STORED,
  received_by   bigint        NOT NULL REFERENCES employees(id),
  paid_at       timestamptz   NOT NULL DEFAULT now(),
  CHECK (cash_tendered >= amount_due)
);
CREATE INDEX idx_payments_paid_at     ON payments (paid_at);
CREATE INDEX idx_payments_received_by ON payments (received_by, paid_at);

CREATE TABLE order_status_history (      -- audit trail, filled by trigger
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    bigint       NOT NULL REFERENCES orders(id),
  from_status order_status,
  to_status   order_status NOT NULL,
  changed_by  bigint       REFERENCES employees(id),    -- NULL = kiosk / system job
  changed_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, changed_at);

-- ---------- Stock ledger (append-only) -------------------------------
CREATE TABLE stock_movements (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id    bigint        NOT NULL REFERENCES ingredients(id),
  movement_type    movement_type NOT NULL,
  quantity_delta   numeric(12,3) NOT NULL CHECK (quantity_delta <> 0),   -- + in, - out
  order_id         bigint        REFERENCES orders(id),
  delivery_item_id bigint        REFERENCES delivery_items(id),
  employee_id      bigint        REFERENCES employees(id),
  note             text,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CHECK (movement_type <> 'sale'     OR (order_id IS NOT NULL         AND quantity_delta < 0)),
  CHECK (movement_type <> 'delivery' OR (delivery_item_id IS NOT NULL AND quantity_delta > 0)),
  CHECK (movement_type <> 'restock'  OR quantity_delta > 0),
  CHECK (movement_type <> 'waste'    OR quantity_delta < 0)
);
CREATE INDEX idx_stock_movements_ingredient ON stock_movements (ingredient_id, created_at);
CREATE INDEX idx_stock_movements_order      ON stock_movements (order_id) WHERE order_id IS NOT NULL;

-- ---------- API authentication support -------------------------------
-- Staff refresh-token sessions (one row per login; token stored hashed, rotated on refresh)
CREATE TABLE staff_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id bigint      NOT NULL REFERENCES employees(id),
  token_hash  text        NOT NULL UNIQUE,            -- sha256 of the refresh token
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX idx_staff_sessions_employee ON staff_sessions (employee_id) WHERE revoked_at IS NULL;

-- Registered kiosk tablets. The kiosk sends its device token (httpOnly cookie).
CREATE TABLE kiosk_devices (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text        NOT NULL UNIQUE,          -- 'Kiosk 1 - entrance'
  token_hash   text        NOT NULL UNIQUE,
  is_active    boolean     NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
