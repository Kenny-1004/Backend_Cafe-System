-- =====================================================================
-- 004_security.sql  -  least-privilege database role for the API
-- The API connects as cafe_app. It can read, call the functions above,
-- and manage catalog data. It can NOT write orders, payments or stock directly.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cafe_app') THEN
    CREATE ROLE cafe_app LOGIN PASSWORD 'change-me';
  END IF;
END $$;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO cafe_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cafe_app;          -- includes views
REVOKE SELECT ON employees FROM cafe_app;
GRANT SELECT (id, full_name, username, password_hash, role, is_active) ON employees TO cafe_app;

-- Catalog / master data managed from the admin panel
GRANT INSERT, UPDATE ON categories, products, product_ingredients,
                        ingredients, suppliers, supplier_ingredients, employees TO cafe_app;
GRANT DELETE ON product_ingredients, supplier_ingredients TO cafe_app;
GRANT INSERT, UPDATE ON staff_sessions, kiosk_devices TO cafe_app;           -- auth bookkeeping
REVOKE UPDATE ON ingredients FROM cafe_app;
GRANT UPDATE (name, unit, reorder_level, is_active) ON ingredients TO cafe_app;  -- never stock_qty

-- All order / payment / stock writes go through these functions only
GRANT EXECUTE ON FUNCTION
  cafe_today(),
  create_order(jsonb, service_type, uuid),
  confirm_payment(bigint, text, numeric, bigint),
  cancel_order(bigint, bigint),
  mark_order_serving(bigint, bigint),
  complete_orders(bigint[], bigint),
  expire_stale_orders(interval),
  record_stock_movement(bigint, movement_type, numeric, text, bigint),
  create_delivery(bigint, jsonb, date, text, bigint),
  receive_delivery(bigint, jsonb, bigint),
  cancel_delivery(bigint, bigint)
TO cafe_app;
