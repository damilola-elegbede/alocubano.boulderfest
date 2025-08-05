-- Minimal order tracking for SQLite (not payment data - Stripe handles that)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    stripe_payment_intent_id TEXT UNIQUE NOT NULL,
    customer_email TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    order_type TEXT NOT NULL CHECK (order_type IN ('tickets', 'donation')),
    order_details TEXT NOT NULL, -- JSON string with ticket quantities, types, amounts
    order_total INTEGER NOT NULL, -- Amount in cents
    fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'paid', 'fulfilled', 'failed', 'cancelled')),
    special_requests TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_intent ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_orders_updated_at 
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
        UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;