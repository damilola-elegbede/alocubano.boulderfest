-- Optional: Migrate existing Payment Intent orders to include new fields
-- This is safe to run multiple times (idempotent)

-- Update existing orders to explicitly set payment_method
UPDATE orders 
SET payment_method = 'payment_intent',
    updated_at = datetime('now')
WHERE payment_method IS NULL 
  AND stripe_payment_intent_id IS NOT NULL;

-- Create a view for easier querying during transition
CREATE VIEW IF NOT EXISTS orders_unified AS
SELECT 
    id,
    COALESCE(stripe_payment_intent_id, stripe_checkout_session_id) as stripe_reference_id,
    payment_method,
    customer_email,
    customer_name,
    customer_phone,
    order_type,
    order_details,
    order_total,
    fulfillment_status,
    special_requests,
    stripe_customer_id,
    checkout_session_url,
    checkout_session_expires_at,
    created_at,
    updated_at,
    CASE 
        WHEN checkout_session_expires_at IS NOT NULL 
             AND datetime(checkout_session_expires_at) < datetime('now')
             AND fulfillment_status = 'awaiting_payment'
        THEN 'expired'
        ELSE fulfillment_status
    END as effective_status
FROM orders;

-- Create monitoring view for migration progress
CREATE VIEW IF NOT EXISTS migration_stats AS
SELECT 
    payment_method,
    fulfillment_status,
    COUNT(*) as order_count,
    SUM(order_total) as total_amount,
    MIN(created_at) as earliest_order,
    MAX(created_at) as latest_order
FROM orders
GROUP BY payment_method, fulfillment_status;