-- Core database tables for A Lo Cubano Boulder Fest
-- Transactions table for tracking all payments
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('tickets', 'donation', 'merchandise')),
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded')
    ),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT DEFAULT 'USD',
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    payment_method_type TEXT,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    billing_address TEXT,
    order_data TEXT NOT NULL,
    session_metadata TEXT,
    event_id TEXT,
    source TEXT DEFAULT 'website',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Registrations table for tracking ticket holder information
CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    dietary_restrictions TEXT,
    accessibility_needs TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_primary_purchaser BOOLEAN DEFAULT FALSE,
    transaction_id TEXT,
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'cancelled')),
    checked_in_at TIMESTAMP,
    notes TEXT
);