-- Rollback script for Checkout Session migration
-- This safely removes Checkout Session support while preserving data

-- Create temporary table with original schema
CREATE TABLE orders_rollback (
    id TEXT PRIMARY KEY,
    stripe_payment_intent_id TEXT UNIQUE NOT NULL,
    customer_email TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    order_type TEXT NOT NULL CHECK (order_type IN ('tickets', 'donation')),
    order_details TEXT NOT NULL,
    order_total INTEGER NOT NULL,
    fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'paid', 'fulfilled', 'failed', 'cancelled')),
    special_requests TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Copy data, excluding checkout session orders
INSERT INTO orders_rollback (
    id, stripe_payment_intent_id, customer_email, customer_name, customer_phone,
    order_type, order_details, order_total, fulfillment_status, special_requests,
    created_at, updated_at
)
SELECT 
    id, stripe_payment_intent_id, customer_email, customer_name, customer_phone,
    order_type, order_details, order_total, 
    CASE 
        WHEN fulfillment_status = 'awaiting_payment' THEN 'pending'
        WHEN fulfillment_status = 'expired' THEN 'cancelled'
        ELSE fulfillment_status
    END as fulfillment_status,
    special_requests, created_at, updated_at
FROM orders
WHERE payment_method = 'payment_intent' OR payment_method IS NULL;

-- Log checkout session orders that will be removed
CREATE TABLE IF NOT EXISTS migration_audit (
    migration_id TEXT,
    order_id TEXT,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO migration_audit (migration_id, order_id, data)
SELECT 
    '20250206_rollback_checkout_session',
    id,
    json_object(
        'stripe_checkout_session_id', stripe_checkout_session_id,
        'customer_email', customer_email,
        'order_total', order_total,
        'order_type', order_type
    )
FROM orders
WHERE payment_method = 'checkout_session';

-- Replace orders table
DROP TABLE orders;
ALTER TABLE orders_rollback RENAME TO orders;

-- Recreate original indexes
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_orders_stripe_intent ON orders(stripe_payment_intent_id);
CREATE INDEX idx_orders_status ON orders(fulfillment_status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- Recreate trigger
CREATE TRIGGER update_orders_updated_at 
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
        UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;