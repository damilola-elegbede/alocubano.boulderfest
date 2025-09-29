-- Migration: 046 - Ticket Reservations System
-- Purpose: Prevent race condition overselling with atomic reservations
-- Dependencies: 045_add_flagged_for_review_status.sql
-- Context: Implements reservation-based ticket allocation to prevent concurrent
--          purchases from causing overselling during high-traffic checkout flows

-- =============================================================================
-- STEP 1: Create ticket_reservations table
-- =============================================================================

-- Track temporary ticket reservations during checkout process
CREATE TABLE IF NOT EXISTS ticket_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Ticket type being reserved
    ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,

    -- Quantity reserved
    quantity INTEGER NOT NULL CHECK(quantity > 0),

    -- Session tracking (Stripe checkout session or internal session ID)
    session_id TEXT NOT NULL,

    -- Reservation lifecycle timestamps
    reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,

    -- Reservation status
    status TEXT CHECK(status IN ('active', 'fulfilled', 'expired', 'released')) DEFAULT 'active',

    -- Fulfillment tracking (when reservation is converted to actual tickets)
    fulfilled_at DATETIME,
    transaction_id INTEGER REFERENCES transactions(id),

    -- Metadata for debugging and tracking
    metadata TEXT, -- JSON stored as TEXT for additional context

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- STEP 2: Create indexes for performance
-- =============================================================================

-- Index for finding active reservations by ticket type (critical for availability checks)
CREATE INDEX IF NOT EXISTS idx_reservations_ticket_type_status
    ON ticket_reservations(ticket_type_id, status)
    WHERE status = 'active';

-- Index for expiration cleanup queries
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at
    ON ticket_reservations(expires_at, status)
    WHERE status = 'active';

-- Index for session lookup (for fulfillment)
CREATE INDEX IF NOT EXISTS idx_reservations_session_id
    ON ticket_reservations(session_id, status);

-- Index for transaction lookup (for audit trail)
CREATE INDEX IF NOT EXISTS idx_reservations_transaction_id
    ON ticket_reservations(transaction_id);

-- =============================================================================
-- STEP 3: Create triggers for updated_at timestamp
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS update_reservations_timestamp
AFTER UPDATE ON ticket_reservations
FOR EACH ROW
BEGIN
    UPDATE ticket_reservations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- STEP 4: Create view for available ticket counts
-- =============================================================================

-- View that shows real-time available quantity considering active reservations
CREATE VIEW IF NOT EXISTS ticket_availability_view AS
SELECT
    tt.id,
    tt.name,
    tt.event_id,
    tt.max_quantity,
    tt.sold_count,
    COALESCE(SUM(CASE
        WHEN tr.status = 'active' AND tr.expires_at > datetime('now')
        THEN tr.quantity
        ELSE 0
    END), 0) as reserved_count,
    CASE
        WHEN tt.max_quantity IS NULL THEN NULL
        ELSE MAX(0, tt.max_quantity - tt.sold_count - COALESCE(SUM(
            CASE
                WHEN tr.status = 'active' AND tr.expires_at > datetime('now')
                THEN tr.quantity
                ELSE 0
            END
        ), 0))
    END as available_quantity,
    tt.status,
    tt.price_cents
FROM ticket_types tt
LEFT JOIN ticket_reservations tr ON tr.ticket_type_id = tt.id
WHERE tt.status IN ('available', 'test')
GROUP BY tt.id;

-- =============================================================================
-- VERIFICATION QUERIES (Comments for debugging)
-- =============================================================================

-- After migration, verify with these queries:
-- SELECT * FROM ticket_reservations LIMIT 10;
-- SELECT * FROM ticket_availability_view;
-- SELECT COUNT(*) as active_reservations FROM ticket_reservations WHERE status = 'active';
-- SELECT ticket_type_id, SUM(quantity) as total_reserved FROM ticket_reservations WHERE status = 'active' GROUP BY ticket_type_id;