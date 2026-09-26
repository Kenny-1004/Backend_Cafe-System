-- =====================================================================
-- 002_panels_and_rules.sql
-- Brings the baseline schema up to the Backend & Database Design v1.0:
--   * stable error codes (SQLSTATE CF001-CF007) so the API never parses messages
--   * unguessable order ids for the kiosk + idempotent order placement
--   * named stock shortages, delivery receiving with actual quantities,
--     manual restock / waste / adjustment, delivery create / cancel
--   * staff login sessions, realtime notifications without customer names
--   * read models for the orders board, receipts and sales reports
-- Everything is additive: no existing row is changed or removed.
--
-- Error codes (SQLSTATE) -> HTTP status used by the API:
--   CF001 NOT_FOUND 404 · CF002 INVALID_STATE 409 · CF003 OUT_OF_STOCK 409
--   CF004 INSUFFICIENT_CASH 422 · CF005 VALIDATION_FAILED 422
--   CF006 PRODUCT_UNAVAILABLE 409 · CF007 LEDGER_IMMUTABLE 500
-- =====================================================================

-- ---------- 0. Remove dead code ---------------------------------------
-- Both reference tables that do not exist (ingredient, order_counter) and are never called.
DROP FUNCTION IF EXISTS apply_delivery();
DROP FUNCTION IF EXISTS next_order_number();

-- ---------- 1. Orders: public id, idempotency, tighter checks ---------
ALTER TABLE orders ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE orders ADD CONSTRAINT orders_public_id_key UNIQUE (public_id);
ALTER TABLE orders ADD COLUMN idempotency_key uuid;
ALTER TABLE orders ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE orders ADD CONSTRAINT orders_customer_name_length
  CHECK (customer_name IS NULL OR char_length(btrim(customer_name)) BETWEEN 1 AND 60);

ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_max CHECK (quantity <= 50);
ALTER TABLE order_items ADD CONSTRAINT order_items_notes_length
  CHECK (notes IS NULL OR char_length(notes) <= 200);

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_restock_positive
  CHECK (movement_type <> 'restock' OR quantity_delta > 0);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_waste_negative
  CHECK (movement_type <> 'waste' OR quantity_delta < 0);

ALTER TABLE products  ADD CONSTRAINT products_name_not_blank  CHECK (btrim(name) <> '');
ALTER TABLE employees ADD CONSTRAINT employees_username_lower CHECK (username = lower(username));
ALTER TABLE employees ADD CONSTRAINT employees_full_name_not_blank CHECK (btrim(full_name) <> '');
ALTER TABLE employees ADD COLUMN last_login_at timestamptz;

-- Foreign keys PostgreSQL does not index automatically
CREATE INDEX idx_delivery_items_ingredient ON delivery_items (ingredient_id);
CREATE INDEX idx_stock_movements_delivery_item ON stock_movements (delivery_item_id)
  WHERE delivery_item_id IS NOT NULL;
CREATE INDEX idx_order_status_history_changed_by ON order_status_history (changed_by)
  WHERE changed_by IS NOT NULL;
CREATE INDEX idx_orders_business_date ON orders (business_date, order_number);

-- ---------- 2. Staff login sessions -----------------------------------
-- One row per login. The refresh token itself is never stored, only its sha256.
CREATE TABLE staff_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id bigint      NOT NULL REFERENCES employees(id),
  token_hash  text        NOT NULL UNIQUE,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX idx_staff_sessions_employee ON staff_sessions (employee_id) WHERE revoked_at IS NULL;

-- ---------- 3. Triggers: error codes + realtime ------------------------
CREATE OR REPLACE FUNCTION trg_stock_movements_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only; insert an adjustment instead'
    USING ERRCODE = 'CF007';
END $$;

CREATE OR REPLACE FUNCTION trg_orders_guard_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
        (OLD.status = 'unpaid'  AND NEW.status IN ('pending', 'cancelled', 'expired'))
     OR (OLD.status = 'pending' AND NEW.status IN ('serving', 'expired'))
     OR (OLD.status = 'serving' AND NEW.status IN ('completed', 'expired'))
  ) THEN
    RAISE EXCEPTION 'Invalid order status change: % -> % (order #%)',
                    OLD.status, NEW.status, OLD.order_number
      USING ERRCODE = 'CF002';
  END IF;
  RETURN NEW;
END $$;

-- Audit row + realtime event. The payload carries no customer name (design §7);
-- listeners re-read what they need. pg_notify only fires after COMMIT.
CREATE OR REPLACE FUNCTION trg_orders_log_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_from order_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_from := OLD.status;
  END IF;

  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (NEW.id, v_from, NEW.status,
          NULLIF(current_setting('app.employee_id', true), '')::bigint);

  PERFORM pg_notify('order_status', json_build_object(
    'orderId',     NEW.id,
    'publicId',    NEW.public_id,
    'orderNumber', NEW.order_number,
    'status',      NEW.status
  )::text);
  RETURN NULL;
END $$;

-- Stock level changes -> admin dashboard and kiosk menu refresh
CREATE FUNCTION trg_ingredients_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('stock_changed', json_build_object(
    'ingredientId', NEW.id, 'stockQty', NEW.stock_qty)::text);
  RETURN NULL;
END $$;
CREATE TRIGGER ingredients_notify
  AFTER UPDATE OF stock_qty ON ingredients
  FOR EACH ROW WHEN (OLD.stock_qty IS DISTINCT FROM NEW.stock_qty)
  EXECUTE FUNCTION trg_ingredients_notify();

-- ---------- 4. Read models ---------------------------------------------
-- Kiosk menu. Available = active AND every recipe ingredient covers one serving.
DROP VIEW v_product_availability;
CREATE VIEW v_product_availability AS
SELECT p.id AS product_id,
       p.category_id,
       c.name AS category_name,
       c.sort_order AS category_sort,
       p.name,
       p.description,
       p.product_type,
       p.price,
       p.image_url,
       p.is_active,
       (p.is_active AND NOT EXISTS (
          SELECT 1
            FROM product_ingredients pi
            JOIN ingredients i ON i.id = pi.ingredient_id
           WHERE pi.product_id = p.id
             AND (NOT i.is_active OR i.stock_qty < pi.quantity_required)
       )) AS is_available
FROM products p
JOIN categories c ON c.id = p.category_id;

-- Receipts and cashier lookup: one row per order line
CREATE VIEW v_order_details AS
SELECT o.id AS order_id,
       o.public_id,
       o.business_date,
       o.order_number,
       o.status,
       o.service_type,
       o.customer_name,
       o.total_amount,
       o.created_at,
       o.paid_at,
       o.serving_at,
       o.closed_at,
       oi.id AS order_item_id,
       oi.product_id,
       oi.product_name,
       oi.unit_price,
       oi.quantity,
       oi.line_total,
       oi.notes
FROM orders o
JOIN order_items oi ON oi.order_id = o.id;

-- Orders board (Pending / Serving). Items as JSON for the barista call-out.
DROP VIEW v_order_board;
CREATE VIEW v_order_board AS
SELECT o.id AS order_id,
       o.public_id,
       o.business_date,
       o.order_number,
       o.customer_name,
       o.status,
       o.service_type,
       o.paid_at,
       o.serving_at,
       json_agg(json_build_object(
         'name',     oi.product_name,
         'quantity', oi.quantity,
         'notes',    oi.notes,
         'prepared', p.product_type = 'prepared'
       ) ORDER BY oi.id) AS items
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p     ON p.id = oi.product_id
WHERE o.status IN ('pending', 'serving')
GROUP BY o.id;

-- Daily sales (paid orders only; cancelled / unpaid never count)
CREATE VIEW v_daily_sales AS
SELECT o.business_date,
       count(*)            AS orders_paid,
       sum(pay.amount_due) AS gross_sales
FROM orders o
JOIN payments pay ON pay.order_id = o.id
GROUP BY o.business_date;

-- Best sellers
CREATE VIEW v_product_sales AS
SELECT o.business_date,
       oi.product_id,
       oi.product_name,
       sum(oi.quantity)   AS units_sold,
       sum(oi.line_total) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.paid_at IS NOT NULL
GROUP BY o.business_date, oi.product_id, oi.product_name;

-- Health check: rows here mean stock_qty drifted from the ledger (must be empty)
CREATE VIEW v_stock_drift AS
SELECT i.id AS ingredient_id, i.name, i.stock_qty,
       COALESCE(sum(m.quantity_delta), 0) AS ledger_sum
FROM ingredients i
LEFT JOIN stock_movements m ON m.ingredient_id = i.id
GROUP BY i.id
HAVING i.stock_qty <> COALESCE(sum(m.quantity_delta), 0);

-- ---------- 5. Business functions (one transaction each) ---------------

-- KIOSK: place an order. p_items = '[{"productId":1,"quantity":2,"notes":"less ice"}]'
-- A retry with the same idempotency key returns the original order.
DROP FUNCTION create_order(jsonb, service_type);
CREATE FUNCTION create_order(
  p_items           jsonb,
  p_service_type    service_type DEFAULT 'dine_in',
  p_idempotency_key uuid         DEFAULT NULL
) RETURNS TABLE (order_id bigint, public_id uuid, order_number integer, total_amount numeric)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date     date := cafe_today();
  v_order_id bigint;
  v_number   integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    RETURN QUERY
      SELECT o.id, o.public_id, o.order_number, o.total_amount
        FROM orders o WHERE o.idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 30 THEN
    RAISE EXCEPTION 'An order must contain between 1 and 30 lines'
      USING ERRCODE = 'CF005';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS e
     WHERE jsonb_typeof(e) <> 'object'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS x("productId" bigint, quantity int, notes text)
     WHERE x."productId" IS NULL OR x.quantity IS NULL OR x.quantity NOT BETWEEN 1 AND 50
        OR char_length(x.notes) > 200
  ) THEN
    RAISE EXCEPTION 'Each line needs a productId, a quantity from 1 to 50 and notes of at most 200 characters'
      USING ERRCODE = 'CF005';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_items) AS x("productId" bigint)
      LEFT JOIN v_product_availability a ON a.product_id = x."productId"
     WHERE a.is_available IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'One or more products are unavailable'
      USING ERRCODE = 'CF006';
  END IF;

  v_number := next_order_number(v_date);

  BEGIN
    INSERT INTO orders (business_date, order_number, service_type, idempotency_key)
    VALUES (v_date, v_number, p_service_type, p_idempotency_key)
    RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    -- Two identical requests raced; the other one won. Return its order.
    RETURN QUERY
      SELECT o.id, o.public_id, o.order_number, o.total_amount
        FROM orders o WHERE o.idempotency_key = p_idempotency_key;
    RETURN;
  END;

  -- Prices come from the database, never from the client
  -- Lines keep the order the customer added them (ORDINALITY)
  INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, notes)
  SELECT v_order_id, p.id, p.name, p.price, (e.line->>'quantity')::int, NULLIF(btrim(e.line->>'notes'), '')
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(line, n)
    JOIN products p ON p.id = (e.line->>'productId')::bigint
   ORDER BY e.n;

  UPDATE orders o
     SET total_amount = (SELECT sum(oi.line_total) FROM order_items oi WHERE oi.order_id = v_order_id)
   WHERE o.id = v_order_id;

  RETURN QUERY
    SELECT o.id, o.public_id, o.order_number, o.total_amount
      FROM orders o WHERE o.id = v_order_id;
END $$;

-- CASHIER: confirm cash payment. In ONE transaction:
-- lock order -> validate -> lock + check ingredients in id order -> deduct stock ->
-- record payment -> status 'pending'. Returns the change to hand back.
CREATE OR REPLACE FUNCTION confirm_payment(
  p_order_id      bigint,
  p_customer_name text,
  p_cash_tendered numeric,
  p_employee_id   bigint
) RETURNS numeric
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order    orders%ROWTYPE;
  v_name     text := btrim(coalesce(p_customer_name, ''));
  v_shortage text;
BEGIN
  PERFORM set_config('app.employee_id', p_employee_id::text, true);

  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Customer name is required (max 60 characters)'
      USING ERRCODE = 'CF005';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'CF001';
  END IF;
  IF v_order.status <> 'unpaid' THEN
    RAISE EXCEPTION 'Order #% is not awaiting payment (status: %)',
                    v_order.order_number, v_order.status
      USING ERRCODE = 'CF002';
  END IF;
  IF p_cash_tendered IS NULL OR p_cash_tendered < v_order.total_amount THEN
    RAISE EXCEPTION 'Cash tendered (%) is less than the total (%)',
                    coalesce(p_cash_tendered::text, 'none'), v_order.total_amount
      USING ERRCODE = 'CF004';
  END IF;

  -- Lock needed ingredient rows in id order (no deadlocks between cashiers)
  -- and report every shortage by name.
  WITH need AS (
    SELECT pi.ingredient_id, sum(pi.quantity_required * oi.quantity) AS qty
      FROM order_items oi
      JOIN product_ingredients pi ON pi.product_id = oi.product_id
     WHERE oi.order_id = p_order_id
     GROUP BY pi.ingredient_id
  ), locked AS (
    SELECT i.id, i.name, i.unit, i.stock_qty
      FROM ingredients i
     WHERE i.id IN (SELECT ingredient_id FROM need)
     ORDER BY i.id
       FOR UPDATE
  )
  SELECT string_agg(format('%s (need %s %s, have %s)', l.name, n.qty, l.unit, l.stock_qty), ', ' ORDER BY l.name)
    INTO v_shortage
    FROM need n JOIN locked l ON l.id = n.ingredient_id
   WHERE l.stock_qty < n.qty;

  IF v_shortage IS NOT NULL THEN
    RAISE EXCEPTION 'Not enough stock for order #%: %', v_order.order_number, v_shortage
      USING ERRCODE = 'CF003';
  END IF;

  INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, order_id, employee_id)
  SELECT pi.ingredient_id, 'sale', -sum(pi.quantity_required * oi.quantity), p_order_id, p_employee_id
    FROM order_items oi
    JOIN product_ingredients pi ON pi.product_id = oi.product_id
   WHERE oi.order_id = p_order_id
   GROUP BY pi.ingredient_id
   ORDER BY pi.ingredient_id;

  INSERT INTO payments (order_id, amount_due, cash_tendered, received_by)
  VALUES (p_order_id, v_order.total_amount, p_cash_tendered, p_employee_id);

  UPDATE orders
     SET status = 'pending', customer_name = v_name, paid_at = now()
   WHERE id = p_order_id;

  RETURN p_cash_tendered - v_order.total_amount;
END $$;

-- CASHIER: wrong order / customer left before paying
CREATE OR REPLACE FUNCTION cancel_order(p_order_id bigint, p_employee_id bigint) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status order_status;
BEGIN
  PERFORM set_config('app.employee_id', p_employee_id::text, true);
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'CF001';
  END IF;
  IF v_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Only unpaid orders can be cancelled (status: %)', v_status
      USING ERRCODE = 'CF002';
  END IF;
  UPDATE orders SET status = 'cancelled', closed_at = now() WHERE id = p_order_id;
END $$;

-- ORDERS BOARD: "Done" -> serving (the kiosk plays its ready alert)
CREATE OR REPLACE FUNCTION mark_order_serving(p_order_id bigint, p_employee_id bigint) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status order_status;
BEGIN
  PERFORM set_config('app.employee_id', p_employee_id::text, true);
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'CF001';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be marked ready (status: %)', v_status
      USING ERRCODE = 'CF002';
  END IF;
  UPDATE orders SET status = 'serving', serving_at = now() WHERE id = p_order_id;
END $$;

-- ORDERS BOARD: clear picked-up orders. Orders no longer 'serving' are skipped,
-- so a double click is harmless. Returns rows cleared.
CREATE OR REPLACE FUNCTION complete_orders(p_order_ids bigint[], p_employee_id bigint) RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('app.employee_id', p_employee_id::text, true);
  UPDATE orders SET status = 'completed', closed_at = now()
   WHERE id = ANY (p_order_ids) AND status = 'serving';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- SCHEDULER: close anything still open after 24 hours.
-- SKIP LOCKED: never waits on (or blocks) a cashier mid-transaction.
CREATE OR REPLACE FUNCTION expire_stale_orders(p_max_age interval DEFAULT interval '24 hours')
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('app.employee_id', '', true);
  WITH stale AS (
    SELECT id FROM orders
     WHERE status IN ('unpaid', 'pending', 'serving')
       AND created_at < now() - p_max_age
     ORDER BY id
       FOR UPDATE SKIP LOCKED
  )
  UPDATE orders o SET status = 'expired', closed_at = now()
    FROM stale WHERE o.id = stale.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ADMIN: manual stock change. 'restock' (+), 'waste' (-), 'adjustment' (+/-, note required)
CREATE FUNCTION record_stock_movement(
  p_ingredient_id bigint,
  p_type          movement_type,
  p_quantity      numeric,
  p_note          text,
  p_employee_id   bigint
) RETURNS numeric
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF p_type NOT IN ('restock', 'waste', 'adjustment') THEN
    RAISE EXCEPTION 'Use deliveries or payments for % movements', p_type
      USING ERRCODE = 'CF005';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must not be zero' USING ERRCODE = 'CF005';
  END IF;
  IF p_type = 'restock' AND p_quantity < 0 THEN
    RAISE EXCEPTION 'A restock must add stock; use waste or adjustment to remove it'
      USING ERRCODE = 'CF005';
  END IF;
  IF p_type = 'adjustment' AND btrim(coalesce(p_note, '')) = '' THEN
    RAISE EXCEPTION 'Adjustments need a note explaining why' USING ERRCODE = 'CF005';
  END IF;
  PERFORM 1 FROM ingredients WHERE id = p_ingredient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient % not found', p_ingredient_id USING ERRCODE = 'CF001';
  END IF;

  BEGIN
    INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, employee_id, note)
    VALUES (p_ingredient_id, p_type,
            CASE WHEN p_type = 'waste' THEN -abs(p_quantity) ELSE p_quantity END,
            p_employee_id, NULLIF(btrim(p_note), ''));
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Stock cannot go below zero' USING ERRCODE = 'CF005';
  END;

  SELECT stock_qty INTO v_new FROM ingredients WHERE id = p_ingredient_id;
  RETURN v_new;
END $$;

-- ADMIN: create a purchase delivery.
-- p_items = '[{"ingredientId":3,"quantity":5000,"unitCost":0.12}]'
CREATE FUNCTION create_delivery(
  p_supplier_id bigint,
  p_items       jsonb,
  p_expected_at date,
  p_notes       text,
  p_employee_id bigint
) RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A delivery needs at least one item' USING ERRCODE = 'CF005';
  END IF;
  PERFORM 1 FROM suppliers WHERE id = p_supplier_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier % not found or inactive', p_supplier_id USING ERRCODE = 'CF001';
  END IF;

  INSERT INTO deliveries (supplier_id, expected_at, notes, created_by)
  VALUES (p_supplier_id, p_expected_at, NULLIF(btrim(p_notes), ''), p_employee_id)
  RETURNING id INTO v_id;

  BEGIN
    INSERT INTO delivery_items (delivery_id, ingredient_id, quantity_ordered, unit_cost)
    SELECT v_id, x."ingredientId", x.quantity, x."unitCost"
      FROM jsonb_to_recordset(p_items) AS x("ingredientId" bigint, quantity numeric, "unitCost" numeric);
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'Unknown ingredient in delivery' USING ERRCODE = 'CF001';
    WHEN check_violation OR not_null_violation OR unique_violation THEN
      RAISE EXCEPTION 'Invalid delivery items (quantity > 0, cost >= 0, each ingredient once)'
        USING ERRCODE = 'CF005';
  END;

  RETURN v_id;
END $$;

-- ADMIN: receive a delivery. p_received = '[{"ingredientId":3,"quantityReceived":4800}]'
-- Items not listed are received in full. Stock goes in through the ledger.
DROP FUNCTION receive_delivery(bigint, bigint);
CREATE FUNCTION receive_delivery(
  p_delivery_id bigint,
  p_received    jsonb,
  p_employee_id bigint
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status delivery_status;
BEGIN
  SELECT status INTO v_status FROM deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id USING ERRCODE = 'CF001';
  END IF;
  IF v_status <> 'ordered' THEN
    RAISE EXCEPTION 'Delivery % is already %', p_delivery_id, v_status USING ERRCODE = 'CF002';
  END IF;
  IF p_received IS NOT NULL AND jsonb_typeof(p_received) <> 'array' THEN
    RAISE EXCEPTION 'received must be an array' USING ERRCODE = 'CF005';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(coalesce(p_received, '[]')) AS r("ingredientId" bigint, "quantityReceived" numeric)
     WHERE r."quantityReceived" IS NULL OR r."quantityReceived" < 0
        OR NOT EXISTS (SELECT 1 FROM delivery_items di
                        WHERE di.delivery_id = p_delivery_id AND di.ingredient_id = r."ingredientId")
  ) THEN
    RAISE EXCEPTION 'Received quantities must be >= 0 and only for items on this delivery'
      USING ERRCODE = 'CF005';
  END IF;

  UPDATE delivery_items di
     SET quantity_received = coalesce(r."quantityReceived", di.quantity_ordered)
    FROM delivery_items d2
    LEFT JOIN jsonb_to_recordset(coalesce(p_received, '[]'))
              AS r("ingredientId" bigint, "quantityReceived" numeric)
           ON r."ingredientId" = d2.ingredient_id
   WHERE di.id = d2.id AND d2.delivery_id = p_delivery_id;

  INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, delivery_item_id, employee_id)
  SELECT ingredient_id, 'delivery', quantity_received, id, p_employee_id
    FROM delivery_items
   WHERE delivery_id = p_delivery_id AND quantity_received > 0
   ORDER BY ingredient_id;

  UPDATE deliveries
     SET status = 'received', received_at = now(), received_by = p_employee_id
   WHERE id = p_delivery_id;
END $$;

-- ADMIN: cancel a delivery that never arrived
CREATE FUNCTION cancel_delivery(p_delivery_id bigint, p_employee_id bigint) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status delivery_status;
BEGIN
  SELECT status INTO v_status FROM deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id USING ERRCODE = 'CF001';
  END IF;
  IF v_status <> 'ordered' THEN
    RAISE EXCEPTION 'Delivery % is already %', p_delivery_id, v_status USING ERRCODE = 'CF002';
  END IF;
  UPDATE deliveries SET status = 'cancelled' WHERE id = p_delivery_id;
END $$;
