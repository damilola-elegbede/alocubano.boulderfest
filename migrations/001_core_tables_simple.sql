-- Core database tables for A Lo Cubano Boulder Fest
-- Transactions table for tracking all payments
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('tickets', 'donation', 'merchandise')),
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded')
    ),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT DEFAULT 'USD',
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    payment_method_type TEXT,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    billing_address TEXT,
    order_data TEXT NOT NULL,
    session_metadata TEXT,
    event_id TEXT,
    source TEXT DEFAULT 'website',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Trigger to automatically update updated_at timestamp when transactions table is modified
CREATE TRIGGER IF NOT EXISTS update_transactions_updated_at 
    AFTER UPDATE ON transactions 
BEGIN
    UPDATE transactions 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;