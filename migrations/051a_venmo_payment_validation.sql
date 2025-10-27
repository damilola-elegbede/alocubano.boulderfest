-- Migration 051: Venmo Payment Validation
-- Purpose: Update transaction validation triggers to support both Venmo via PayPal API and Venmo manual entry

-- Drop existing manual payment validation triggers
DROP TRIGGER IF EXISTS trg_transactions_manual_payment_validation;

DROP TRIGGER IF EXISTS trg_transactions_manual_payment_validation_update;

CREATE TRIGGER trg_transactions_manual_payment_validation
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN (
    NEW.payment_processor IN ('cash', 'card_terminal', 'comp')
    AND (NEW.manual_entry_id IS NULL OR NEW.manual_entry_id = '')
) OR (
    NEW.payment_processor = 'venmo'
    AND (NEW.manual_entry_id IS NULL OR NEW.manual_entry_id = '')
    AND (NEW.paypal_order_id IS NULL OR NEW.paypal_order_id = '')
    AND (NEW.paypal_capture_id IS NULL OR NEW.paypal_capture_id = '')
)
BEGIN
    SELECT RAISE(ABORT, 'Manual payment methods require manual_entry_id (cash/card_terminal/comp) or PayPal credentials (venmo)');
END;

CREATE TRIGGER trg_transactions_manual_payment_validation_update
BEFORE UPDATE ON transactions
FOR EACH ROW
WHEN (
    NEW.payment_processor IN ('cash', 'card_terminal', 'comp')
    AND (NEW.manual_entry_id IS NULL OR NEW.manual_entry_id = '')
) OR (
    NEW.payment_processor = 'venmo'
    AND (NEW.manual_entry_id IS NULL OR NEW.manual_entry_id = '')
    AND (NEW.paypal_order_id IS NULL OR NEW.paypal_order_id = '')
    AND (NEW.paypal_capture_id IS NULL OR NEW.paypal_capture_id = '')
)
BEGIN
    SELECT RAISE(ABORT, 'Manual payment methods require manual_entry_id (cash/card_terminal/comp) or PayPal credentials (venmo)');
END;
