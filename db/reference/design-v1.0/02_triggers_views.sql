-- =====================================================================
-- 002_triggers_views.sql  -  integrity triggers and read models
-- =====================================================================

-- 1) Ledger -> ingredients.stock_qty
--    The UPDATE takes a row lock, and CHECK (stock_qty >= 0) makes overselling impossible.
CREATE FUNCTION trg_apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ingredients
     SET stock_qty = stock_qty + NEW.quantity_delta
   WHERE id = NEW.ingredient_id;
  RETURN NULL;
END $$;
CREATE TRIGGER stock_movements_apply
  AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION trg_apply_stock_movement();

-- 2) The ledger is append-only. Mistakes are fixed with an 'adjustment' row.
CREATE FUNCTION trg_stock_movements_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only; insert an adjustment instead'
    USING ERRCODE = 'CF007';
END $$;
CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION trg_stock_movements_immutable();

-- 3) Order state machine. Only these transitions are legal:
--    unpaid  -> pending | cancelled | expired
--    pending -> serving | expired
--    serving -> completed | expired
CREATE FUNCTION trg_orders_guard_status() RETURNS trigger
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
CREATE TRIGGER orders_guard_status
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trg_orders_guard_status();

-- 4) Audit log + realtime event on every status change.
--    pg_notify is transactional: listeners only hear about committed changes.
CREATE FUNCTION trg_orders_log_status() RETURNS trigger
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

  -- Small payload (no names); the API re-reads what it needs.
  PERFORM pg_notify('order_status', json_build_object(
    'orderId',     NEW.id,
    'publicId',    NEW.public_id,
    'orderNumber', NEW.order_number,
    'status',      NEW.status
  )::text);
  RETURN NULL;
END $$;
CREATE TRIGGER orders_log_insert
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_orders_log_status();
CREATE TRIGGER orders_log_update
  AFTER UPDATE OF status ON orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trg_orders_log_status();

-- 5) Stock level changes -> event for the admin dashboard and kiosk menu refresh
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

-- ---------- Read models (views) --------------------------------------

-- Kiosk menu. Available = active AND every recipe ingredient covers one serving.
-- Ready-made products have no recipe rows, so they are available while active.
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
       (p.is_active AND NOT EXISTS (
          SELECT 1
            FROM product_ingredients pi
            JOIN ingredients i ON i.id = pi.ingredient_id
           WHERE pi.product_id = p.id
             AND (NOT i.is_active OR i.stock_qty < pi.quantity_required)
       )) AS is_available
FROM products p
JOIN categories c ON c.id = p.category_id;

-- Cashier lookup and receipts: one row per order line
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
       oi.id AS order_item_id,
       oi.product_id,
       oi.product_name,
       oi.unit_price,
       oi.quantity,
       oi.line_total,
       oi.notes
FROM orders o
JOIN order_items oi ON oi.order_id = o.id;

-- Orders panel (Pending / Serving). Items as JSON for the barista call-out.
CREATE VIEW v_order_board AS
SELECT o.id AS order_id,
       o.public_id,
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

-- Admin low-stock alerts
CREATE VIEW v_low_stock AS
SELECT id AS ingredient_id, name, unit, stock_qty, reorder_level
FROM ingredients
WHERE is_active AND stock_qty <= reorder_level;

-- Admin daily sales report (paid orders only; cancelled/unpaid never count)
CREATE VIEW v_daily_sales AS
SELECT o.business_date,
       count(*)            AS orders_paid,
       sum(pay.amount_due) AS gross_sales
FROM orders o
JOIN payments pay ON pay.order_id = o.id
GROUP BY o.business_date;

-- Admin best sellers
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

-- Health check: rows here mean stock_qty drifted from the ledger (should be empty)
CREATE VIEW v_stock_drift AS
SELECT i.id AS ingredient_id, i.name, i.stock_qty,
       COALESCE(sum(m.quantity_delta), 0) AS ledger_sum
FROM ingredients i
LEFT JOIN stock_movements m ON m.ingredient_id = i.id
GROUP BY i.id
HAVING i.stock_qty <> COALESCE(sum(m.quantity_delta), 0);
