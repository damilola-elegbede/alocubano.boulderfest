-- Migration: Add email confirmation tracking to orders table
-- Date: 2025-02-06
-- Purpose: Prevent duplicate confirmation emails when multiple webhook events fire

-- Add confirmation_email_sent column to track if confirmation email was sent
-- Default to 0 (false) for new records
-- Existing records will default to 0, so they can receive confirmation emails
ALTER TABLE orders ADD COLUMN confirmation_email_sent INTEGER DEFAULT 0 CHECK (confirmation_email_sent IN (0, 1));

-- Add index for efficient querying of email status
CREATE INDEX IF NOT EXISTS idx_orders_email_sent ON orders(confirmation_email_sent);

-- Update the fulfillment_status constraint to include 'expired' and 'refunded'
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- First, create a temporary table with the updated schema
CREATE TABLE orders_temp (
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
    confirmation_email_sent INTEGER DEFAULT 0 CHECK (confirmation_email_sent IN (0, 1)),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    -- Ensure we have either payment_intent_id OR checkout_session_id
    CHECK (
        (stripe_payment_intent_id IS NOT NULL AND payment_method = 'payment_intent') OR
        (stripe_checkout_session_id IS NOT NULL AND payment_method = 'checkout_session')
    )
);

-- Copy existing data to the new table
INSERT INTO orders_temp (
    id, stripe_payment_intent_id, stripe_checkout_session_id, payment_method,
    checkout_session_url, checkout_session_expires_at, customer_email, customer_name,
    customer_phone, order_type, order_details, order_total, fulfillment_status,
    special_requests, confirmation_email_sent, created_at, updated_at
)
SELECT 
    id, stripe_payment_intent_id, stripe_checkout_session_id, payment_method,
    checkout_session_url, checkout_session_expires_at, customer_email, customer_name,
    customer_phone, order_type, order_details, order_total, fulfillment_status,
    special_requests, 0, created_at, updated_at
FROM orders;

-- Drop the old table and rename the new one
DROP TABLE orders;
ALTER TABLE orders_temp RENAME TO orders;

-- Recreate all indexes
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
CREATE INDEX idx_orders_email_sent ON orders(confirmation_email_sent);

-- Recreate the update trigger
CREATE TRIGGER update_orders_updated_at 
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
        UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;