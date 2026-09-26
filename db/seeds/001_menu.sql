-- =====================================================================
-- 001_menu.sql  -  demo data: staff, menu with sizes, recipes, suppliers, stock
--
-- Prices are in PHP. Rows reference each other BY NAME, so ids are never hard-coded.
-- password_hash values are placeholders until the auth module is built.
--
-- Sizes: each sized drink becomes one product per size, e.g. "Caffe Latte (Grande 16oz)".
-- Recipes below are written for a Grande and scaled for the other sizes:
--   kind 's' = scales with the size (milk, syrup, ice ...)
--   kind 'f' = fixed per drink (whipped cream, drizzle, garnish ...)
--   kind 'x' = amount per espresso shot (Tall 1 shot, Grande 2, Venti 2 hot / 3 iced)
-- Cups, lids, sleeves and straws are added automatically per size (seed_packaging).
-- The whole file runs in one transaction; the checks at the end abort it on any typo.
-- =====================================================================

-- ---------- Staff -----------------------------------------------------
INSERT INTO employees (full_name, username, password_hash, role) VALUES
  ('Café Manager', 'admin',    'argon2id$placeholder', 'admin'),
  ('Cashier One',  'cashier1', 'argon2id$placeholder', 'cashier'),
  ('Cashier Two',  'cashier2', 'argon2id$placeholder', 'cashier'),
  ('Barista One',  'barista1', 'argon2id$placeholder', 'kitchen'),
  ('Barista Two',  'barista2', 'argon2id$placeholder', 'kitchen');

-- ---------- Categories (kiosk tab order) ------------------------------
INSERT INTO categories (name, sort_order) VALUES
  ('Espresso Bar',      1),
  ('Hot Coffee',        2),
  ('Iced Coffee',       3),
  ('Frappes',           4),
  ('Matcha & Tea',      5),
  ('Milk Tea',          6),
  ('Chocolate',         7),
  ('Refreshers',        8),
  ('Juices & Shakes',   9),
  ('Bottled Drinks',   10),
  ('Pastries & Breads',11),
  ('Cakes & Desserts', 12),
  ('Sandwiches',       13);

-- ---------- Suppliers -------------------------------------------------
INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
  ('Cebu Coffee Roasters',        'Jun Reyes',     '0917 000 0001', 'orders@cebucoffee.test',     'Mandaue City, Cebu'),
  ('Bukidnon Dairy Co.',          'Maria Santos',  '0917 000 0002', 'sales@bukidnondairy.test',   'Malaybalay, Bukidnon'),
  ('Visayas Cafe Supplies',       'Lito Garcia',   '0917 000 0003', 'hello@vcsupplies.test',      'Cebu City, Cebu'),
  ('Pacific Packaging Solutions', 'Grace Tan',     '0917 000 0004', 'sales@pacificpack.test',     'Lapu-Lapu City, Cebu'),
  ('Carbon Market Fruit Traders', 'Nestor Villa',  '0917 000 0005', 'orders@carbonfruit.test',    'Cebu City, Cebu'),
  ('Cebu Tube Ice Plant',         'Rico Mendoza',  '0917 000 0006', 'delivery@cebuice.test',      'Talisay City, Cebu'),
  ('Sweet Crumbs Bakery',         'Ana Cruz',      '0917 000 0007', 'orders@sweetcrumbs.test',    'Cebu City, Cebu'),
  ('Metro Beverage Distributor',  'Ramon Lim',     '0917 000 0008', 'trade@metrobev.test',        'Talisay City, Cebu');

-- ---------- Ingredients (100) -----------------------------------------
-- name, unit, reorder level, opening stock, supplier, unit cost (PHP per unit)
CREATE TEMP TABLE seed_ingredients (
  name text, unit text, reorder_level numeric, opening_stock numeric, supplier text, unit_cost numeric
) ON COMMIT DROP;

INSERT INTO seed_ingredients VALUES
  -- Coffee & tea
  ('Espresso beans',              'g',    2000,  12000, 'Cebu Coffee Roasters',        1.20),
  ('Brewed coffee beans',         'g',    1000,   5000, 'Cebu Coffee Roasters',        0.90),
  ('Cold brew concentrate',       'ml',   3000,  15000, 'Cebu Coffee Roasters',        0.35),
  ('Frappe roast',                'g',     300,   1500, 'Cebu Coffee Roasters',        1.50),
  ('Matcha powder',               'g',     300,   1500, 'Cebu Coffee Roasters',        3.50),
  ('Hojicha powder',              'g',     200,   1000, 'Cebu Coffee Roasters',        3.00),
  ('Chai concentrate',            'ml',   1500,   6000, 'Cebu Coffee Roasters',        0.40),
  ('Black tea bags',              'pcs',    50,    300, 'Cebu Coffee Roasters',        6.00),
  ('Earl Grey tea bags',          'pcs',    50,    200, 'Cebu Coffee Roasters',        8.00),
  ('Assam tea leaves',            'g',     500,   3000, 'Cebu Coffee Roasters',        0.80),
  ('Iced tea concentrate',        'ml',   2000,  10000, 'Cebu Coffee Roasters',        0.15),
  -- Milks & creams
  ('Fresh milk',                  'ml',  10000,  60000, 'Bukidnon Dairy Co.',          0.09),
  ('Condensed milk',              'ml',   1500,   6000, 'Bukidnon Dairy Co.',          0.18),
  ('Heavy cream',                 'ml',   1500,   6000, 'Bukidnon Dairy Co.',          0.30),
  ('Whipped cream',               'g',    1500,   6000, 'Bukidnon Dairy Co.',          0.35),
  ('Vanilla sweet cream',         'ml',   1000,   4000, 'Bukidnon Dairy Co.',          0.32),
  ('Vanilla ice cream',           'g',    1000,   5000, 'Bukidnon Dairy Co.',          0.25),
  ('Oat milk',                    'ml',   3000,  12000, 'Visayas Cafe Supplies',       0.20),
  ('Almond milk',                 'ml',   2000,   8000, 'Visayas Cafe Supplies',       0.22),
  ('Coconut milk',                'ml',   3000,  12000, 'Visayas Cafe Supplies',       0.15),
  ('Non-dairy creamer',           'g',    1000,   5000, 'Visayas Cafe Supplies',       0.20),
  -- Syrups & sauces
  ('Sugar syrup',                 'ml',   1500,   6000, 'Visayas Cafe Supplies',       0.10),
  ('Vanilla syrup',               'ml',   1000,   4000, 'Visayas Cafe Supplies',       0.35),
  ('Caramel syrup',               'ml',   1000,   4000, 'Visayas Cafe Supplies',       0.35),
  ('Hazelnut syrup',              'ml',    750,   3000, 'Visayas Cafe Supplies',       0.40),
  ('Toffee nut syrup',            'ml',    750,   2500, 'Visayas Cafe Supplies',       0.40),
  ('Cinnamon dolce syrup',        'ml',    750,   2500, 'Visayas Cafe Supplies',       0.40),
  ('Brown sugar syrup',           'ml',   1000,   4000, 'Visayas Cafe Supplies',       0.30),
  ('Salted caramel syrup',        'ml',    750,   3000, 'Visayas Cafe Supplies',       0.40),
  ('Peppermint syrup',            'ml',    500,   1500, 'Visayas Cafe Supplies',       0.40),
  ('Pumpkin spice sauce',         'ml',    500,   2000, 'Visayas Cafe Supplies',       0.50),
  ('Ube syrup',                   'ml',    750,   3000, 'Visayas Cafe Supplies',       0.45),
  ('Pandan syrup',                'ml',    500,   2000, 'Visayas Cafe Supplies',       0.40),
  ('Wintermelon syrup',           'ml',   1000,   4000, 'Visayas Cafe Supplies',       0.25),
  ('Lychee syrup',                'ml',    500,   2000, 'Visayas Cafe Supplies',       0.35),
  ('Peach syrup',                 'ml',    500,   2000, 'Visayas Cafe Supplies',       0.35),
  ('Blue lemonade syrup',         'ml',    500,   1500, 'Visayas Cafe Supplies',       0.35),
  ('Honey',                       'ml',    500,   2000, 'Visayas Cafe Supplies',       0.60),
  ('Mocha sauce',                 'ml',   1500,   6000, 'Visayas Cafe Supplies',       0.35),
  ('White chocolate sauce',       'ml',   1000,   4000, 'Visayas Cafe Supplies',       0.45),
  ('Caramel drizzle',             'ml',    500,   2000, 'Visayas Cafe Supplies',       0.40),
  -- Powders, toppings & add-ins
  ('Coffee frappe base',          'g',    1000,   5000, 'Visayas Cafe Supplies',       0.80),
  ('Creme frappe base',           'g',    1000,   5000, 'Visayas Cafe Supplies',       0.80),
  ('Vanilla bean powder',         'g',     200,    800, 'Visayas Cafe Supplies',       2.50),
  ('Cocoa powder',                'g',     500,   3000, 'Visayas Cafe Supplies',       0.70),
  ('Cinnamon powder',             'g',     100,    500, 'Visayas Cafe Supplies',       0.90),
  ('Cinnamon dolce topping',      'g',     100,    400, 'Visayas Cafe Supplies',       1.00),
  ('Sea salt flakes',             'g',     100,    500, 'Visayas Cafe Supplies',       0.50),
  ('Chocolate chips',             'g',     500,   3000, 'Visayas Cafe Supplies',       0.60),
  ('Chocolate cookie crumbs',     'g',     500,   2500, 'Visayas Cafe Supplies',       0.50),
  ('Graham crumbs',               'g',     500,   2500, 'Visayas Cafe Supplies',       0.30),
  ('Cookie butter',               'g',     500,   2000, 'Visayas Cafe Supplies',       0.70),
  ('Taro powder',                 'g',     500,   3000, 'Visayas Cafe Supplies',       0.60),
  ('Cream cheese foam powder',    'g',     300,   1500, 'Visayas Cafe Supplies',       0.90),
  ('Tapioca pearls',              'g',    2000,  10000, 'Visayas Cafe Supplies',       0.15),
  ('Nata de coco',                'g',    1000,   5000, 'Visayas Cafe Supplies',       0.12),
  ('Coffee jelly',                'g',    1000,   4000, 'Visayas Cafe Supplies',       0.20),
  -- Refresher bases, purees & sodas
  ('Strawberry acai base',        'ml',   1500,   8000, 'Visayas Cafe Supplies',       0.40),
  ('Mango dragonfruit base',      'ml',   1500,   8000, 'Visayas Cafe Supplies',       0.40),
  ('Pineapple passionfruit base', 'ml',   1500,   8000, 'Visayas Cafe Supplies',       0.40),
  ('Lemonade base',               'ml',   2000,  10000, 'Visayas Cafe Supplies',       0.12),
  ('Strawberry puree',            'ml',    750,   4000, 'Visayas Cafe Supplies',       0.45),
  ('Mango puree',                 'ml',    750,   4000, 'Visayas Cafe Supplies',       0.40),
  ('Blueberry puree',             'ml',    500,   2000, 'Visayas Cafe Supplies',       0.55),
  ('Freeze-dried strawberries',   'g',     100,    600, 'Visayas Cafe Supplies',       4.00),
  ('Freeze-dried dragonfruit',    'g',     100,    600, 'Visayas Cafe Supplies',       4.50),
  ('Freeze-dried pineapple',      'g',     100,    600, 'Visayas Cafe Supplies',       4.00),
  ('Soda water',                  'ml',   2000,  10000, 'Visayas Cafe Supplies',       0.05),
  -- Fresh fruit & juices
  ('Fresh orange juice',          'ml',   2000,   8000, 'Carbon Market Fruit Traders', 0.20),
  ('Calamansi juice',             'ml',    500,   2000, 'Carbon Market Fruit Traders', 0.25),
  ('Pineapple juice',             'ml',   1500,   6000, 'Carbon Market Fruit Traders', 0.12),
  ('Buko water',                  'ml',   2000,   8000, 'Carbon Market Fruit Traders', 0.10),
  ('Ripe mangoes',                'g',    2000,  10000, 'Carbon Market Fruit Traders', 0.12),
  ('Watermelon',                  'g',    2000,  10000, 'Carbon Market Fruit Traders', 0.04),
  ('Avocado',                     'g',    1000,   5000, 'Carbon Market Fruit Traders', 0.15),
  ('Bananas',                     'g',    1000,   5000, 'Carbon Market Fruit Traders', 0.06),
  ('Frozen strawberries',         'g',    1000,   4000, 'Carbon Market Fruit Traders', 0.30),
  ('Cucumber',                    'g',     500,   2000, 'Carbon Market Fruit Traders', 0.08),
  ('Mint leaves',                 'g',     100,    400, 'Carbon Market Fruit Traders', 0.80),
  ('Lemon wedges',                'pcs',    50,    300, 'Carbon Market Fruit Traders', 3.00),
  -- Ice
  ('Ice',                         'g',   20000, 100000, 'Cebu Tube Ice Plant',         0.01),
  -- Packaging
  ('Espresso cups 4oz',           'pcs',    50,    300, 'Pacific Packaging Solutions', 3.00),
  ('Hot cups 8oz',                'pcs',   100,    500, 'Pacific Packaging Solutions', 3.50),
  ('Hot cups 12oz',               'pcs',   150,    800, 'Pacific Packaging Solutions', 4.50),
  ('Hot cups 16oz',               'pcs',   150,    800, 'Pacific Packaging Solutions', 5.00),
  ('Hot cups 20oz',               'pcs',   100,    500, 'Pacific Packaging Solutions', 5.50),
  ('Hot lids 8oz',                'pcs',   100,    500, 'Pacific Packaging Solutions', 1.50),
  ('Hot lids 12oz',               'pcs',   150,    800, 'Pacific Packaging Solutions', 1.80),
  ('Hot lids 16oz',               'pcs',   150,    800, 'Pacific Packaging Solutions', 2.00),
  ('Hot lids 20oz',               'pcs',   100,    500, 'Pacific Packaging Solutions', 2.20),
  ('Cup sleeves',                 'pcs',   200,   1500, 'Pacific Packaging Solutions', 1.20),
  ('Stirrers',                    'pcs',   300,   2000, 'Pacific Packaging Solutions', 0.20),
  ('Cold cups 12oz',              'pcs',   150,    800, 'Pacific Packaging Solutions', 4.00),
  ('Cold cups 16oz',              'pcs',   200,   1200, 'Pacific Packaging Solutions', 5.00),
  ('Cold cups 24oz',              'pcs',   150,    800, 'Pacific Packaging Solutions', 6.00),
  ('Flat lids',                   'pcs',   300,   2000, 'Pacific Packaging Solutions', 1.50),
  ('Dome lids',                   'pcs',   200,   1000, 'Pacific Packaging Solutions', 2.00),
  ('Straws',                      'pcs',   300,   2500, 'Pacific Packaging Solutions', 0.50),
  ('Wide straws',                 'pcs',   300,   2000, 'Pacific Packaging Solutions', 0.80),
  ('Cup sealing film',            'pcs',   200,   1500, 'Pacific Packaging Solutions', 0.40);

INSERT INTO ingredients (name, unit, reorder_level)
SELECT name, unit, reorder_level FROM seed_ingredients;

INSERT INTO supplier_ingredients (supplier_id, ingredient_id, unit_cost)
SELECT s.id, i.id, si.unit_cost
  FROM seed_ingredients si
  JOIN suppliers   s ON s.name = si.supplier
  JOIN ingredients i ON i.name = si.name;

-- ---------- Sizes -----------------------------------------------------
-- serve: hot / iced / blended / boba. factor scales 's' recipe rows; shots drives 'x' rows.
CREATE TEMP TABLE seed_sizes (
  pos serial, serve text, size text, oz int, factor numeric, shots int, price_delta numeric
) ON COMMIT DROP;

INSERT INTO seed_sizes (serve, size, oz, factor, shots, price_delta) VALUES
  ('hot',     'Tall',   12, 0.75, 1, -20), ('hot',     'Grande', 16, 1.00, 2, 0), ('hot',     'Venti', 20, 1.25, 2, 20),
  ('iced',    'Tall',   12, 0.75, 1, -20), ('iced',    'Grande', 16, 1.00, 2, 0), ('iced',    'Venti', 24, 1.50, 3, 30),
  ('blended', 'Tall',   12, 0.75, 1, -20), ('blended', 'Grande', 16, 1.00, 2, 0), ('blended', 'Venti', 24, 1.50, 2, 30),
  ('boba',    'Tall',   12, 0.75, 1, -20), ('boba',    'Grande', 16, 1.00, 2, 0), ('boba',    'Venti', 24, 1.50, 2, 30);

-- Cups, lids and straws per serve style and cup size
CREATE TEMP TABLE seed_packaging (serve text, oz int, ingredient text, qty numeric) ON COMMIT DROP;

INSERT INTO seed_packaging
SELECT v.serve, v.oz, v.ingredient, 1
  FROM (VALUES
    ('hot', 12, 'Hot cups 12oz'), ('hot', 12, 'Hot lids 12oz'), ('hot', 12, 'Cup sleeves'), ('hot', 12, 'Stirrers'),
    ('hot', 16, 'Hot cups 16oz'), ('hot', 16, 'Hot lids 16oz'), ('hot', 16, 'Cup sleeves'), ('hot', 16, 'Stirrers'),
    ('hot', 20, 'Hot cups 20oz'), ('hot', 20, 'Hot lids 20oz'), ('hot', 20, 'Cup sleeves'), ('hot', 20, 'Stirrers'),
    ('iced', 12, 'Cold cups 12oz'), ('iced', 12, 'Flat lids'), ('iced', 12, 'Straws'),
    ('iced', 16, 'Cold cups 16oz'), ('iced', 16, 'Flat lids'), ('iced', 16, 'Straws'),
    ('iced', 24, 'Cold cups 24oz'), ('iced', 24, 'Flat lids'), ('iced', 24, 'Straws'),
    ('blended', 12, 'Cold cups 12oz'), ('blended', 12, 'Dome lids'), ('blended', 12, 'Wide straws'),
    ('blended', 16, 'Cold cups 16oz'), ('blended', 16, 'Dome lids'), ('blended', 16, 'Wide straws'),
    ('blended', 24, 'Cold cups 24oz'), ('blended', 24, 'Dome lids'), ('blended', 24, 'Wide straws'),
    ('boba', 12, 'Cold cups 12oz'), ('boba', 12, 'Cup sealing film'), ('boba', 12, 'Wide straws'),
    ('boba', 16, 'Cold cups 16oz'), ('boba', 16, 'Cup sealing film'), ('boba', 16, 'Wide straws'),
    ('boba', 24, 'Cold cups 24oz'), ('boba', 24, 'Cup sealing film'), ('boba', 24, 'Wide straws')
  ) AS v(serve, oz, ingredient);

-- ---------- Sized drinks (price shown is the Grande price) ------------
-- Tall = Grande - 20; Venti = Grande + 20 (hot) or + 30 (cold)
CREATE TEMP TABLE seed_drinks (
  pos serial, category text, name text, serve text, grande_price numeric, description text
) ON COMMIT DROP;

INSERT INTO seed_drinks (category, name, serve, grande_price, description) VALUES
  -- Hot Coffee
  ('Hot Coffee', 'Brewed Coffee',               'hot', 110, 'Freshly brewed medium roast.'),
  ('Hot Coffee', 'Americano',                   'hot', 130, 'Espresso topped with hot water.'),
  ('Hot Coffee', 'Cappuccino',                  'hot', 150, 'Espresso with steamed milk and a thick layer of foam.'),
  ('Hot Coffee', 'Caffe Latte',                 'hot', 150, 'Espresso with steamed milk and light foam.'),
  ('Hot Coffee', 'Flat White',                  'hot', 165, 'Ristretto shots with velvety microfoam.'),
  ('Hot Coffee', 'Vanilla Latte',               'hot', 165, 'Caffe latte sweetened with vanilla syrup.'),
  ('Hot Coffee', 'Hazelnut Latte',              'hot', 165, 'Caffe latte with hazelnut syrup.'),
  ('Hot Coffee', 'Toffee Nut Latte',            'hot', 170, 'Latte with toffee nut syrup and whipped cream.'),
  ('Hot Coffee', 'Cinnamon Dolce Latte',        'hot', 170, 'Cinnamon dolce latte with whipped cream and cinnamon topping.'),
  ('Hot Coffee', 'Caramel Macchiato',           'hot', 175, 'Vanilla, steamed milk, espresso and caramel drizzle.'),
  ('Hot Coffee', 'Caffe Mocha',                 'hot', 175, 'Espresso, mocha sauce, steamed milk and whipped cream.'),
  ('Hot Coffee', 'White Chocolate Mocha',       'hot', 180, 'Espresso, white chocolate sauce, milk and whipped cream.'),
  ('Hot Coffee', 'Spanish Latte',               'hot', 170, 'Espresso with steamed milk and condensed milk.'),
  ('Hot Coffee', 'Salted Caramel Latte',        'hot', 175, 'Latte with salted caramel syrup and a pinch of sea salt.'),
  ('Hot Coffee', 'Peppermint Mocha',            'hot', 185, 'Mocha with peppermint syrup and whipped cream.'),
  ('Hot Coffee', 'Pumpkin Spice Latte',         'hot', 185, 'Pumpkin spice sauce, espresso, milk and whipped cream.'),
  ('Hot Coffee', 'Ube Latte',                   'hot', 175, 'Espresso and steamed milk with purple yam syrup.'),
  ('Hot Coffee', 'Almondmilk Honey Flat White', 'hot', 180, 'Ristretto shots with almond milk and honey.'),
  -- Iced Coffee
  ('Iced Coffee', 'Iced Americano',                 'iced', 140, 'Espresso and cold water over ice.'),
  ('Iced Coffee', 'Iced Caffe Latte',               'iced', 160, 'Espresso and cold milk over ice.'),
  ('Iced Coffee', 'Iced Vanilla Latte',             'iced', 175, 'Iced latte with vanilla syrup.'),
  ('Iced Coffee', 'Iced Caramel Macchiato',         'iced', 185, 'Vanilla, cold milk, espresso and caramel drizzle over ice.'),
  ('Iced Coffee', 'Iced Caffe Mocha',               'iced', 185, 'Espresso, mocha sauce and milk over ice.'),
  ('Iced Coffee', 'Iced White Chocolate Mocha',     'iced', 190, 'Espresso, white chocolate sauce and milk over ice.'),
  ('Iced Coffee', 'Iced Spanish Latte',             'iced', 180, 'Espresso, milk and condensed milk over ice.'),
  ('Iced Coffee', 'Iced Salted Caramel Latte',      'iced', 185, 'Iced latte with salted caramel syrup.'),
  ('Iced Coffee', 'Iced Ube Latte',                 'iced', 185, 'Espresso, cold milk and purple yam syrup over ice.'),
  ('Iced Coffee', 'Iced Pandan Latte',              'iced', 185, 'Espresso, cold milk and pandan syrup over ice.'),
  ('Iced Coffee', 'Iced Cookie Butter Latte',       'iced', 195, 'Espresso and milk blended with cookie butter over ice.'),
  ('Iced Coffee', 'Brown Sugar Oat Shaken Espresso','iced', 195, 'Espresso shaken with brown sugar and cinnamon, topped with oat milk.'),
  ('Iced Coffee', 'Cold Brew',                      'iced', 160, 'Slow-steeped for 18 hours, smooth and bold.'),
  ('Iced Coffee', 'Vanilla Sweet Cream Cold Brew',  'iced', 185, 'Cold brew topped with vanilla sweet cream.'),
  ('Iced Coffee', 'Salted Caramel Cream Cold Brew', 'iced', 195, 'Cold brew with salted caramel cream and sea salt.'),
  -- Frappes
  ('Frappes', 'Coffee Frappe',                'blended', 180, 'Coffee blended with milk and ice.'),
  ('Frappes', 'Caramel Frappe',               'blended', 195, 'Coffee and caramel blended, with whipped cream and drizzle.'),
  ('Frappes', 'Mocha Frappe',                 'blended', 195, 'Coffee and mocha sauce blended, with whipped cream.'),
  ('Frappes', 'Java Chip Frappe',             'blended', 210, 'Coffee, mocha sauce and chocolate chips blended.'),
  ('Frappes', 'White Chocolate Mocha Frappe', 'blended', 205, 'Coffee and white chocolate blended, with whipped cream.'),
  ('Frappes', 'Coffee Jelly Frappe',          'blended', 205, 'Coffee frappe with coffee jelly cubes.'),
  ('Frappes', 'Vanilla Cream Frappe',         'blended', 185, 'Vanilla bean blended with milk and ice, no coffee.'),
  ('Frappes', 'Strawberry Cream Frappe',      'blended', 200, 'Strawberry puree blended with milk and ice.'),
  ('Frappes', 'Matcha Cream Frappe',          'blended', 205, 'Matcha blended with milk and ice.'),
  ('Frappes', 'Double Chocolate Chip Frappe', 'blended', 210, 'Mocha sauce and chocolate chips blended, no coffee.'),
  ('Frappes', 'Cookies and Cream Frappe',     'blended', 210, 'Chocolate cookie crumbs blended with vanilla cream.'),
  ('Frappes', 'Mango Graham Frappe',          'blended', 210, 'Mango puree and graham crumbs blended with cream.'),
  -- Matcha & Tea
  ('Matcha & Tea', 'Matcha Latte',            'hot',  175, 'Stone-ground matcha with steamed milk.'),
  ('Matcha & Tea', 'Hojicha Latte',           'hot',  175, 'Roasted green tea with steamed milk.'),
  ('Matcha & Tea', 'Chai Tea Latte',          'hot',  165, 'Spiced chai with steamed milk.'),
  ('Matcha & Tea', 'London Fog Tea Latte',    'hot',  165, 'Earl Grey with steamed milk and vanilla.'),
  ('Matcha & Tea', 'Hot Black Tea',           'hot',  100, 'Freshly brewed black tea.'),
  ('Matcha & Tea', 'Iced Matcha Latte',       'iced', 185, 'Matcha with cold milk over ice.'),
  ('Matcha & Tea', 'Strawberry Matcha Latte', 'iced', 195, 'Strawberry puree, milk and matcha over ice.'),
  ('Matcha & Tea', 'Dirty Matcha',            'iced', 195, 'Iced matcha latte with espresso shots.'),
  ('Matcha & Tea', 'Iced Hojicha Latte',      'iced', 185, 'Roasted green tea with cold milk over ice.'),
  ('Matcha & Tea', 'Iced Chai Tea Latte',     'iced', 175, 'Spiced chai with cold milk over ice.'),
  ('Matcha & Tea', 'Iced Lemon Tea',          'iced', 130, 'Black iced tea with lemon.'),
  ('Matcha & Tea', 'Lychee Iced Tea',         'iced', 150, 'Black iced tea with lychee syrup.'),
  ('Matcha & Tea', 'Peach Iced Tea',          'iced', 150, 'Black iced tea with peach syrup.'),
  -- Milk Tea
  ('Milk Tea', 'Classic Milk Tea',             'boba', 140, 'Assam milk tea with tapioca pearls.'),
  ('Milk Tea', 'Wintermelon Milk Tea',         'boba', 150, 'Wintermelon milk tea with tapioca pearls.'),
  ('Milk Tea', 'Taro Milk Tea',                'boba', 160, 'Creamy taro milk tea with tapioca pearls.'),
  ('Milk Tea', 'Okinawa Milk Tea',             'boba', 160, 'Roasted brown sugar milk tea with tapioca pearls.'),
  ('Milk Tea', 'Brown Sugar Boba Milk',        'boba', 170, 'Fresh milk with brown sugar syrup and pearls.'),
  ('Milk Tea', 'Cream Cheese Wintermelon Tea', 'boba', 165, 'Wintermelon tea topped with cream cheese foam.'),
  ('Milk Tea', 'Nata Lychee Tea',              'boba', 150, 'Lychee iced tea with nata de coco.'),
  -- Chocolate
  ('Chocolate', 'Hot Chocolate',  'hot',  160, 'Rich chocolate with steamed milk and whipped cream.'),
  ('Chocolate', 'Iced Chocolate', 'iced', 170, 'Chocolate and cold milk over ice.'),
  -- Refreshers
  ('Refreshers', 'Strawberry Acai Refresher',        'iced', 165, 'Strawberry acai base shaken with ice and strawberries.'),
  ('Refreshers', 'Mango Dragonfruit Refresher',      'iced', 165, 'Mango dragonfruit base shaken with ice and dragonfruit.'),
  ('Refreshers', 'Pineapple Passionfruit Refresher', 'iced', 165, 'Pineapple passionfruit base shaken with ice.'),
  ('Refreshers', 'Strawberry Acai Lemonade',         'iced', 180, 'Strawberry acai refresher shaken with lemonade.'),
  ('Refreshers', 'Mango Dragonfruit Lemonade',       'iced', 180, 'Mango dragonfruit refresher shaken with lemonade.'),
  ('Refreshers', 'Pink Drink',                       'iced', 190, 'Strawberry acai with coconut milk.'),
  ('Refreshers', 'Dragon Drink',                     'iced', 190, 'Mango dragonfruit with coconut milk.'),
  ('Refreshers', 'Paradise Drink',                   'iced', 190, 'Pineapple passionfruit with coconut milk.'),
  -- Juices & Shakes
  ('Juices & Shakes', 'Fresh Orange Juice',         'iced',    150, 'Freshly squeezed orange juice.'),
  ('Juices & Shakes', 'Calamansi Juice',            'iced',    110, 'Sweetened calamansi juice over ice.'),
  ('Juices & Shakes', 'Pineapple Juice',            'iced',    130, 'Chilled pineapple juice.'),
  ('Juices & Shakes', 'Buko Juice',                 'iced',    130, 'Fresh young coconut water.'),
  ('Juices & Shakes', 'Classic Lemonade',           'iced',    120, 'House lemonade with a lemon wedge.'),
  ('Juices & Shakes', 'Cucumber Mint Lemonade',     'iced',    140, 'Lemonade with cucumber and fresh mint.'),
  ('Juices & Shakes', 'Blueberry Lemonade',         'iced',    150, 'Lemonade with blueberry puree.'),
  ('Juices & Shakes', 'Strawberry Italian Soda',    'iced',    140, 'Strawberry puree with sparkling soda water.'),
  ('Juices & Shakes', 'Blue Lemonade Soda',         'iced',    140, 'Blue lemonade syrup with lemonade and soda water.'),
  ('Juices & Shakes', 'Mango Shake',                'blended', 170, 'Ripe mangoes blended with condensed milk and ice.'),
  ('Juices & Shakes', 'Watermelon Shake',           'blended', 150, 'Fresh watermelon blended with ice.'),
  ('Juices & Shakes', 'Avocado Shake',              'blended', 170, 'Avocado blended with milk and condensed milk.'),
  ('Juices & Shakes', 'Strawberry Banana Smoothie', 'blended', 180, 'Strawberries and banana blended with milk and honey.');

INSERT INTO products (category_id, name, description, product_type, price)
SELECT c.id, d.name || ' (' || s.size || ' ' || s.oz || 'oz)', d.description, 'prepared', d.grande_price + s.price_delta
  FROM seed_drinks d
  JOIN seed_sizes  s ON s.serve = d.serve
  JOIN categories  c ON c.name = d.category
 ORDER BY c.sort_order, d.pos, s.pos;

-- ---------- Recipes for sized drinks (Grande amounts) -----------------
CREATE TEMP TABLE seed_recipes (drink text, ingredient text, qty numeric, kind char(1)) ON COMMIT DROP;

INSERT INTO seed_recipes VALUES
  -- Hot Coffee
  ('Brewed Coffee', 'Brewed coffee beans', 22, 's'),
  ('Americano', 'Espresso beans', 9, 'x'),
  ('Cappuccino', 'Espresso beans', 9, 'x'), ('Cappuccino', 'Fresh milk', 180, 's'),
  ('Caffe Latte', 'Espresso beans', 9, 'x'), ('Caffe Latte', 'Fresh milk', 280, 's'),
  ('Flat White', 'Espresso beans', 10, 'x'), ('Flat White', 'Fresh milk', 240, 's'),
  ('Vanilla Latte', 'Espresso beans', 9, 'x'), ('Vanilla Latte', 'Fresh milk', 260, 's'), ('Vanilla Latte', 'Vanilla syrup', 30, 's'),
  ('Hazelnut Latte', 'Espresso beans', 9, 'x'), ('Hazelnut Latte', 'Fresh milk', 260, 's'), ('Hazelnut Latte', 'Hazelnut syrup', 30, 's'),
  ('Toffee Nut Latte', 'Espresso beans', 9, 'x'), ('Toffee Nut Latte', 'Fresh milk', 250, 's'), ('Toffee Nut Latte', 'Toffee nut syrup', 30, 's'), ('Toffee Nut Latte', 'Whipped cream', 20, 'f'),
  ('Cinnamon Dolce Latte', 'Espresso beans', 9, 'x'), ('Cinnamon Dolce Latte', 'Fresh milk', 250, 's'), ('Cinnamon Dolce Latte', 'Cinnamon dolce syrup', 30, 's'), ('Cinnamon Dolce Latte', 'Whipped cream', 20, 'f'), ('Cinnamon Dolce Latte', 'Cinnamon dolce topping', 1, 'f'),
  ('Caramel Macchiato', 'Espresso beans', 9, 'x'), ('Caramel Macchiato', 'Fresh milk', 260, 's'), ('Caramel Macchiato', 'Vanilla syrup', 20, 's'), ('Caramel Macchiato', 'Caramel drizzle', 10, 'f'),
  ('Caffe Mocha', 'Espresso beans', 9, 'x'), ('Caffe Mocha', 'Fresh milk', 240, 's'), ('Caffe Mocha', 'Mocha sauce', 40, 's'), ('Caffe Mocha', 'Whipped cream', 20, 'f'),
  ('White Chocolate Mocha', 'Espresso beans', 9, 'x'), ('White Chocolate Mocha', 'Fresh milk', 240, 's'), ('White Chocolate Mocha', 'White chocolate sauce', 40, 's'), ('White Chocolate Mocha', 'Whipped cream', 20, 'f'),
  ('Spanish Latte', 'Espresso beans', 9, 'x'), ('Spanish Latte', 'Fresh milk', 240, 's'), ('Spanish Latte', 'Condensed milk', 40, 's'),
  ('Salted Caramel Latte', 'Espresso beans', 9, 'x'), ('Salted Caramel Latte', 'Fresh milk', 250, 's'), ('Salted Caramel Latte', 'Salted caramel syrup', 30, 's'), ('Salted Caramel Latte', 'Sea salt flakes', 0.5, 'f'), ('Salted Caramel Latte', 'Caramel drizzle', 5, 'f'),
  ('Peppermint Mocha', 'Espresso beans', 9, 'x'), ('Peppermint Mocha', 'Fresh milk', 240, 's'), ('Peppermint Mocha', 'Mocha sauce', 30, 's'), ('Peppermint Mocha', 'Peppermint syrup', 20, 's'), ('Peppermint Mocha', 'Whipped cream', 20, 'f'),
  ('Pumpkin Spice Latte', 'Espresso beans', 9, 'x'), ('Pumpkin Spice Latte', 'Fresh milk', 250, 's'), ('Pumpkin Spice Latte', 'Pumpkin spice sauce', 40, 's'), ('Pumpkin Spice Latte', 'Whipped cream', 20, 'f'), ('Pumpkin Spice Latte', 'Cinnamon powder', 0.5, 'f'),
  ('Ube Latte', 'Espresso beans', 9, 'x'), ('Ube Latte', 'Fresh milk', 250, 's'), ('Ube Latte', 'Ube syrup', 35, 's'),
  ('Almondmilk Honey Flat White', 'Espresso beans', 10, 'x'), ('Almondmilk Honey Flat White', 'Almond milk', 240, 's'), ('Almondmilk Honey Flat White', 'Honey', 20, 's'),
  -- Iced Coffee
  ('Iced Americano', 'Espresso beans', 9, 'x'), ('Iced Americano', 'Ice', 200, 's'),
  ('Iced Caffe Latte', 'Espresso beans', 9, 'x'), ('Iced Caffe Latte', 'Fresh milk', 220, 's'), ('Iced Caffe Latte', 'Ice', 180, 's'),
  ('Iced Vanilla Latte', 'Espresso beans', 9, 'x'), ('Iced Vanilla Latte', 'Fresh milk', 200, 's'), ('Iced Vanilla Latte', 'Vanilla syrup', 30, 's'), ('Iced Vanilla Latte', 'Ice', 180, 's'),
  ('Iced Caramel Macchiato', 'Espresso beans', 9, 'x'), ('Iced Caramel Macchiato', 'Fresh milk', 200, 's'), ('Iced Caramel Macchiato', 'Vanilla syrup', 20, 's'), ('Iced Caramel Macchiato', 'Caramel drizzle', 15, 'f'), ('Iced Caramel Macchiato', 'Ice', 180, 's'),
  ('Iced Caffe Mocha', 'Espresso beans', 9, 'x'), ('Iced Caffe Mocha', 'Fresh milk', 190, 's'), ('Iced Caffe Mocha', 'Mocha sauce', 40, 's'), ('Iced Caffe Mocha', 'Whipped cream', 20, 'f'), ('Iced Caffe Mocha', 'Ice', 180, 's'),
  ('Iced White Chocolate Mocha', 'Espresso beans', 9, 'x'), ('Iced White Chocolate Mocha', 'Fresh milk', 190, 's'), ('Iced White Chocolate Mocha', 'White chocolate sauce', 40, 's'), ('Iced White Chocolate Mocha', 'Whipped cream', 20, 'f'), ('Iced White Chocolate Mocha', 'Ice', 180, 's'),
  ('Iced Spanish Latte', 'Espresso beans', 9, 'x'), ('Iced Spanish Latte', 'Fresh milk', 190, 's'), ('Iced Spanish Latte', 'Condensed milk', 40, 's'), ('Iced Spanish Latte', 'Ice', 180, 's'),
  ('Iced Salted Caramel Latte', 'Espresso beans', 9, 'x'), ('Iced Salted Caramel Latte', 'Fresh milk', 200, 's'), ('Iced Salted Caramel Latte', 'Salted caramel syrup', 30, 's'), ('Iced Salted Caramel Latte', 'Sea salt flakes', 0.5, 'f'), ('Iced Salted Caramel Latte', 'Ice', 180, 's'),
  ('Iced Ube Latte', 'Espresso beans', 9, 'x'), ('Iced Ube Latte', 'Fresh milk', 200, 's'), ('Iced Ube Latte', 'Ube syrup', 35, 's'), ('Iced Ube Latte', 'Ice', 180, 's'),
  ('Iced Pandan Latte', 'Espresso beans', 9, 'x'), ('Iced Pandan Latte', 'Fresh milk', 200, 's'), ('Iced Pandan Latte', 'Pandan syrup', 30, 's'), ('Iced Pandan Latte', 'Ice', 180, 's'),
  ('Iced Cookie Butter Latte', 'Espresso beans', 9, 'x'), ('Iced Cookie Butter Latte', 'Fresh milk', 200, 's'), ('Iced Cookie Butter Latte', 'Cookie butter', 25, 's'), ('Iced Cookie Butter Latte', 'Ice', 180, 's'),
  ('Brown Sugar Oat Shaken Espresso', 'Espresso beans', 13.5, 'x'), ('Brown Sugar Oat Shaken Espresso', 'Oat milk', 150, 's'), ('Brown Sugar Oat Shaken Espresso', 'Brown sugar syrup', 30, 's'), ('Brown Sugar Oat Shaken Espresso', 'Cinnamon powder', 0.5, 'f'), ('Brown Sugar Oat Shaken Espresso', 'Ice', 200, 's'),
  ('Cold Brew', 'Cold brew concentrate', 180, 's'), ('Cold Brew', 'Ice', 180, 's'),
  ('Vanilla Sweet Cream Cold Brew', 'Cold brew concentrate', 160, 's'), ('Vanilla Sweet Cream Cold Brew', 'Vanilla sweet cream', 40, 's'), ('Vanilla Sweet Cream Cold Brew', 'Ice', 160, 's'),
  ('Salted Caramel Cream Cold Brew', 'Cold brew concentrate', 160, 's'), ('Salted Caramel Cream Cold Brew', 'Heavy cream', 30, 's'), ('Salted Caramel Cream Cold Brew', 'Salted caramel syrup', 25, 's'), ('Salted Caramel Cream Cold Brew', 'Sea salt flakes', 0.5, 'f'), ('Salted Caramel Cream Cold Brew', 'Ice', 160, 's'),
  -- Frappes
  ('Coffee Frappe', 'Frappe roast', 6, 's'), ('Coffee Frappe', 'Coffee frappe base', 35, 's'), ('Coffee Frappe', 'Fresh milk', 180, 's'), ('Coffee Frappe', 'Sugar syrup', 20, 's'), ('Coffee Frappe', 'Ice', 280, 's'),
  ('Caramel Frappe', 'Frappe roast', 6, 's'), ('Caramel Frappe', 'Coffee frappe base', 35, 's'), ('Caramel Frappe', 'Fresh milk', 170, 's'), ('Caramel Frappe', 'Caramel syrup', 30, 's'), ('Caramel Frappe', 'Whipped cream', 25, 'f'), ('Caramel Frappe', 'Caramel drizzle', 10, 'f'), ('Caramel Frappe', 'Ice', 280, 's'),
  ('Mocha Frappe', 'Frappe roast', 6, 's'), ('Mocha Frappe', 'Coffee frappe base', 35, 's'), ('Mocha Frappe', 'Fresh milk', 170, 's'), ('Mocha Frappe', 'Mocha sauce', 35, 's'), ('Mocha Frappe', 'Whipped cream', 25, 'f'), ('Mocha Frappe', 'Ice', 280, 's'),
  ('Java Chip Frappe', 'Frappe roast', 6, 's'), ('Java Chip Frappe', 'Coffee frappe base', 35, 's'), ('Java Chip Frappe', 'Fresh milk', 170, 's'), ('Java Chip Frappe', 'Mocha sauce', 30, 's'), ('Java Chip Frappe', 'Chocolate chips', 20, 's'), ('Java Chip Frappe', 'Whipped cream', 25, 'f'), ('Java Chip Frappe', 'Ice', 280, 's'),
  ('White Chocolate Mocha Frappe', 'Frappe roast', 6, 's'), ('White Chocolate Mocha Frappe', 'Coffee frappe base', 35, 's'), ('White Chocolate Mocha Frappe', 'Fresh milk', 170, 's'), ('White Chocolate Mocha Frappe', 'White chocolate sauce', 35, 's'), ('White Chocolate Mocha Frappe', 'Whipped cream', 25, 'f'), ('White Chocolate Mocha Frappe', 'Ice', 280, 's'),
  ('Coffee Jelly Frappe', 'Frappe roast', 6, 's'), ('Coffee Jelly Frappe', 'Coffee frappe base', 35, 's'), ('Coffee Jelly Frappe', 'Fresh milk', 170, 's'), ('Coffee Jelly Frappe', 'Coffee jelly', 60, 's'), ('Coffee Jelly Frappe', 'Sugar syrup', 15, 's'), ('Coffee Jelly Frappe', 'Whipped cream', 25, 'f'), ('Coffee Jelly Frappe', 'Ice', 280, 's'),
  ('Vanilla Cream Frappe', 'Creme frappe base', 35, 's'), ('Vanilla Cream Frappe', 'Fresh milk', 190, 's'), ('Vanilla Cream Frappe', 'Vanilla syrup', 30, 's'), ('Vanilla Cream Frappe', 'Vanilla bean powder', 2, 's'), ('Vanilla Cream Frappe', 'Whipped cream', 25, 'f'), ('Vanilla Cream Frappe', 'Ice', 280, 's'),
  ('Strawberry Cream Frappe', 'Creme frappe base', 35, 's'), ('Strawberry Cream Frappe', 'Fresh milk', 180, 's'), ('Strawberry Cream Frappe', 'Strawberry puree', 50, 's'), ('Strawberry Cream Frappe', 'Whipped cream', 25, 'f'), ('Strawberry Cream Frappe', 'Ice', 280, 's'),
  ('Matcha Cream Frappe', 'Creme frappe base', 35, 's'), ('Matcha Cream Frappe', 'Fresh milk', 190, 's'), ('Matcha Cream Frappe', 'Matcha powder', 6, 's'), ('Matcha Cream Frappe', 'Sugar syrup', 20, 's'), ('Matcha Cream Frappe', 'Whipped cream', 25, 'f'), ('Matcha Cream Frappe', 'Ice', 280, 's'),
  ('Double Chocolate Chip Frappe', 'Creme frappe base', 35, 's'), ('Double Chocolate Chip Frappe', 'Fresh milk', 180, 's'), ('Double Chocolate Chip Frappe', 'Mocha sauce', 35, 's'), ('Double Chocolate Chip Frappe', 'Chocolate chips', 20, 's'), ('Double Chocolate Chip Frappe', 'Whipped cream', 25, 'f'), ('Double Chocolate Chip Frappe', 'Ice', 280, 's'),
  ('Cookies and Cream Frappe', 'Creme frappe base', 35, 's'), ('Cookies and Cream Frappe', 'Fresh milk', 180, 's'), ('Cookies and Cream Frappe', 'Chocolate cookie crumbs', 25, 's'), ('Cookies and Cream Frappe', 'Vanilla syrup', 15, 's'), ('Cookies and Cream Frappe', 'Whipped cream', 25, 'f'), ('Cookies and Cream Frappe', 'Ice', 280, 's'),
  ('Mango Graham Frappe', 'Creme frappe base', 35, 's'), ('Mango Graham Frappe', 'Fresh milk', 170, 's'), ('Mango Graham Frappe', 'Mango puree', 60, 's'), ('Mango Graham Frappe', 'Graham crumbs', 15, 's'), ('Mango Graham Frappe', 'Whipped cream', 25, 'f'), ('Mango Graham Frappe', 'Ice', 280, 's'),
  -- Matcha & Tea
  ('Matcha Latte', 'Matcha powder', 5, 's'), ('Matcha Latte', 'Fresh milk', 280, 's'), ('Matcha Latte', 'Sugar syrup', 20, 's'),
  ('Hojicha Latte', 'Hojicha powder', 5, 's'), ('Hojicha Latte', 'Fresh milk', 280, 's'), ('Hojicha Latte', 'Sugar syrup', 20, 's'),
  ('Chai Tea Latte', 'Chai concentrate', 140, 's'), ('Chai Tea Latte', 'Fresh milk', 160, 's'),
  ('London Fog Tea Latte', 'Earl Grey tea bags', 2, 'f'), ('London Fog Tea Latte', 'Fresh milk', 180, 's'), ('London Fog Tea Latte', 'Vanilla syrup', 20, 's'),
  ('Hot Black Tea', 'Black tea bags', 1, 'f'),
  ('Iced Matcha Latte', 'Matcha powder', 5, 's'), ('Iced Matcha Latte', 'Fresh milk', 240, 's'), ('Iced Matcha Latte', 'Sugar syrup', 20, 's'), ('Iced Matcha Latte', 'Ice', 180, 's'),
  ('Strawberry Matcha Latte', 'Matcha powder', 5, 's'), ('Strawberry Matcha Latte', 'Fresh milk', 200, 's'), ('Strawberry Matcha Latte', 'Strawberry puree', 45, 's'), ('Strawberry Matcha Latte', 'Ice', 160, 's'),
  ('Dirty Matcha', 'Matcha powder', 5, 's'), ('Dirty Matcha', 'Fresh milk', 200, 's'), ('Dirty Matcha', 'Espresso beans', 9, 'x'), ('Dirty Matcha', 'Sugar syrup', 15, 's'), ('Dirty Matcha', 'Ice', 160, 's'),
  ('Iced Hojicha Latte', 'Hojicha powder', 5, 's'), ('Iced Hojicha Latte', 'Fresh milk', 240, 's'), ('Iced Hojicha Latte', 'Sugar syrup', 20, 's'), ('Iced Hojicha Latte', 'Ice', 180, 's'),
  ('Iced Chai Tea Latte', 'Chai concentrate', 140, 's'), ('Iced Chai Tea Latte', 'Fresh milk', 140, 's'), ('Iced Chai Tea Latte', 'Ice', 180, 's'),
  ('Iced Lemon Tea', 'Iced tea concentrate', 220, 's'), ('Iced Lemon Tea', 'Sugar syrup', 20, 's'), ('Iced Lemon Tea', 'Lemon wedges', 1, 'f'), ('Iced Lemon Tea', 'Ice', 200, 's'),
  ('Lychee Iced Tea', 'Iced tea concentrate', 200, 's'), ('Lychee Iced Tea', 'Lychee syrup', 30, 's'), ('Lychee Iced Tea', 'Ice', 200, 's'),
  ('Peach Iced Tea', 'Iced tea concentrate', 200, 's'), ('Peach Iced Tea', 'Peach syrup', 30, 's'), ('Peach Iced Tea', 'Ice', 200, 's'),
  -- Milk Tea
  ('Classic Milk Tea', 'Assam tea leaves', 8, 's'), ('Classic Milk Tea', 'Non-dairy creamer', 30, 's'), ('Classic Milk Tea', 'Sugar syrup', 30, 's'), ('Classic Milk Tea', 'Tapioca pearls', 60, 's'), ('Classic Milk Tea', 'Ice', 150, 's'),
  ('Wintermelon Milk Tea', 'Assam tea leaves', 8, 's'), ('Wintermelon Milk Tea', 'Non-dairy creamer', 25, 's'), ('Wintermelon Milk Tea', 'Wintermelon syrup', 40, 's'), ('Wintermelon Milk Tea', 'Tapioca pearls', 60, 's'), ('Wintermelon Milk Tea', 'Ice', 150, 's'),
  ('Taro Milk Tea', 'Taro powder', 30, 's'), ('Taro Milk Tea', 'Fresh milk', 150, 's'), ('Taro Milk Tea', 'Non-dairy creamer', 15, 's'), ('Taro Milk Tea', 'Tapioca pearls', 60, 's'), ('Taro Milk Tea', 'Ice', 150, 's'),
  ('Okinawa Milk Tea', 'Assam tea leaves', 8, 's'), ('Okinawa Milk Tea', 'Fresh milk', 150, 's'), ('Okinawa Milk Tea', 'Brown sugar syrup', 40, 's'), ('Okinawa Milk Tea', 'Tapioca pearls', 60, 's'), ('Okinawa Milk Tea', 'Ice', 150, 's'),
  ('Brown Sugar Boba Milk', 'Fresh milk', 250, 's'), ('Brown Sugar Boba Milk', 'Brown sugar syrup', 40, 's'), ('Brown Sugar Boba Milk', 'Tapioca pearls', 80, 's'), ('Brown Sugar Boba Milk', 'Ice', 120, 's'),
  ('Cream Cheese Wintermelon Tea', 'Assam tea leaves', 8, 's'), ('Cream Cheese Wintermelon Tea', 'Wintermelon syrup', 40, 's'), ('Cream Cheese Wintermelon Tea', 'Cream cheese foam powder', 20, 's'), ('Cream Cheese Wintermelon Tea', 'Heavy cream', 30, 's'), ('Cream Cheese Wintermelon Tea', 'Ice', 180, 's'),
  ('Nata Lychee Tea', 'Iced tea concentrate', 180, 's'), ('Nata Lychee Tea', 'Lychee syrup', 30, 's'), ('Nata Lychee Tea', 'Nata de coco', 60, 's'), ('Nata Lychee Tea', 'Ice', 150, 's'),
  -- Chocolate
  ('Hot Chocolate', 'Cocoa powder', 20, 's'), ('Hot Chocolate', 'Mocha sauce', 25, 's'), ('Hot Chocolate', 'Fresh milk', 280, 's'), ('Hot Chocolate', 'Whipped cream', 20, 'f'),
  ('Iced Chocolate', 'Cocoa powder', 20, 's'), ('Iced Chocolate', 'Mocha sauce', 25, 's'), ('Iced Chocolate', 'Fresh milk', 240, 's'), ('Iced Chocolate', 'Ice', 180, 's'),
  -- Refreshers
  ('Strawberry Acai Refresher', 'Strawberry acai base', 160, 's'), ('Strawberry Acai Refresher', 'Freeze-dried strawberries', 3, 'f'), ('Strawberry Acai Refresher', 'Ice', 200, 's'),
  ('Mango Dragonfruit Refresher', 'Mango dragonfruit base', 160, 's'), ('Mango Dragonfruit Refresher', 'Freeze-dried dragonfruit', 3, 'f'), ('Mango Dragonfruit Refresher', 'Ice', 200, 's'),
  ('Pineapple Passionfruit Refresher', 'Pineapple passionfruit base', 160, 's'), ('Pineapple Passionfruit Refresher', 'Freeze-dried pineapple', 3, 'f'), ('Pineapple Passionfruit Refresher', 'Ice', 200, 's'),
  ('Strawberry Acai Lemonade', 'Strawberry acai base', 130, 's'), ('Strawberry Acai Lemonade', 'Lemonade base', 130, 's'), ('Strawberry Acai Lemonade', 'Freeze-dried strawberries', 3, 'f'), ('Strawberry Acai Lemonade', 'Ice', 180, 's'),
  ('Mango Dragonfruit Lemonade', 'Mango dragonfruit base', 130, 's'), ('Mango Dragonfruit Lemonade', 'Lemonade base', 130, 's'), ('Mango Dragonfruit Lemonade', 'Freeze-dried dragonfruit', 3, 'f'), ('Mango Dragonfruit Lemonade', 'Ice', 180, 's'),
  ('Pink Drink', 'Strawberry acai base', 130, 's'), ('Pink Drink', 'Coconut milk', 130, 's'), ('Pink Drink', 'Freeze-dried strawberries', 3, 'f'), ('Pink Drink', 'Ice', 180, 's'),
  ('Dragon Drink', 'Mango dragonfruit base', 130, 's'), ('Dragon Drink', 'Coconut milk', 130, 's'), ('Dragon Drink', 'Freeze-dried dragonfruit', 3, 'f'), ('Dragon Drink', 'Ice', 180, 's'),
  ('Paradise Drink', 'Pineapple passionfruit base', 130, 's'), ('Paradise Drink', 'Coconut milk', 130, 's'), ('Paradise Drink', 'Freeze-dried pineapple', 3, 'f'), ('Paradise Drink', 'Ice', 180, 's'),
  -- Juices & Shakes
  ('Fresh Orange Juice', 'Fresh orange juice', 350, 's'), ('Fresh Orange Juice', 'Ice', 80, 's'),
  ('Calamansi Juice', 'Calamansi juice', 60, 's'), ('Calamansi Juice', 'Sugar syrup', 40, 's'), ('Calamansi Juice', 'Ice', 200, 's'),
  ('Pineapple Juice', 'Pineapple juice', 300, 's'), ('Pineapple Juice', 'Ice', 100, 's'),
  ('Buko Juice', 'Buko water', 350, 's'), ('Buko Juice', 'Ice', 100, 's'),
  ('Classic Lemonade', 'Lemonade base', 280, 's'), ('Classic Lemonade', 'Lemon wedges', 1, 'f'), ('Classic Lemonade', 'Ice', 150, 's'),
  ('Cucumber Mint Lemonade', 'Lemonade base', 250, 's'), ('Cucumber Mint Lemonade', 'Cucumber', 40, 's'), ('Cucumber Mint Lemonade', 'Mint leaves', 3, 's'), ('Cucumber Mint Lemonade', 'Ice', 150, 's'),
  ('Blueberry Lemonade', 'Lemonade base', 230, 's'), ('Blueberry Lemonade', 'Blueberry puree', 40, 's'), ('Blueberry Lemonade', 'Ice', 150, 's'),
  ('Strawberry Italian Soda', 'Strawberry puree', 45, 's'), ('Strawberry Italian Soda', 'Soda water', 250, 's'), ('Strawberry Italian Soda', 'Ice', 150, 's'),
  ('Blue Lemonade Soda', 'Blue lemonade syrup', 30, 's'), ('Blue Lemonade Soda', 'Lemonade base', 100, 's'), ('Blue Lemonade Soda', 'Soda water', 170, 's'), ('Blue Lemonade Soda', 'Ice', 150, 's'),
  ('Mango Shake', 'Ripe mangoes', 200, 's'), ('Mango Shake', 'Condensed milk', 30, 's'), ('Mango Shake', 'Ice', 200, 's'),
  ('Watermelon Shake', 'Watermelon', 250, 's'), ('Watermelon Shake', 'Sugar syrup', 20, 's'), ('Watermelon Shake', 'Ice', 180, 's'),
  ('Avocado Shake', 'Avocado', 150, 's'), ('Avocado Shake', 'Condensed milk', 40, 's'), ('Avocado Shake', 'Fresh milk', 100, 's'), ('Avocado Shake', 'Ice', 180, 's'),
  ('Strawberry Banana Smoothie', 'Frozen strawberries', 120, 's'), ('Strawberry Banana Smoothie', 'Bananas', 100, 's'), ('Strawberry Banana Smoothie', 'Fresh milk', 120, 's'), ('Strawberry Banana Smoothie', 'Honey', 15, 's'), ('Strawberry Banana Smoothie', 'Ice', 100, 's');

-- Recipe rows scaled to each size
INSERT INTO product_ingredients (product_id, ingredient_id, quantity_required)
SELECT p.id, i.id,
       CASE r.kind
         WHEN 's' THEN round(r.qty * s.factor, 1)
         WHEN 'x' THEN r.qty * s.shots
         ELSE r.qty
       END
  FROM seed_recipes r
  JOIN seed_drinks  d ON d.name = r.drink
  JOIN seed_sizes   s ON s.serve = d.serve
  JOIN products     p ON p.name = d.name || ' (' || s.size || ' ' || s.oz || 'oz)'
  JOIN ingredients  i ON i.name = r.ingredient;

-- Cups, lids, sleeves and straws for each size
INSERT INTO product_ingredients (product_id, ingredient_id, quantity_required)
SELECT p.id, i.id, pk.qty
  FROM seed_drinks d
  JOIN seed_sizes     s  ON s.serve = d.serve
  JOIN seed_packaging pk ON pk.serve = s.serve AND pk.oz = s.oz
  JOIN products       p  ON p.name = d.name || ' (' || s.size || ' ' || s.oz || 'oz)'
  JOIN ingredients    i  ON i.name = pk.ingredient;

-- ---------- Single-size items (espresso bar, bottled, food) -----------
CREATE TEMP TABLE seed_items (
  pos serial, category text, name text, product_type text, price numeric, description text
) ON COMMIT DROP;

INSERT INTO seed_items (category, name, product_type, price, description) VALUES
  -- Espresso Bar (made in café)
  ('Espresso Bar', 'Espresso Solo',       'prepared',   90, 'A single shot of our house espresso.'),
  ('Espresso Bar', 'Espresso Doppio',     'prepared',  110, 'A double shot of our house espresso.'),
  ('Espresso Bar', 'Espresso Macchiato',  'prepared',  120, 'Double espresso marked with a dollop of milk foam.'),
  ('Espresso Bar', 'Cortado',             'prepared',  140, 'Espresso cut with an equal part of steamed milk.'),
  ('Espresso Bar', 'Affogato',            'prepared',  160, 'Vanilla ice cream drowned in a double espresso.'),
  -- Bottled Drinks (from suppliers)
  ('Bottled Drinks', 'Bottled Water',          'ready_made',  30, '500 ml mineral water.'),
  ('Bottled Drinks', 'Sparkling Water',        'ready_made',  60, '330 ml sparkling mineral water.'),
  ('Bottled Drinks', 'Bottled Lemon Iced Tea', 'ready_made',  55, '450 ml lemon iced tea.'),
  ('Bottled Drinks', 'Bottled Orange Juice',   'ready_made',  65, '350 ml orange juice.'),
  ('Bottled Drinks', 'Bottled Apple Juice',    'ready_made',  65, '350 ml apple juice.'),
  ('Bottled Drinks', 'Bottled Mango Juice',    'ready_made',  65, '350 ml mango juice.'),
  ('Bottled Drinks', 'Canned Cola',            'ready_made',  60, '330 ml cola.'),
  ('Bottled Drinks', 'Bottled Chocolate Milk', 'ready_made',  70, '300 ml chocolate milk.'),
  -- Pastries & Breads
  ('Pastries & Breads', 'Cheese Ensaymada',      'ready_made',  65, 'Soft brioche with butter, sugar and cheese.'),
  ('Pastries & Breads', 'Ube Cheese Pandesal',   'ready_made',  60, 'Purple yam pandesal with a cheese filling.'),
  ('Pastries & Breads', 'Chocolate Chip Cookie', 'ready_made',  70, 'Chewy cookie loaded with chocolate chips.'),
  ('Pastries & Breads', 'Butter Croissant',      'ready_made',  95, 'Flaky all-butter croissant.'),
  ('Pastries & Breads', 'Chocolate Croissant',   'ready_made', 115, 'Croissant filled with dark chocolate.'),
  ('Pastries & Breads', 'Almond Croissant',      'ready_made', 125, 'Croissant with almond cream and toasted almonds.'),
  ('Pastries & Breads', 'Blueberry Muffin',      'ready_made',  95, 'Moist muffin bursting with blueberries.'),
  ('Pastries & Breads', 'Banana Bread',          'ready_made',  95, 'Thick slice of homestyle banana bread.'),
  ('Pastries & Breads', 'Cinnamon Roll',         'ready_made', 110, 'Soft roll with cinnamon sugar and cream cheese glaze.'),
  -- Cakes & Desserts
  ('Cakes & Desserts', 'Leche Flan',                 'ready_made',  90, 'Classic caramel custard.'),
  ('Cakes & Desserts', 'Chocolate Cake Slice',       'ready_made', 145, 'Moist chocolate cake with ganache.'),
  ('Cakes & Desserts', 'Carrot Cake Slice',          'ready_made', 150, 'Spiced carrot cake with cream cheese frosting.'),
  ('Cakes & Desserts', 'Mango Float Cup',            'ready_made', 150, 'Layers of graham, cream and ripe mango.'),
  ('Cakes & Desserts', 'Red Velvet Cake Slice',      'ready_made', 155, 'Red velvet with cream cheese frosting.'),
  ('Cakes & Desserts', 'Blueberry Cheesecake Slice', 'ready_made', 165, 'New York cheesecake with blueberry topping.'),
  ('Cakes & Desserts', 'Tiramisu Cup',               'ready_made', 175, 'Espresso-soaked ladyfingers with mascarpone cream.'),
  -- Sandwiches
  ('Sandwiches', 'Egg Salad Sandwich',      'ready_made', 150, 'Creamy egg salad on soft white bread.'),
  ('Sandwiches', 'Ham and Cheese Sandwich', 'ready_made', 165, 'Ham and cheddar on toasted bread.'),
  ('Sandwiches', 'Tuna Melt Sandwich',      'ready_made', 175, 'Tuna and melted cheese on sourdough.'),
  ('Sandwiches', 'Chicken Pesto Panini',    'ready_made', 195, 'Grilled chicken, pesto and mozzarella.'),
  ('Sandwiches', 'Clubhouse Sandwich',      'ready_made', 210, 'Triple-decker with chicken, ham, egg, lettuce and tomato.');

INSERT INTO products (category_id, name, description, product_type, price)
SELECT c.id, it.name, it.description, it.product_type::product_type, it.price
  FROM seed_items it
  JOIN categories c ON c.name = it.category
 ORDER BY c.sort_order, it.pos;

-- Espresso bar recipes (ready-made items have no recipe)
INSERT INTO product_ingredients (product_id, ingredient_id, quantity_required)
SELECT p.id, i.id, v.qty
  FROM (VALUES
    ('Espresso Solo',      'Espresso beans',     9), ('Espresso Solo',      'Espresso cups 4oz', 1),
    ('Espresso Doppio',    'Espresso beans',    18), ('Espresso Doppio',    'Espresso cups 4oz', 1),
    ('Espresso Macchiato', 'Espresso beans',    18), ('Espresso Macchiato', 'Fresh milk',       20), ('Espresso Macchiato', 'Espresso cups 4oz', 1),
    ('Cortado',            'Espresso beans',    18), ('Cortado',            'Fresh milk',       60), ('Cortado', 'Hot cups 8oz', 1), ('Cortado', 'Hot lids 8oz', 1),
    ('Affogato',           'Espresso beans',    18), ('Affogato',           'Vanilla ice cream', 120), ('Affogato', 'Hot cups 8oz', 1)
  ) AS v(product, ingredient, qty)
  JOIN products    p ON p.name = v.product
  JOIN ingredients i ON i.name = v.ingredient;

-- ---------- Opening stock ---------------------------------------------
-- Recorded in the ledger so stock_qty always matches its history.
INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, employee_id, note)
SELECT i.id, 'adjustment', si.opening_stock, e.id, 'Opening stock'
  FROM seed_ingredients si
  JOIN ingredients i ON i.name = si.name
  JOIN employees   e ON e.username = 'admin';

-- ---------- Sanity checks (a typo above aborts the whole seed) ---------
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(DISTINCT r.drink || ' -> ' || r.ingredient, ', ') INTO v_bad
    FROM seed_recipes r
    LEFT JOIN seed_drinks d      ON d.name = r.drink
    LEFT JOIN seed_ingredients i ON i.name = r.ingredient
   WHERE d.name IS NULL OR i.name IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Seed recipe references an unknown drink or ingredient: %', v_bad;
  END IF;

  SELECT string_agg(ingredient, ', ') INTO v_bad
    FROM seed_packaging pk
   WHERE NOT EXISTS (SELECT 1 FROM seed_ingredients i WHERE i.name = pk.ingredient);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Seed packaging references an unknown ingredient: %', v_bad;
  END IF;

  SELECT string_agg(name, ', ') INTO v_bad
    FROM seed_drinks d
   WHERE NOT EXISTS (SELECT 1 FROM seed_recipes r WHERE r.drink = d.name);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Seed drink has no recipe: %', v_bad;
  END IF;
END $$;
