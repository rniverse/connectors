-- lib/test/data/seed.sql
-- Test data

INSERT INTO users (username, email, age) VALUES
  ('alice', 'alice@example.com', 25),
  ('bob', 'bob@example.com', 30),
  ('charlie', 'charlie@example.com', 35),
  ('diana', 'diana@example.com', 28),
  ('eve', 'eve@example.com', 32)
ON CONFLICT (username) DO NOTHING;

INSERT INTO products (name, category, price, stock) VALUES
  ('Laptop', 'Electronics', 999.99, 10),
  ('Mouse', 'Electronics', 29.99, 50),
  ('Keyboard', 'Electronics', 79.99, 30),
  ('Desk Chair', 'Furniture', 199.99, 15),
  ('Monitor', 'Electronics', 299.99, 20)
ON CONFLICT DO NOTHING;

INSERT INTO orders (user_id, product_name, quantity, price) VALUES
  (1, 'Laptop', 1, 999.99),
  (1, 'Mouse', 2, 29.99),
  (2, 'Keyboard', 1, 79.99),
  (3, 'Monitor', 2, 299.99),
  (3, 'Mouse', 3, 29.99),
  (4, 'Desk Chair', 1, 199.99),
  (5, 'Laptop', 1, 999.99)
ON CONFLICT DO NOTHING;
