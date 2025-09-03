-- Create indexes for performance based on tables available at this migration point

-- Additional transactions table indexes (core indexes already in 001_core_tables.sql)
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- Payment events table indexes (if payment_events table exists)
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_id ON payment_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events(created_at);

-- Note: Ticket and transaction_items indexes are in their respective table definition files
-- to avoid dependency issues