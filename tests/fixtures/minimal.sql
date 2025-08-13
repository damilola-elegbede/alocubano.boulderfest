-- Minimal test data for basic testing
INSERT INTO registrations (email, name, tickets, payment_status, amount_paid) VALUES 
  ('existing@example.com', 'Existing User', 2, 'completed', 100.00);

INSERT INTO tickets (id, email, ticket_type, status, qr_code, qr_token) VALUES
  ('ticket_001', 'existing@example.com', 'general', 'active', 'qr_001', 'token_001'),
  ('ticket_002', 'existing@example.com', 'vip', 'active', 'qr_002', 'token_002');

INSERT INTO newsletter_subscribers (email, status) VALUES
  ('newsletter@example.com', 'active');