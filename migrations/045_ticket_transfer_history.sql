-- Migration: 045 - Ticket Transfer History
-- Purpose: Track manual admin ticket transfers for audit and compliance
-- Dependencies: 005_tickets.sql, 004_transactions.sql

-- Ticket Transfer History Table
CREATE TABLE IF NOT EXISTS ticket_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,

    -- Previous owner information
    from_email TEXT NOT NULL,
    from_first_name TEXT,
    from_last_name TEXT,
    from_phone TEXT,

    -- New owner information
    to_email TEXT NOT NULL,
    to_first_name TEXT NOT NULL,
    to_last_name TEXT,
    to_phone TEXT,

    -- Transfer metadata
    transferred_by TEXT NOT NULL, -- Admin identifier (email or session ID)
    transfer_reason TEXT, -- Optional reason for transfer
    transfer_method TEXT DEFAULT 'admin_manual' CHECK (
        transfer_method IN ('admin_manual', 'user_initiated', 'system_automated')
    ),

    -- Test mode
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),

    -- Timestamps
    transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraint
    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket_id ON ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_transaction_id ON ticket_transfers(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_from_email ON ticket_transfers(from_email);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_to_email ON ticket_transfers(to_email);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_transferred_by ON ticket_transfers(transferred_by);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_transferred_at ON ticket_transfers(transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_test_mode ON ticket_transfers(is_test, transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_method ON ticket_transfers(transfer_method, transferred_at DESC);

-- Audit trail composite index
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_audit ON ticket_transfers(
    ticket_id,
    transferred_at DESC,
    transferred_by
);
