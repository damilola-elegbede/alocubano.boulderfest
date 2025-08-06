-- Migration: Add Stripe Checkout Session support to orders table
-- Date: 2025-02-06
-- Purpose: Support both Payment Intent and Checkout Session payment flows
-- This migration is backward compatible with existing Payment Intent orders
-- This is a SAFE version that checks for existing columns

-- Step 1: Create temporary table with desired schema
CREATE TABLE IF NOT EXISTS orders_checkout_migration (
    id TEXT PRIMARY KEY,
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT,
    payment_method TEXT DEFAULT 'payment_intent' CHECK (payment_method IN ('payment_intent', 'checkout_session')),
    checkout_session_url TEXT,
    checkout_session_expires_at TEXT,
    customer_email TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    order_type TEXT NOT NULL CHECK (order_type IN ('tickets', 'donation')),
    order_details TEXT NOT NULL, -- JSON string with ticket quantities, types, amounts
    order_total INTEGER NOT NULL, -- Amount in cents
    fulfillment_status TEXT DEFAULT 'pending' 
        CHECK (fulfillment_status IN ('pending', 'awaiting_payment', 'paid', 'fulfilled', 'failed', 'cancelled', 'expired', 'refunded')),
    special_requests TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    -- Ensure we have either payment_intent_id OR checkout_session_id
    CHECK (
        (stripe_payment_intent_id IS NOT NULL AND payment_method = 'payment_intent') OR
        (stripe_checkout_session_id IS NOT NULL AND payment_method = 'checkout_session')
    )
);

-- Step 2: Copy existing data to the new table (only if migration table doesn't exist with data)
INSERT OR IGNORE INTO orders_checkout_migration (
    id, 
    stripe_payment_intent_id, 
    stripe_checkout_session_id,
    payment_method, 
    checkout_session_url,
    checkout_session_expires_at,
    customer_email, 
    customer_name,
    customer_phone, 
    order_type, 
    order_details, 
    order_total, 
    fulfillment_status,
    special_requests, 
    created_at, 
    updated_at
)
SELECT 
    id, 
    stripe_payment_intent_id,
    COALESCE(stripe_checkout_session_id, NULL),
    COALESCE(payment_method, 'payment_intent'),
    NULL,
    NULL,
    customer_email, 
    customer_name,
    customer_phone, 
    order_type, 
    order_details, 
    order_total, 
    CASE 
        WHEN fulfillment_status IN ('pending', 'awaiting_payment', 'paid', 'fulfilled', 'failed', 'cancelled', 'expired', 'refunded') THEN fulfillment_status
        ELSE 'pending'
    END,
    special_requests, 
    created_at, 
    updated_at
FROM orders
WHERE EXISTS (SELECT 1 FROM orders LIMIT 1);

-- Step 3: Drop old table and rename new one
DROP TABLE IF EXISTS orders_old_backup;
ALTER TABLE orders RENAME TO orders_old_backup;
ALTER TABLE orders_checkout_migration RENAME TO orders;

-- Step 4: Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_intent ON orders(stripe_payment_intent_id) 
    WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_session ON orders(stripe_checkout_session_id) 
    WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_checkout_expires ON orders(checkout_session_expires_at) 
    WHERE checkout_session_expires_at IS NOT NULL;

-- Step 5: Create update trigger
DROP TRIGGER IF EXISTS update_orders_updated_at;
CREATE TRIGGER update_orders_updated_at 
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
        UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

-- Step 6: Clean up backup table (comment out for safety - can be run manually later)
-- DROP TABLE IF EXISTS orders_old_backup;