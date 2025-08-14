-- Integration test dataset
-- Simpler than complete.sql but more comprehensive than minimal.sql

INSERT INTO registrations (email, name, tickets, payment_status, amount_paid) VALUES 
  ('integration1@example.com', 'Integration User One', 2, 'completed', 100.00),
  ('integration2@example.com', 'Integration User Two', 1, 'pending', 0);

INSERT INTO tickets (id, email, ticket_type, status, qr_code, qr_token) VALUES
  ('int_ticket_001', 'integration1@example.com', 'general', 'active', 'int_qr_001', 'int_token_001'),
  ('int_ticket_002', 'integration1@example.com', 'vip', 'active', 'int_qr_002', 'int_token_002'),
  ('int_ticket_003', 'integration2@example.com', 'general', 'pending', 'int_qr_003', 'int_token_003');

INSERT INTO newsletter_subscribers (email, status) VALUES
  ('integration_news@example.com', 'active');

INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data) VALUES
  ('int_txn_001', 'tickets', 'completed', 10000, 'integration1@example.com', 'Integration User One', '{"tickets": 2}'),
  ('int_txn_002', 'tickets', 'pending', 5000, 'integration2@example.com', 'Integration User Two', '{"tickets": 1}');