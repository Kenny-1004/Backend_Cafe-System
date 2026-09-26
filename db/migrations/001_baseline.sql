-- =====================================================================
-- 001_baseline.sql  -  the schema the café database was created with
-- Generated with pg_dump --schema-only from the existing database, so a
-- fresh setup matches it exactly. scripts/migrate.ts marks this file as
-- applied (without running it) on a database that already has these tables.
-- Later changes live in 002+ migrations; never edit this file.
-- =====================================================================

-- pg_dump creates functions before the tables they reference
SET check_function_bodies = false;

--

--
-- Name: delivery_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.delivery_status AS ENUM (
    'ordered',
    'received',
    'cancelled'
);

--
-- Name: employee_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employee_role AS ENUM (
    'cashier',
    'kitchen',
    'admin'
);

--
-- Name: movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movement_type AS ENUM (
    'delivery',
    'restock',
    'sale',
    'adjustment',
    'waste'
);

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'unpaid',
    'pending',
    'serving',
    'completed',
    'cancelled',
    'expired'
);

--
-- Name: product_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_type AS ENUM (
    'prepared',
    'ready_made'
);

--
-- Name: service_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_type AS ENUM (
    'dine_in',
    'take_out'
);

--
-- Name: apply_delivery(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_delivery() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE ingredient
  SET current_quantity = current_quantity + NEW.quantity_received
  WHERE ingredient_id = NEW.ingredient_id;
  RETURN NEW;
END;
$$;

--
-- Name: cafe_today(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cafe_today() RETURNS date
    LANGUAGE sql STABLE
    AS $$ SELECT (now() AT TIME ZONE 'Asia/Manila')::date $$;

--
-- Name: cancel_order(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_order(p_order_id bigint, p_employee_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM set_config('app.employee_id', p_employee_id::text, true);
  UPDATE orders SET status = 'cancelled', closed_at = now()
   WHERE id = p_order_id AND status = 'unpaid';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % is not unpaid, cannot cancel', p_order_id;
  END IF;
END $$;

--
-- Name: complete_orders(bigint[], bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_orders(p_order_ids bigint[], p_employee_id bigint) RETURNS integer
    LANGUAGE plpgsql
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

--
-- Name: confirm_payment(bigint, text, numeric, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_payment(p_order_id bigint, p_customer_name text, p_cash_tendered numeric, p_employee_id bigint) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  PERFORM set_config('app.employee_id', p_employee_id::text, true);

  IF btrim(coalesce(p_customer_name, '')) = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;
  IF v_order.status <> 'unpaid' THEN
    RAISE EXCEPTION 'Order #% is not awaiting payment (status: %)', v_order.order_number, v_order.status;
  END IF;
  IF p_cash_tendered < v_order.total_amount THEN
    RAISE EXCEPTION 'Cash tendered (%) is less than the total (%)', p_cash_tendered, v_order.total_amount;
  END IF;

  -- Deduct recipe ingredients (prepared products only; ready-made have no recipe rows).
  -- ORDER BY keeps lock order consistent across cashiers (no deadlocks).
  BEGIN
    INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, order_id, employee_id)
    SELECT pi.ingredient_id, 'sale'::movement_type,
           -SUM(pi.quantity_required * oi.quantity), p_order_id, p_employee_id
      FROM order_items oi
      JOIN product_ingredients pi ON pi.product_id = oi.product_id
     WHERE oi.order_id = p_order_id
     GROUP BY pi.ingredient_id
     ORDER BY pi.ingredient_id;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Not enough stock to fulfil order #%', v_order.order_number;
  END;

  INSERT INTO payments (order_id, amount_due, cash_tendered, received_by)
  VALUES (p_order_id, v_order.total_amount, p_cash_tendered, p_employee_id);

  UPDATE orders
     SET status        = 'pending',
         customer_name = btrim(p_customer_name),
         paid_at       = now()
   WHERE id = p_order_id;

  RETURN p_cash_tendered - v_order.total_amount;
END $$;

--
-- Name: create_order(jsonb, public.service_type); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order(p_items jsonb, p_service_type public.service_type DEFAULT 'dine_in'::public.service_type) RETURNS TABLE(new_order_id bigint, new_order_number integer, new_total numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_date     date := cafe_today();
  v_order_id bigint;
  v_number   integer;
  v_total    numeric;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_items) AS x(product_id bigint, quantity int)
      LEFT JOIN v_product_availability a ON a.product_id = x.product_id
     WHERE a.is_available IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'One or more products are unavailable';
  END IF;

  v_number := next_order_number(v_date);

  INSERT INTO orders (business_date, order_number, service_type)
  VALUES (v_date, v_number, p_service_type)
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, notes)
  SELECT v_order_id, p.id, p.name, p.price, x.quantity, x.notes
    FROM jsonb_to_recordset(p_items) AS x(product_id bigint, quantity int, notes text)
    JOIN products p ON p.id = x.product_id;

  UPDATE orders
     SET total_amount = (SELECT sum(oi.line_total) FROM order_items oi WHERE oi.order_id = v_order_id)
   WHERE id = v_order_id
  RETURNING total_amount INTO v_total;

  RETURN QUERY SELECT v_order_id, v_number, v_total;
END $$;

--
-- Name: expire_stale_orders(interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_stale_orders(p_max_age interval DEFAULT '24:00:00'::interval) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE orders SET status = 'expired', closed_at = now()
   WHERE status IN ('unpaid', 'pending', 'serving')
     AND created_at < now() - p_max_age;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

--
-- Name: mark_order_serving(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_order_serving(p_order_id bigint, p_employee_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM set_config('app.employee_id', p_employee_id::text, true);
  UPDATE orders SET status = 'serving', serving_at = now()
   WHERE id = p_order_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % is not pending', p_order_id;
  END IF;
END $$;

--
-- Name: next_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_order_number() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  n     INT;
BEGIN
  INSERT INTO order_counter (order_date, last_number)
  VALUES (today, 1)
  ON CONFLICT (order_date)
  DO UPDATE SET last_number = order_counter.last_number + 1
  RETURNING last_number INTO n;
  RETURN n;
END;
$$;

--
-- Name: next_order_number(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_order_number(p_date date) RETURNS integer
    LANGUAGE sql
    AS $$
  INSERT INTO order_counters (business_date, last_number)
  VALUES (p_date, 1)
  ON CONFLICT (business_date)
  DO UPDATE SET last_number = order_counters.last_number + 1
  RETURNING last_number;
$$;

--
-- Name: receive_delivery(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receive_delivery(p_delivery_id bigint, p_employee_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM 1 FROM deliveries WHERE id = p_delivery_id AND status = 'ordered' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % is not awaiting receipt', p_delivery_id;
  END IF;

  INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, delivery_item_id, employee_id)
  SELECT ingredient_id, 'delivery'::movement_type, quantity_received, id, p_employee_id
    FROM delivery_items
   WHERE delivery_id = p_delivery_id AND quantity_received > 0
   ORDER BY ingredient_id;

  UPDATE deliveries
     SET status = 'received', received_at = now(), received_by = p_employee_id
   WHERE id = p_delivery_id;
END $$;

--
-- Name: trg_apply_stock_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_apply_stock_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE ingredients
     SET stock_qty = stock_qty + NEW.quantity_delta
   WHERE id = NEW.ingredient_id;
  RETURN NULL;
END $$;

--
-- Name: trg_orders_guard_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_guard_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT (
        (OLD.status = 'unpaid'  AND NEW.status IN ('pending', 'cancelled', 'expired'))
     OR (OLD.status = 'pending' AND NEW.status IN ('serving', 'expired'))
     OR (OLD.status = 'serving' AND NEW.status IN ('completed', 'expired'))
  ) THEN
    RAISE EXCEPTION 'Invalid order status change: % -> % (order id %)',
                    OLD.status, NEW.status, OLD.id;
  END IF;
  RETURN NEW;
END $$;

--
-- Name: trg_orders_log_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_log_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
    'order_id',      NEW.id,
    'order_number',  NEW.order_number,
    'business_date', NEW.business_date,
    'customer_name', NEW.customer_name,
    'status',        NEW.status
  )::text);
  RETURN NULL;
END $$;

--
-- Name: trg_stock_movements_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_stock_movements_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only; insert an adjustment instead';
END $$;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL
);

--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deliveries (
    id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    status public.delivery_status DEFAULT 'ordered'::public.delivery_status NOT NULL,
    ordered_at timestamp with time zone DEFAULT now() NOT NULL,
    expected_at date,
    received_at timestamp with time zone,
    created_by bigint NOT NULL,
    received_by bigint,
    notes text,
    CONSTRAINT deliveries_check CHECK (((status = 'received'::public.delivery_status) = (received_at IS NOT NULL)))
);

--
-- Name: deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.deliveries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.deliveries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: delivery_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_items (
    id bigint NOT NULL,
    delivery_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    quantity_ordered numeric(12,3) NOT NULL,
    quantity_received numeric(12,3),
    unit_cost numeric(10,2) NOT NULL,
    CONSTRAINT delivery_items_quantity_ordered_check CHECK ((quantity_ordered > (0)::numeric)),
    CONSTRAINT delivery_items_quantity_received_check CHECK ((quantity_received >= (0)::numeric)),
    CONSTRAINT delivery_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);

--
-- Name: delivery_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.delivery_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.delivery_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id bigint NOT NULL,
    full_name text NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role public.employee_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employees ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.employees_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredients (
    id bigint NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    stock_qty numeric(12,3) DEFAULT 0 NOT NULL,
    reorder_level numeric(12,3) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingredients_reorder_level_check CHECK ((reorder_level >= (0)::numeric)),
    CONSTRAINT ingredients_stock_qty_check CHECK ((stock_qty >= (0)::numeric))
);

--
-- Name: ingredients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ingredients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ingredients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: order_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_counters (
    business_date date NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    product_id bigint NOT NULL,
    product_name text NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    line_total numeric(10,2) GENERATED ALWAYS AS ((unit_price * (quantity)::numeric)) STORED,
    notes text,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    from_status public.order_status,
    to_status public.order_status NOT NULL,
    changed_by bigint,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: order_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    business_date date DEFAULT public.cafe_today() NOT NULL,
    order_number integer NOT NULL,
    status public.order_status DEFAULT 'unpaid'::public.order_status NOT NULL,
    service_type public.service_type DEFAULT 'dine_in'::public.service_type NOT NULL,
    customer_name text,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    serving_at timestamp with time zone,
    closed_at timestamp with time zone,
    CONSTRAINT orders_check CHECK (((paid_at IS NULL) OR (customer_name IS NOT NULL))),
    CONSTRAINT orders_customer_name_check CHECK (((customer_name IS NULL) OR (btrim(customer_name) <> ''::text))),
    CONSTRAINT orders_order_number_check CHECK ((order_number > 0)),
    CONSTRAINT orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    amount_due numeric(10,2) NOT NULL,
    cash_tendered numeric(10,2) NOT NULL,
    change_given numeric(10,2) GENERATED ALWAYS AS ((cash_tendered - amount_due)) STORED,
    received_by bigint NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_due_check CHECK ((amount_due >= (0)::numeric)),
    CONSTRAINT payments_check CHECK ((cash_tendered >= amount_due))
);

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: product_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_ingredients (
    product_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    quantity_required numeric(12,3) NOT NULL,
    CONSTRAINT product_ingredients_quantity_required_check CHECK ((quantity_required > (0)::numeric))
);

--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    category_id integer NOT NULL,
    name text NOT NULL,
    description text,
    product_type public.product_type DEFAULT 'prepared'::public.product_type NOT NULL,
    price numeric(10,2) NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_price_check CHECK ((price >= (0)::numeric))
);

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    movement_type public.movement_type NOT NULL,
    quantity_delta numeric(12,3) NOT NULL,
    order_id bigint,
    delivery_item_id bigint,
    employee_id bigint,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movements_check CHECK (((movement_type <> 'sale'::public.movement_type) OR ((order_id IS NOT NULL) AND (quantity_delta < (0)::numeric)))),
    CONSTRAINT stock_movements_check1 CHECK (((movement_type <> 'delivery'::public.movement_type) OR ((delivery_item_id IS NOT NULL) AND (quantity_delta > (0)::numeric)))),
    CONSTRAINT stock_movements_quantity_delta_check CHECK ((quantity_delta <> (0)::numeric))
);

--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: supplier_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_ingredients (
    supplier_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    unit_cost numeric(10,2) NOT NULL,
    CONSTRAINT supplier_ingredients_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);

--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id bigint NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: v_low_stock; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_low_stock AS
 SELECT id AS ingredient_id,
    name,
    unit,
    stock_qty,
    reorder_level
   FROM public.ingredients
  WHERE (is_active AND (stock_qty <= reorder_level));

--
-- Name: v_order_board; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_order_board AS
SELECT
    NULL::bigint AS order_id,
    NULL::date AS business_date,
    NULL::integer AS order_number,
    NULL::text AS customer_name,
    NULL::public.order_status AS status,
    NULL::public.service_type AS service_type,
    NULL::timestamp with time zone AS paid_at,
    NULL::timestamp with time zone AS serving_at,
    NULL::text AS items_summary;

--
-- Name: v_product_availability; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_product_availability AS
 SELECT id AS product_id,
    category_id,
    name,
    product_type,
    price,
    image_url,
    (is_active AND (NOT (EXISTS ( SELECT 1
           FROM (public.product_ingredients pi
             JOIN public.ingredients i ON ((i.id = pi.ingredient_id)))
          WHERE ((pi.product_id = p.id) AND ((NOT i.is_active) OR (i.stock_qty < pi.quantity_required))))))) AS is_available
   FROM public.products p;

--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);

--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);

--
-- Name: delivery_items delivery_items_delivery_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_delivery_id_ingredient_id_key UNIQUE (delivery_id, ingredient_id);

--
-- Name: delivery_items delivery_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_pkey PRIMARY KEY (id);

--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);

--
-- Name: employees employees_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_username_key UNIQUE (username);

--
-- Name: ingredients ingredients_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_name_key UNIQUE (name);

--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);

--
-- Name: order_counters order_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_counters
    ADD CONSTRAINT order_counters_pkey PRIMARY KEY (business_date);

--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);

--
-- Name: orders orders_business_date_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_business_date_order_number_key UNIQUE (business_date, order_number);

--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

--
-- Name: payments payments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_key UNIQUE (order_id);

--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

--
-- Name: product_ingredients product_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ingredients
    ADD CONSTRAINT product_ingredients_pkey PRIMARY KEY (product_id, ingredient_id);

--
-- Name: products products_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_name_key UNIQUE (name);

--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);

--
-- Name: supplier_ingredients supplier_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_ingredients
    ADD CONSTRAINT supplier_ingredients_pkey PRIMARY KEY (supplier_id, ingredient_id);

--
-- Name: suppliers suppliers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_name_key UNIQUE (name);

--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);

--
-- Name: idx_deliveries_supplier_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_supplier_status ON public.deliveries USING btree (supplier_id, status);

--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

--
-- Name: idx_order_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);

--
-- Name: idx_order_status_history_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_order ON public.order_status_history USING btree (order_id, changed_at);

--
-- Name: idx_orders_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_active ON public.orders USING btree (status, created_at) WHERE (status = ANY (ARRAY['unpaid'::public.order_status, 'pending'::public.order_status, 'serving'::public.order_status]));

--
-- Name: idx_payments_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_paid_at ON public.payments USING btree (paid_at);

--
-- Name: idx_payments_received_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_received_by ON public.payments USING btree (received_by, paid_at);

--
-- Name: idx_product_ingredients_ingredient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_ingredients_ingredient ON public.product_ingredients USING btree (ingredient_id);

--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);

--
-- Name: idx_stock_movements_ingredient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_ingredient ON public.stock_movements USING btree (ingredient_id, created_at);

--
-- Name: idx_stock_movements_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_order ON public.stock_movements USING btree (order_id) WHERE (order_id IS NOT NULL);

--
-- Name: idx_supplier_ingredients_ingredient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_ingredients_ingredient ON public.supplier_ingredients USING btree (ingredient_id);

--
-- Name: v_order_board _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_order_board AS
 SELECT o.id AS order_id,
    o.business_date,
    o.order_number,
    o.customer_name,
    o.status,
    o.service_type,
    o.paid_at,
    o.serving_at,
    string_agg(((oi.quantity || 'x '::text) || oi.product_name), ', '::text ORDER BY oi.id) AS items_summary
   FROM (public.orders o
     JOIN public.order_items oi ON ((oi.order_id = o.id)))
  WHERE (o.status = ANY (ARRAY['pending'::public.order_status, 'serving'::public.order_status]))
  GROUP BY o.id;

--
-- Name: orders orders_guard_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_guard_status BEFORE UPDATE OF status ON public.orders FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.trg_orders_guard_status();

--
-- Name: orders orders_log_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_log_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_log_status();

--
-- Name: orders orders_log_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_log_update AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.trg_orders_log_status();

--
-- Name: stock_movements stock_movements_apply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_movements_apply AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.trg_apply_stock_movement();

--
-- Name: stock_movements stock_movements_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_movements_immutable BEFORE DELETE OR UPDATE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.trg_stock_movements_immutable();

--
-- Name: deliveries deliveries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id);

--
-- Name: deliveries deliveries_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.employees(id);

--
-- Name: deliveries deliveries_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

--
-- Name: delivery_items delivery_items_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;

--
-- Name: delivery_items delivery_items_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id);

--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);

--
-- Name: order_status_history order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.employees(id);

--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

--
-- Name: payments payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.employees(id);

--
-- Name: product_ingredients product_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ingredients
    ADD CONSTRAINT product_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id);

--
-- Name: product_ingredients product_ingredients_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ingredients
    ADD CONSTRAINT product_ingredients_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);

--
-- Name: stock_movements stock_movements_delivery_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_delivery_item_id_fkey FOREIGN KEY (delivery_item_id) REFERENCES public.delivery_items(id);

--
-- Name: stock_movements stock_movements_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

--
-- Name: stock_movements stock_movements_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id);

--
-- Name: stock_movements stock_movements_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

--
-- Name: supplier_ingredients supplier_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_ingredients
    ADD CONSTRAINT supplier_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id);

--
-- Name: supplier_ingredients supplier_ingredients_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_ingredients
    ADD CONSTRAINT supplier_ingredients_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

--

RESET check_function_bodies;
