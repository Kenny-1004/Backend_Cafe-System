-- =====================================================================
-- 003_kiosks_and_least_privilege.sql
--   * kiosk_devices: tablets paired once with a one-time code (design §5.2)
--   * cafe_app: the least-privilege group role the API connects through (design §7).
--     It can read, manage catalog / staff data and EXECUTE the business functions,
--     but has NO write access to orders, payments, the stock ledger or stock_qty.
--     Login users are members of it:  npm run db:app-login -- cafe_api "<password>"
-- =====================================================================

-- ---------- Kiosk devices ---------------------------------------------
-- Neither the device token nor the pairing code is stored, only their sha256.
CREATE TABLE kiosk_devices (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name               text        NOT NULL UNIQUE CHECK (btrim(name) <> '' AND char_length(name) <= 60),
  token_hash         text        UNIQUE,              -- set when paired
  pairing_code_hash  text        UNIQUE,              -- set while a pairing code is open
  pairing_expires_at timestamptz,
  paired_at          timestamptz,
  last_seen_at       timestamptz,
  is_active          boolean     NOT NULL DEFAULT true,
  created_by         bigint      NOT NULL REFERENCES employees(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((pairing_code_hash IS NULL) = (pairing_expires_at IS NULL))
);
CREATE INDEX idx_kiosk_devices_created_by ON kiosk_devices (created_by);

-- ---------- Business functions run with their owner's rights ----------
-- The API role only needs EXECUTE; every write to orders, payments and stock happens
-- inside these functions (and the triggers they fire), never through direct SQL.
ALTER FUNCTION create_order(jsonb, service_type, uuid)                     SECURITY DEFINER;
ALTER FUNCTION confirm_payment(bigint, text, numeric, bigint)             SECURITY DEFINER;
ALTER FUNCTION cancel_order(bigint, bigint)                               SECURITY DEFINER;
ALTER FUNCTION mark_order_serving(bigint, bigint)                         SECURITY DEFINER;
ALTER FUNCTION complete_orders(bigint[], bigint)                          SECURITY DEFINER;
ALTER FUNCTION expire_stale_orders(interval)                              SECURITY DEFINER;
ALTER FUNCTION record_stock_movement(bigint, movement_type, numeric, text, bigint) SECURITY DEFINER;
ALTER FUNCTION create_delivery(bigint, jsonb, date, text, bigint)         SECURITY DEFINER;
ALTER FUNCTION receive_delivery(bigint, jsonb, bigint)                    SECURITY DEFINER;
ALTER FUNCTION cancel_delivery(bigint, bigint)                            SECURITY DEFINER;
ALTER FUNCTION next_order_number(date)                                    SET search_path = public, pg_temp;

-- ---------- The API's role ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cafe_app') THEN
    CREATE ROLE cafe_app NOLOGIN;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO cafe_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cafe_app;           -- includes views
REVOKE SELECT ON schema_migrations FROM cafe_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cafe_app;         -- identity columns on catalog inserts

-- Catalog and master data managed from the admin panel
GRANT INSERT, UPDATE ON categories, products, suppliers TO cafe_app;
GRANT INSERT, DELETE ON product_ingredients, supplier_ingredients TO cafe_app;
GRANT INSERT ON ingredients TO cafe_app;
GRANT UPDATE (name, unit, reorder_level, is_active) ON ingredients TO cafe_app;   -- never stock_qty
GRANT INSERT ON employees TO cafe_app;
GRANT UPDATE (full_name, role, is_active, password_hash, last_login_at) ON employees TO cafe_app;

-- Sign-in and device bookkeeping
GRANT INSERT, UPDATE ON staff_sessions, kiosk_devices TO cafe_app;

-- Every order / payment / stock / delivery write goes through these functions only
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
