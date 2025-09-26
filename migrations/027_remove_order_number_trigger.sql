-- Migration: Remove Order Number Trigger
-- Removes the strict trigger that requires order_number on insert
-- This allows the system to work while order_number is being rolled out
-- Date: 2024-09-25

-- Drop the trigger that's causing issues in production
DROP TRIGGER IF EXISTS require_order_number_on_insert;

-- Note: Order numbers are now generated at the application level
-- The order_number column remains but is not strictly required
-- This allows for gradual migration and backward compatibility