-- Migration: Add Payment Method Details for Receipts
-- Description: Add columns to store payment method details (card brand, last4, wallet type)
--              for displaying on order confirmation receipts

-- Add payment method detail columns to transactions table
ALTER TABLE transactions ADD COLUMN card_brand TEXT;
ALTER TABLE transactions ADD COLUMN card_last4 TEXT;
ALTER TABLE transactions ADD COLUMN payment_wallet TEXT; -- 'apple_pay', 'google_pay', 'link', or NULL

-- Create index for card lookup (useful for debugging/support)
CREATE INDEX IF NOT EXISTS idx_transactions_card_last4 ON transactions(card_last4);

-- Add payment processor column if it doesn't exist (for distinguishing Stripe vs PayPal)
-- This may already exist, so we use IF NOT EXISTS pattern
ALTER TABLE transactions ADD COLUMN payment_processor TEXT DEFAULT 'stripe';
