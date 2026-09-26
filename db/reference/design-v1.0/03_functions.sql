-- =====================================================================
-- 003_functions.sql  -  business operations (one transaction each)
--
-- Every write the application makes goes through one of these functions.
-- They run as SECURITY DEFINER so the app's database role needs only
-- EXECUTE rights, never direct INSERT/UPDATE on orders, payments or stock.
--
-- Error codes (SQLSTATE) -> HTTP status used by the API:
--   CF001 NOT_FOUND            404
--   CF002 INVALID_STATE        409
--   CF003 OUT_OF_STOCK         409
--   CF004 INSUFFICIENT_CASH    422
--   CF005 VALIDATION_FAILED    422
--   CF006 PRODUCT_UNAVAILABLE  409
--   CF007 LEDGER_IMMUTABLE     500 (programming error)
-- =====================================================================

-- Next short order number for a day. The upsert row-locks the day's counter,
-- so two kiosks can never receive the same number.
CREATE FUNCTION next_order_number(p_date date) RETURNS integer
LANGUAGE sql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO order_counters (business_date, last_number)
  VALUES (p_date, 1)
  ON CONFLICT (business_date)
  DO UPDATE SET last_number = order_counters.last_number + 1
  RETURNING last_number;
$$;

-- ---------------------------------------------------------------------
-- KIOSK: place an order.
-- p_items = '[{"productId":1,"quantity":2,"notes":"less ice"}]'
-- p_idempotency_key: generated once per checkout on the kiosk; a retry with
-- the same key returns the original order instead of creating a duplicate.
-- ---------------------------------------------------------------------
CREATE FUNCTION create_order(
  p_items           jsonb,
  p_service_type    service_type DEFAULT 'dine_in',
  p_idempotency_key uuid         DEFAULT NULL
) RETURNS TABLE (order_id bigint, public_id uuid, order_number integer, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_date     date := cafe_today();
  v_order_id bigint;
  v_number   integer;
BEGIN
  -- Replay: same checkout already stored -> return it
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
    SELECT 1 FROM jsonb_to_recordset(p_items) AS x("productId" bigint, quantity int)
     WHERE x."productId" IS NULL OR x.quantity IS NULL OR x.quantity NOT BETWEEN 1 AND 50
  ) THEN
    RAISE EXCEPTION 'Each line needs a productId and a quantity from 1 to 50'
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
  INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, notes)
  SELECT v_order_id, p.id, p.name, p.price, x.quantity, NULLIF(btrim(x.notes), '')
    FROM jsonb_to_recordset(p_items) AS x("productId" bigint, quantity int, notes text)
    JOIN products p ON p.id = x."productId";

  UPDATE orders o
     SET total_amount = (SELECT sum(oi.line_total) FROM order_items oi WHERE oi.order_id = v_order_id)
   WHERE o.id = v_order_id;

  RETURN QUERY
    SELECT o.id, o.public_id, o.order_number, o.total_amount
      FROM orders o WHERE o.id = v_order_id;
END $$;

-- ---------------------------------------------------------------------
-- CASHIER: confirm cash payment. In ONE transaction:
--   lock order -> validate -> lock + check ingredients -> deduct stock ->
--   record payment -> status 'pending' (stock is deducted exactly here).
-- Returns the change to hand back.
-- ---------------------------------------------------------------------
CREATE FUNCTION confirm_payment(
  p_order_id      bigint,
  p_customer_name text,
  p_cash_tendered numeric,
  p_employee_id   bigint
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
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
                    p_cash_tendered, v_order.total_amount
      USING ERRCODE = 'CF004';
  END IF;

  -- Lock the needed ingredient rows in id order (consistent order = no deadlocks
  -- between two cashiers) and report every shortage by name.
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
  SELECT string_agg(format('%s (need %s %s, have %s)', l.name, n.qty, l.unit, l.stock_qty), ', ')
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
CREATE FUNCTION cancel_order(p_order_id bigint, p_employee_id bigint) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
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

-- ORDERS PANEL: employee presses "Done" -> serving (kiosk alert fires via NOTIFY)
CREATE FUNCTION mark_order_serving(p_order_id bigint, p_employee_id bigint) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
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
    RAISE EXCEPTION 'Only pending orders can be marked serving (status: %)', v_status
      USING ERRCODE = 'CF002';
  END IF;
  UPDATE orders SET status = 'serving', serving_at = now() WHERE id = p_order_id;
END $$;

-- ORDERS PANEL: clear picked-up orders (one or many). Returns rows cleared.
-- Orders that are no longer 'serving' are skipped, so a double click is harmless.
CREATE FUNCTION complete_orders(p_order_ids bigint[], p_employee_id bigint) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
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

-- SCHEDULER: close anything stuck unpaid / pending / serving for over 24 hours.
-- SKIP LOCKED means it never waits on (or blocks) a cashier mid-transaction.
CREATE FUNCTION expire_stale_orders(p_max_age interval DEFAULT interval '24 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
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

-- ---------------------------------------------------------------------
-- ADMIN: stock
-- ---------------------------------------------------------------------

-- Manual stock change. p_type: 'restock' (+), 'waste' (-), 'adjustment' (+/-)
CREATE FUNCTION record_stock_movement(
  p_ingredient_id bigint,
  p_type          movement_type,
  p_quantity      numeric,
  p_note          text,
  p_employee_id   bigint
) RETURNS numeric                      -- new stock level
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF p_type NOT IN ('restock', 'waste', 'adjustment') THEN
    RAISE EXCEPTION 'Use receive_delivery or confirm_payment for % movements', p_type
      USING ERRCODE = 'CF005';
  END IF;
  IF p_type = 'adjustment' AND btrim(coalesce(p_note, '')) = '' THEN
    RAISE EXCEPTION 'Adjustments need a note explaining why'
      USING ERRCODE = 'CF005';
  END IF;

  BEGIN
    INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, employee_id, note)
    VALUES (p_ingredient_id, p_type,
            CASE WHEN p_type = 'waste' THEN -abs(p_quantity) ELSE p_quantity END,
            p_employee_id, p_note);
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'Ingredient % not found', p_ingredient_id USING ERRCODE = 'CF001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'Invalid quantity, or stock would go below zero'
        USING ERRCODE = 'CF005';
  END;

  SELECT stock_qty INTO v_new FROM ingredients WHERE id = p_ingredient_id;
  RETURN v_new;
END $$;

-- Create a purchase delivery.
-- p_items = '[{"ingredientId":3,"quantity":5000,"unitCost":0.12}]'
CREATE FUNCTION create_delivery(
  p_supplier_id bigint,
  p_items       jsonb,
  p_expected_at date,
  p_notes       text,
  p_employee_id bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A delivery needs at least one item' USING ERRCODE = 'CF005';
  END IF;

  INSERT INTO deliveries (supplier_id, expected_at, notes, created_by)
  VALUES (p_supplier_id, p_expected_at, p_notes, p_employee_id)
  RETURNING id INTO v_id;

  INSERT INTO delivery_items (delivery_id, ingredient_id, quantity_ordered, unit_cost)
  SELECT v_id, x."ingredientId", x.quantity, x."unitCost"
    FROM jsonb_to_recordset(p_items) AS x("ingredientId" bigint, quantity numeric, "unitCost" numeric);

  RETURN v_id;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Unknown supplier or ingredient' USING ERRCODE = 'CF001';
  WHEN check_violation OR not_null_violation OR unique_violation THEN
    RAISE EXCEPTION 'Invalid delivery items (quantity > 0, cost >= 0, no duplicates)'
      USING ERRCODE = 'CF005';
END $$;

-- Receive a delivery. p_received = '[{"ingredientId":3,"quantityReceived":4800}]'
-- Items not listed are assumed received in full.
CREATE FUNCTION receive_delivery(
  p_delivery_id bigint,
  p_received    jsonb,
  p_employee_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
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

-- Cancel a delivery that never arrived
CREATE FUNCTION cancel_delivery(p_delivery_id bigint, p_employee_id bigint) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE deliveries SET status = 'cancelled'
   WHERE id = p_delivery_id AND status = 'ordered';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % is not awaiting receipt', p_delivery_id USING ERRCODE = 'CF002';
  END IF;
END $$;
