# Phase 1 PR 1: Database Migrations for Registration System

## Overview
- **PRD Reference**: [prd.md](./prd.md) Section: Database Requirements
- **Requirements**: REQ-DB-001, REQ-DB-002, REQ-DB-003, REQ-DB-004
- **Dependencies**: None (foundation PR)
- **Duration**: 2 days

## Tasks

### Task_1_1_01: Create Registration Status Migration
- **Assignee**: database-admin
- **Execution**: Independent
- **Duration**: 2-3 hours
- **PRD Requirements**: REQ-DB-001
- **Technical Details**:
  - Create migration file `014_add_registration_tracking.sql`
  - Add registration_status column with CHECK constraint
  - Add registered_at and registration_deadline columns
  - Create indexes for performance optimization
  - Test rollback procedure
- **Acceptance Criteria**:
  - Migration applies cleanly to test database
  - Rollback script successfully reverts changes
  - Indexes improve query performance by >50%
- **Testing**:
  - Verify migration on copy of production data
  - Test constraint enforcement
  - Benchmark query performance
- **PRD Validation**: Verify all fields from REQ-DB-001 are created

```sql
-- Migration Up
ALTER TABLE tickets ADD COLUMN registration_status TEXT DEFAULT 'pending' 
  CHECK (registration_status IN ('pending', 'completed', 'expired'));
ALTER TABLE tickets ADD COLUMN registered_at DATETIME;
ALTER TABLE tickets ADD COLUMN registration_deadline DATETIME;

CREATE INDEX idx_tickets_registration_status 
  ON tickets(registration_status, registration_deadline);
CREATE INDEX idx_tickets_deadline 
  ON tickets(registration_deadline) 
  WHERE registration_status = 'pending';

-- Migration Down
DROP INDEX IF EXISTS idx_tickets_deadline;
DROP INDEX IF EXISTS idx_tickets_registration_status;
ALTER TABLE tickets DROP COLUMN registration_deadline;
ALTER TABLE tickets DROP COLUMN registered_at;
ALTER TABLE tickets DROP COLUMN registration_status;
```

### Task_1_1_02: Create Reminder Tracking Table
- **Assignee**: database-evolution-specialist
- **Execution**: Independent
- **Duration**: 3-4 hours
- **PRD Requirements**: REQ-DB-002
- **Technical Details**:
  - Create migration file `015_create_registration_reminders.sql`
  - Design registration_reminders table schema
  - Add unique constraint for ticket_id + reminder_type
  - Create indexes for scheduled reminder queries
  - Implement foreign key relationships
- **Acceptance Criteria**:
  - Table supports all reminder types (72hr, 48hr, 24hr, final)
  - Unique constraint prevents duplicate reminders
  - Foreign keys maintain referential integrity
- **Testing**:
  - Insert test reminder records
  - Verify constraint enforcement
  - Test cascade delete behavior
- **PRD Validation**: Table structure matches REQ-DB-002 specification

```sql
-- Migration Up
CREATE TABLE registration_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK (
    reminder_type IN ('72hr', '48hr', '24hr', 'final')
  ),
  scheduled_at DATETIME NOT NULL,
  sent_at DATETIME,
  status TEXT DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'sent', 'failed', 'cancelled')
  ),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  UNIQUE(ticket_id, reminder_type)
);

CREATE INDEX idx_reminders_scheduled 
  ON registration_reminders(scheduled_at, status) 
  WHERE status = 'scheduled';
CREATE INDEX idx_reminders_ticket 
  ON registration_reminders(ticket_id);

-- Migration Down
DROP TABLE IF EXISTS registration_reminders;
```

### Task_1_1_03: Create Email Tracking Table
- **Assignee**: database-admin
- **Execution**: Depends on Task_1_1_02
- **Duration**: 2-3 hours
- **PRD Requirements**: REQ-DB-003, REQ-EMAIL-003
- **Technical Details**:
  - Create migration file `016_create_registration_emails.sql`
  - Design registration_emails table for audit trail
  - Track all email types and delivery status
  - Include Brevo message ID for webhook correlation
  - Add indexes for email analytics queries
- **Acceptance Criteria**:
  - All email types can be tracked
  - Brevo webhook data can be correlated
  - Query performance for analytics <100ms
- **Testing**:
  - Insert sample email records
  - Verify index performance
  - Test analytics queries
- **PRD Validation**: Supports all email types from REQ-EMAIL requirements

```sql
-- Migration Up
CREATE TABLE registration_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  transaction_id TEXT,
  email_type TEXT NOT NULL CHECK (email_type IN (
    'registration_invitation',
    'reminder_72hr',
    'reminder_48hr', 
    'reminder_24hr',
    'reminder_final',
    'attendee_confirmation',
    'purchaser_completion'
  )),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  brevo_message_id TEXT,
  opened_at DATETIME,
  clicked_at DATETIME,
  bounced_at DATETIME,
  FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
);

CREATE INDEX idx_registration_emails_ticket 
  ON registration_emails(ticket_id);
CREATE INDEX idx_registration_emails_type 
  ON registration_emails(email_type, sent_at);
CREATE INDEX idx_registration_emails_brevo 
  ON registration_emails(brevo_message_id);

-- Migration Down
DROP TABLE IF EXISTS registration_emails;
```

### Task_1_1_04: Add Transaction Registration Fields
- **Assignee**: database-evolution-specialist
- **Execution**: Independent
- **Duration**: 2 hours
- **PRD Requirements**: REQ-DB-001, REQ-SEC-001
- **Technical Details**:
  - Create migration file `017_add_transaction_registration.sql`
  - Add registration token fields to transactions table
  - Add token expiration tracking
  - Add registration completion tracking
  - Create index for token lookups
- **Acceptance Criteria**:
  - Token can be stored and retrieved efficiently
  - Expiration logic can be queried
  - Registration status trackable at transaction level
- **Testing**:
  - Test token storage and retrieval
  - Verify index performance
  - Test completion status updates
- **PRD Validation**: Enables token security from REQ-SEC-001

```sql
-- Migration Up
ALTER TABLE transactions ADD COLUMN registration_token TEXT;
ALTER TABLE transactions ADD COLUMN registration_token_expires DATETIME;
ALTER TABLE transactions ADD COLUMN registration_initiated_at DATETIME;
ALTER TABLE transactions ADD COLUMN registration_completed_at DATETIME;
ALTER TABLE transactions ADD COLUMN all_tickets_registered BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX idx_transactions_registration_token 
  ON transactions(registration_token) 
  WHERE registration_token IS NOT NULL;

-- Migration Down
DROP INDEX IF EXISTS idx_transactions_registration_token;
ALTER TABLE transactions DROP COLUMN all_tickets_registered;
ALTER TABLE transactions DROP COLUMN registration_completed_at;
ALTER TABLE transactions DROP COLUMN registration_initiated_at;
ALTER TABLE transactions DROP COLUMN registration_token_expires;
ALTER TABLE transactions DROP COLUMN registration_token;
```

## Success Criteria
- All migrations apply successfully to test database
- Rollback scripts tested and verified
- Performance benchmarks met (<50ms for queries)
- Foreign key relationships maintain data integrity
- All PRD requirements REQ-DB-001 through REQ-DB-004 satisfied

## Testing Checklist
- [ ] Migrations apply to empty database
- [ ] Migrations apply to database with existing data
- [ ] Rollback scripts revert all changes
- [ ] Indexes improve query performance
- [ ] Constraints prevent invalid data
- [ ] Foreign keys maintain referential integrity
- [ ] All required fields are present and typed correctly

## Notes
- Run migrations in sequence: 014 → 015 → 016 → 017
- Test on staging with production data volume before deployment
- Backup production database before applying migrations
- Monitor query performance after deployment