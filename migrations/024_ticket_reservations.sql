-- Migration: 024 - Ticket Reservations System
-- Purpose: Prevent race condition overselling with atomic reservations
-- Dependencies: 022_ticket_types_table.sql

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
    metadata TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reservations_ticket_type_status ON ticket_reservations(ticket_type_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON ticket_reservations(expires_at, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_reservations_session_id ON ticket_reservations(session_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_transaction_id ON ticket_reservations(transaction_id);

-- Trigger for updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_reservations_timestamp
AFTER UPDATE ON ticket_reservations
FOR EACH ROW
BEGIN
    UPDATE ticket_reservations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- View for available ticket counts
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