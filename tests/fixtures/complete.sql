-- Complete test dataset for comprehensive testing
INSERT INTO registrations (email, name, tickets, payment_status, amount_paid) VALUES 
  ('user1@example.com', 'User One', 1, 'completed', 50.00),
  ('user2@example.com', 'User Two', 2, 'completed', 100.00),
  ('user3@example.com', 'User Three', 1, 'pending', 0),
  ('user4@example.com', 'User Four', 3, 'completed', 150.00);

INSERT INTO tickets (id, email, ticket_type, status, qr_code, qr_token) VALUES
  ('ticket_001', 'user1@example.com', 'general', 'active', 'qr_001', 'token_001'),
  ('ticket_002', 'user2@example.com', 'general', 'active', 'qr_002', 'token_002'),
  ('ticket_003', 'user2@example.com', 'vip', 'active', 'qr_003', 'token_003'),
  ('ticket_004', 'user3@example.com', 'general', 'pending', 'qr_004', 'token_004'),
  ('ticket_005', 'user4@example.com', 'vip', 'used', 'qr_005', 'token_005');

INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data, stripe_session_id) VALUES
  ('txn_001', 'tickets', 'completed', 5000, 'user1@example.com', 'User One', '{"tickets": 1}', 'cs_test_001'),
  ('txn_002', 'tickets', 'completed', 10000, 'user2@example.com', 'User Two', '{"tickets": 2}', 'cs_test_002'),
  ('txn_003', 'tickets', 'pending', 5000, 'user3@example.com', 'User Three', '{"tickets": 1}', 'cs_test_003'),
  ('txn_004', 'donation', 'completed', 2500, 'donor@example.com', 'Generous Donor', '{"amount": 25}', 'cs_test_004');

INSERT INTO newsletter_subscribers (email, status) VALUES
  ('subscriber1@example.com', 'active'),
  ('subscriber2@example.com', 'unsubscribed'),
  ('subscriber3@example.com', 'active');

INSERT INTO email_subscribers (email, status) VALUES
  ('email1@example.com', 'active'),
  ('email2@example.com', 'bounced'),
  ('email3@example.com', 'active');

INSERT INTO admin_sessions (username, token_hash, expires_at) VALUES
  ('admin', 'test_token_hash', datetime('now', '+1 day'));

INSERT INTO access_tokens (token_hash, transaction_id, email, expires_at) VALUES
  ('access_token_001', 1, 'user1@example.com', datetime('now', '+7 days')),
  ('access_token_002', 2, 'user2@example.com', datetime('now', '+7 days'));