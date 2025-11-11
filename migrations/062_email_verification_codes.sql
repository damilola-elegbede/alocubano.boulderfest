-- Migration: 062 - Email Verification Codes Table
-- Purpose: Enable secure email-based ticket viewing with verification codes
-- Dependencies: None
--
-- Background:
--   Current my-tickets page allows insecure direct email lookup
--   Anyone can view tickets by entering any email address
--   This creates a security vulnerability
--
-- Solution:
--   Implement email + verification code flow:
--   1. User enters email
--   2. System sends 6-digit code via Brevo
--   3. User enters code to create authenticated session
--   4. JWT token grants access to tickets for that email
--
-- Security Features:
--   - Verification codes expire after 5 minutes
--   - Maximum 3 verification attempts per code
--   - Rate limiting: 3 codes per email per 15 minutes (enforced in API)
--   - Codes are single-use and invalidated after successful verification

-- ============================================================================
-- STEP 1: Create email_verification_codes table
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Verification Details
    email TEXT NOT NULL,
    code TEXT NOT NULL,

    -- Lifecycle Management
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME,

    -- Security
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    ip_address TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'verified', 'expired', 'failed')),

    -- Indexes for performance
    UNIQUE(email, code)
);

-- ============================================================================
-- STEP 2: Create indexes for efficient lookups
-- ============================================================================

-- Fast lookup by email and code (primary verification query)
CREATE INDEX IF NOT EXISTS idx_verification_email_code
    ON email_verification_codes(email, code, status);

-- Fast lookup by email for rate limiting
CREATE INDEX IF NOT EXISTS idx_verification_email_created
    ON email_verification_codes(email, created_at);

-- Fast lookup for cleanup of expired codes
CREATE INDEX IF NOT EXISTS idx_verification_expires
    ON email_verification_codes(expires_at, status);

-- ============================================================================
-- STEP 3: Add cleanup trigger for old verification codes
-- ============================================================================

-- Automatically clean up verification codes older than 24 hours
-- This prevents the table from growing indefinitely
CREATE TRIGGER IF NOT EXISTS cleanup_old_verification_codes
AFTER INSERT ON email_verification_codes
BEGIN
    DELETE FROM email_verification_codes
    WHERE created_at < datetime('now', '-1 day');
END;

-- ============================================================================
-- STEP 4: Verification complete
-- ============================================================================

-- No data migration needed - this is a new table
-- Table will be populated by /api/tickets/verify-email endpoint

PRAGMA foreign_keys = ON;
