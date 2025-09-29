-- Migration: 008 - Transaction Items Table
-- Purpose: Transaction line items for detailed transaction breakdown
-- Dependencies: 004_transactions.sql

-- Transaction items
CREATE TABLE IF NOT EXISTS transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('ticket', 'donation', 'merchandise')),
    item_name TEXT NOT NULL,
    item_description TEXT,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    total_price_cents INTEGER NOT NULL CHECK (total_price_cents > 0),
    ticket_type TEXT,
    event_id TEXT,
    donation_category TEXT,
    sku TEXT,
    product_metadata TEXT,
    fulfillment_status TEXT DEFAULT 'pending' CHECK (
        fulfillment_status IN ('pending', 'fulfilled', 'cancelled', 'refunded')
    ),
    fulfilled_at TIMESTAMP,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for transaction_items
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_type ON transaction_items(item_type);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_type ON transaction_items(transaction_id, item_type);
CREATE INDEX IF NOT EXISTS idx_transaction_items_test_mode ON transaction_items(is_test, item_type, created_at DESC);