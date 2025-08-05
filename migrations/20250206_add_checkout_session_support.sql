-- Migration: Add Stripe Checkout Session support to orders table
-- Date: 2025-02-06
-- Purpose: Support both Payment Intent and Checkout Session payment flows
-- This migration is backward compatible with existing Payment Intent orders

-- Step 1: Add payment_method column to track which Stripe flow was used
-- Default to 'payment_intent' for backward compatibility with existing records
ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'payment_intent' 
    CHECK (payment_method IN ('payment_intent', 'checkout_session'));

-- Step 2: Add stripe_checkout_session_id column (nullable for backward compatibility)
-- This allows orders to have either payment_intent_id OR checkout_session_id
ALTER TABLE orders ADD COLUMN stripe_checkout_session_id TEXT;

-- Step 3: Add checkout_session_url for recovery of abandoned checkout sessions
-- This URL can be used to redirect users back to complete their payment
ALTER TABLE orders ADD COLUMN checkout_session_url TEXT;

-- Step 4: Add checkout_session_expires_at to track session expiration
-- Stripe Checkout Sessions expire after 24 hours by default
ALTER TABLE orders ADD COLUMN checkout_session_expires_at TEXT;

-- Step 5: Update the fulfillment_status constraint to include 'awaiting_payment'
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- First, create a temporary table with the new schema
CREATE TABLE orders_new (
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
        CHECK (fulfillment_status IN ('pending', 'awaiting_payment', 'paid', 'fulfilled', 'failed', 'cancelled')),
    special_requests TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    -- Ensure we have either payment_intent_id OR checkout_session_id
    CHECK (
        (stripe_payment_intent_id IS NOT NULL AND payment_method = 'payment_intent') OR
        (stripe_checkout_session_id IS NOT NULL AND payment_method = 'checkout_session')
    )
);

-- Copy existing data to the new table
INSERT INTO orders_new (
    id, stripe_payment_intent_id, payment_method, customer_email, customer_name,
    customer_phone, order_type, order_details, order_total, fulfillment_status,
    special_requests, created_at, updated_at
)
SELECT 
    id, stripe_payment_intent_id, 'payment_intent', customer_email, customer_name,
    customer_phone, order_type, order_details, order_total, fulfillment_status,
    special_requests, created_at, updated_at
FROM orders;

-- Drop the old table and rename the new one
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

-- Step 6: Recreate indexes with additional ones for checkout session lookups
CREATE UNIQUE INDEX idx_orders_stripe_intent ON orders(stripe_payment_intent_id) 
    WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX idx_orders_checkout_session ON orders(stripe_checkout_session_id) 
    WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_orders_status ON orders(fulfillment_status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_checkout_expires ON orders(checkout_session_expires_at) 
    WHERE checkout_session_expires_at IS NOT NULL;

-- Step 7: Recreate the update trigger
CREATE TRIGGER update_orders_updated_at 
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
        UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

-- Rollback script (commented out for safety)
-- To rollback this migration, run the following:
/*
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
    fulfillment_status TEXT DEFAULT 'pending' 
        CHECK (fulfillment_status IN ('pending', 'paid', 'fulfilled', 'failed', 'cancelled')),
    special_requests TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Copy only Payment Intent orders back
INSERT INTO orders_rollback
SELECT 
    id, stripe_payment_intent_id, customer_email, customer_name,
    customer_phone, order_type, order_details, order_total,
    CASE 
        WHEN fulfillment_status = 'awaiting_payment' THEN 'pending'
        ELSE fulfillment_status
    END as fulfillment_status,
    special_requests, created_at, updated_at
FROM orders
WHERE payment_method = 'payment_intent' AND stripe_payment_intent_id IS NOT NULL;

-- Drop and rename
DROP TABLE orders;
ALTER TABLE orders_rollback RENAME TO orders;

-- Recreate original indexes
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_orders_stripe_intent ON orders(stripe_payment_intent_id);
CREATE INDEX idx_orders_status ON orders(fulfillment_status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- Recreate original trigger
CREATE TRIGGER update_orders_updated_at 
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
        UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
*/