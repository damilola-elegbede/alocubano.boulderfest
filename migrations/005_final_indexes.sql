-- Create indexes for performance based on actual existing table schemas

-- Transactions table indexes (with proper column name validation)
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_email ON transactions(customer_email);
-- Fix: Use actual column name 'stripe_session_id' not 'stripe_checkout_session_id'
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session ON transactions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- Tickets table indexes (only for columns that exist)
CREATE INDEX IF NOT EXISTS idx_tickets_transaction_id ON tickets(transaction_id);
-- Note: event_name column doesn't exist in current schema, using event_id instead
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_attendee_email ON tickets(attendee_email);

-- Transaction items table indexes  
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_type ON transaction_items(item_type);

-- Payment events table indexes
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_id ON payment_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events(created_at);