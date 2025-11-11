# Database Migrations

Complete guide to database schema migrations for A Lo Cubano Boulder Fest.

## Overview

The migration system provides automated, version-controlled database schema changes with rollback capabilities, integrity verification, and SQLite-specific optimizations.

## Migration Architecture

### Migration Files

**Location**: `/migrations/*.sql`

**Naming Convention**: `YYYYMMDD_HHMMSS_description.sql`

**Example**:

```text
migrations/
├── 20250101_120000_create_tickets_table.sql
├── 20250102_150000_add_user_email_index.sql
└── 20250103_180000_create_analytics_table.sql
```

### Tracking System

**Table**: `migrations`

**Schema**:

```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  checksum TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_migrations_filename ON migrations(filename);
```

## Running Migrations

### Command Line

**Run all pending migrations**:

```bash
npm run migrate:up
```

**Check migration status**:

```bash
npm run migrate:status
```

**Verify migration integrity**:

```bash
node scripts/migrate.js verify
```

### Programmatic Usage

```javascript
import { MigrationSystem } from './scripts/migrate.js';

const migration = new MigrationSystem();

// Run migrations
await migration.runMigrations();

// Check status
const status = await migration.status();
console.log(`Pending: ${status.pending}, Executed: ${status.executed}`);

// Cleanup
await migration.cleanup();
```

## Creating Migrations

### File Structure

```sql
-- Migration: Add email notifications
-- Created: 2025-09-30
-- Description: Add email_notifications table for tracking sent emails

-- Create table
CREATE TABLE IF NOT EXISTS email_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  email_type TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_email_notifications_user_id
ON email_notifications(user_id);

-- Create index for status tracking
CREATE INDEX IF NOT EXISTS idx_email_notifications_status
ON email_notifications(status);
```

### Best Practices

**Use Idempotent Operations**:

```sql
-- ✅ GOOD: Can run multiple times safely
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ❌ BAD: Will fail on second run
CREATE TABLE users (...);
CREATE INDEX idx_users_email ON users(email);
```

**Split Complex Changes**:

```sql
-- ✅ GOOD: Separate migrations
-- 20250101_120000_add_user_columns.sql
ALTER TABLE users ADD COLUMN phone TEXT;

-- 20250101_130000_populate_user_phones.sql
UPDATE users SET phone = '000-000-0000' WHERE phone IS NULL;

-- ❌ BAD: Single complex migration
ALTER TABLE users ADD COLUMN phone TEXT;
UPDATE users SET phone = '000-000-0000' WHERE phone IS NULL;
-- (If UPDATE fails, you're left with inconsistent state)
```

**Order Operations Correctly**:

```sql
-- ✅ GOOD: Create table before index
CREATE TABLE users (...);
CREATE INDEX idx_users_email ON users(email);

-- ❌ BAD: Index before table
CREATE INDEX idx_users_email ON users(email);
CREATE TABLE users (...);
```

**Handle Dependencies**:

```sql
-- ✅ GOOD: Create parent table first
CREATE TABLE users (...);
CREATE TABLE tickets (
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ❌ BAD: Foreign key before parent table exists
CREATE TABLE tickets (
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE users (...);
```

## Rollback Procedures

### Understanding SQLite Limitations

**SQLite Does NOT Support**:

- `ALTER TABLE DROP COLUMN` (before SQLite 3.35.0)
- `ALTER TABLE MODIFY COLUMN`
- `ALTER TABLE RENAME COLUMN` (before SQLite 3.25.0)
- Complex constraint modifications

### Manual Rollback Strategy

Since automated rollback is limited in SQLite, follow this process:

#### Step 1: Identify Failed Migration

```bash
npm run migrate:status
```

**Output**:

```text
Available migrations: 25
Executed migrations:  24
Pending migrations:   1

❌ Migration failed: 20250930_150000_add_complex_constraints.sql
```

#### Step 2: Create Rollback Migration

**Failed Migration** (`20250930_150000_add_complex_constraints.sql`):

```sql
ALTER TABLE users ADD COLUMN verified BOOLEAN DEFAULT FALSE;
CREATE INDEX idx_users_verified ON users(verified);
```

**Rollback Migration** (`20250930_160000_rollback_verified_column.sql`):

```sql
-- SQLite < 3.35: Must recreate table without column
-- Step 1: Create new table without the column
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data (excluding dropped column)
INSERT INTO users_new (id, email, name, created_at)
SELECT id, email, name, created_at FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX idx_users_email ON users(email);

-- Step 6: Drop the index we're rolling back
DROP INDEX IF EXISTS idx_users_verified;
```

**SQLite 3.35+** (Simpler):

```sql
-- Modern SQLite supports DROP COLUMN
ALTER TABLE users DROP COLUMN verified;
DROP INDEX IF EXISTS idx_users_verified;
```

#### Step 3: Execute Rollback

```bash
# Run the rollback migration
npm run migrate:up
```

### Common Rollback Scenarios

#### Scenario 1: Rolling Back Added Column

**Original**:

```sql
ALTER TABLE users ADD COLUMN phone TEXT;
```

**Rollback** (SQLite < 3.35):

```sql
-- Recreate table without the column
CREATE TABLE users_new AS
SELECT id, email, name, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE INDEX idx_users_email ON users(email);
```

**Rollback** (SQLite 3.35+):

```sql
ALTER TABLE users DROP COLUMN phone;
```

#### Scenario 2: Rolling Back Table Creation

**Original**:

```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  message TEXT
);
```

**Rollback**:

```sql
DROP TABLE IF EXISTS notifications;
```

#### Scenario 3: Rolling Back Index Creation

**Original**:

```sql
CREATE INDEX idx_users_email ON users(email);
```

**Rollback**:

```sql
DROP INDEX IF EXISTS idx_users_email;
```

#### Scenario 4: Rolling Back Data Changes

**Original**:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

**Rollback**:

```sql
-- Requires backup or previous value knowledge
UPDATE users SET role = 'user' WHERE email = 'admin@example.com';
```

**Best Practice**: Always backup data before migrations:

```bash
# SQLite backup
sqlite3 database.db ".backup backup-$(date +%Y%m%d-%H%M%S).db"
```

### Rollback Verification

**After rollback, verify**:

1. **Migration status**:

   ```bash
   npm run migrate:status
   ```

2. **Database integrity**:

   ```bash
   node scripts/migrate.js verify
   ```

3. **Application functionality**:

   ```bash
   npm test
   ```

## SQLite Migration Caveats

### ALTER TABLE Limitations

**Supported Operations**:

- `ADD COLUMN` (SQLite 3.1.0+)
- `RENAME TO` (rename table)
- `RENAME COLUMN` (SQLite 3.25.0+)
- `DROP COLUMN` (SQLite 3.35.0+)

**NOT Supported** (requires table recreation):

- Change column type
- Add/remove constraints (except NOT NULL in some cases)
- Modify column defaults (retroactively)
- Reorder columns

### Table Recreation Pattern

When you need unsupported operations, use this pattern:

```sql
-- Example: Change column type from TEXT to INTEGER

-- Step 1: Create new table with correct schema
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  age INTEGER,  -- Changed from TEXT
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy and transform data
INSERT INTO users_new (id, email, age, created_at)
SELECT id, email, CAST(age AS INTEGER), created_at
FROM users
WHERE age IS NOT NULL AND age != '';

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX idx_users_email ON users(email);

-- Step 6: Recreate triggers (if any)
CREATE TRIGGER update_users_timestamp
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### Foreign Key Handling

**Issue**: Foreign keys reference the old table during recreation

**Solution**: Temporarily disable foreign keys

```sql
-- Disable foreign key enforcement
PRAGMA foreign_keys = OFF;

-- Perform table recreation
-- ... (steps above)

-- Re-enable foreign key enforcement
PRAGMA foreign_keys = ON;

-- Verify integrity
PRAGMA foreign_key_check;
```

### Foreign Key Safety During Parent Table Recreation

**Critical Insight**: `PRAGMA foreign_keys = OFF` disables FK **enforcement** but NOT FK **schema auto-updates** during `ALTER TABLE RENAME`.

**The Problem**: Migration 060

```sql
-- ❌ UNSAFE PATTERN - Orphans child FK constraints
PRAGMA foreign_keys = OFF;

ALTER TABLE ticket_types RENAME TO ticket_types_backup;  -- ← Child FKs auto-update to "_backup"
CREATE TABLE ticket_types (...);
INSERT INTO ticket_types SELECT * FROM ticket_types_backup;
DROP TABLE ticket_types_backup;  -- ← Orphans the child FK permanently!

PRAGMA foreign_keys = ON;
```

**Root Cause**: SQLite automatically updates FK references in child tables during `ALTER TABLE RENAME` regardless of `PRAGMA foreign_keys = OFF`. When you later `DROP` the backup table, child table FK constraints point to a non-existent table.

**The Fix**: Migration 061 (SAFE Pattern)

```sql
-- ✅ SAFE PATTERN - Allows SQLite to auto-reconnect child FKs
PRAGMA foreign_keys = OFF;

-- Step 1: Create new table with correct schema
CREATE TABLE tickets_new (...
  ticket_type_id TEXT REFERENCES ticket_types(id) ON DELETE SET NULL,
  ...
);

-- Step 2: Copy all data
INSERT INTO tickets_new SELECT * FROM tickets;

-- Step 3: Drop old table (temporarily orphans child FKs)
DROP TABLE tickets;

-- Step 4: Rename new table (SQLite auto-fixes orphaned child FKs)
ALTER TABLE tickets_new RENAME TO tickets;

-- Step 5: Re-enable and verify
PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
```

**Why This Works**:
1. `DROP TABLE tickets` orphans child FK constraints (e.g., `scan_logs.ticket_id`)
2. `RENAME tickets_new TO tickets` triggers SQLite's FK auto-update
3. SQLite automatically reconnects orphaned child FKs to the renamed table

**Migration Pattern Summary**:

| Pattern | Steps | Child FK Behavior | Result |
|---------|-------|-------------------|--------|
| UNSAFE | RENAME → DROP | Auto-updates then orphans | ❌ Broken FKs |
| SAFE | CREATE → DROP → RENAME | Orphans then auto-reconnects | ✅ Fixed FKs |

**Real-World Impact**: Manual ticket creation was completely broken for weeks because `tickets.ticket_type_id` pointed to deleted `ticket_types_backup` table.

**Verification Queries**:

```sql
-- Check for orphaned backup tables
SELECT name FROM sqlite_master
WHERE type='table' AND name LIKE '%backup%';
-- Should return 0 rows

-- Check FK constraint target
PRAGMA foreign_key_list(tickets);
-- tickets.ticket_type_id should reference "ticket_types", not "ticket_types_backup"

-- Verify no FK violations
PRAGMA foreign_key_check;
-- Should return 0 rows
```

**Reference**: See migrations/061_fix_orphaned_ticket_type_fk.sql for complete implementation.

### Transaction Behavior

**SQLite Characteristics**:

- Supports transactions (BEGIN, COMMIT, ROLLBACK)
- LibSQL auto-commits individual statements
- Turso uses LibSQL protocol

**Migration System Approach**:

```javascript
// Statement-by-statement execution (no explicit transactions)
for (const statement of migration.statements) {
  await client.execute(statement); // Auto-committed
}
```

**Why No Transactions?**:

1. LibSQL auto-commits individual statements
2. Complex migrations often can't be atomic in SQLite
3. Better error isolation for debugging

### Index Creation with Missing Columns

**Problem**: Index references column that doesn't exist yet

**Example**:

```sql
-- This will fail if email column doesn't exist
CREATE INDEX idx_users_email ON users(email);
```

**Solution**: Migration system handles this gracefully

```javascript
// Automatically skips if column doesn't exist
if (errorMessage.includes('no such column')) {
  console.warn('Index creation skipped - column may not exist');
  return true; // Treat as idempotent
}
```

## Migration Patterns

### Pattern 1: Simple Table Creation

```sql
-- Create a new table with indexes
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  location TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_dates
ON events(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_events_location
ON events(location);
```

### Pattern 2: Adding Column with Default

```sql
-- Add column with default value
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';

-- Create index for new column
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Backfill existing rows (if default isn't sufficient)
UPDATE users SET status = 'active' WHERE status IS NULL;
```

### Pattern 3: Table Relationship Changes

```sql
-- Create linking table
CREATE TABLE IF NOT EXISTS user_events (
  user_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_events_user_id
ON user_events(user_id);

CREATE INDEX IF NOT EXISTS idx_user_events_event_id
ON user_events(event_id);
```

### Pattern 4: Data Migration

```sql
-- Migrate data from old structure to new
-- Step 1: Create new structure
CREATE TABLE IF NOT EXISTS tickets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  ticket_type TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Step 2: Copy data with transformation
INSERT INTO tickets_new (id, event_id, user_id, ticket_type, price_cents)
SELECT id, event_id, user_id, type, CAST(price * 100 AS INTEGER)
FROM tickets
WHERE event_id IS NOT NULL AND user_id IS NOT NULL;

-- Step 3: Swap tables (manual verification required)
-- DROP TABLE tickets;
-- ALTER TABLE tickets_new RENAME TO tickets;
```

### Pattern 5: Trigger Creation

```sql
-- Create trigger for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create trigger for audit logging
CREATE TRIGGER IF NOT EXISTS log_user_changes
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, changed_at)
  VALUES ('users', NEW.id, 'UPDATE', CURRENT_TIMESTAMP);
END;
```

## Troubleshooting

### Problem: Migration Fails Midway

**Symptoms**:

```text
❌ Migration failed: 20250930_150000_add_constraints.sql
Statement execution failed: no such column: new_column
```

**Solutions**:

1. **Check statement order** - Ensure dependencies are created first

2. **Review SQL syntax** - Validate SQL in separate SQLite session

3. **Check for missing IF NOT EXISTS** - Makes migrations idempotent

4. **Create rollback migration** - Follow manual rollback procedure

### Problem: Duplicate Migration Records

**Symptoms**:

```text
⚠️  Found 3 files with duplicates:
  - 20250101_120000_create_users.sql: 5 records
```

**Solution**: Automatic cleanup runs during initialization

```javascript
// System automatically deduplicates on next migration run
await migration.initializeMigrationsTable();
// Cleaned up 4 duplicate migration entries
```

### Problem: Checksum Mismatch

**Symptoms**:

```text
❌ Checksum mismatch for 20250101_120000_create_users.sql
```

**Cause**: Migration file was modified after execution

**Solutions**:

1. **Never modify executed migrations** - Create new migration instead

2. **If intentional**, update checksum:

   ```sql
   UPDATE migrations
   SET checksum = 'new-checksum-here'
   WHERE filename = '20250101_120000_create_users.sql';
   ```

3. **If unintentional**, restore original file from git

### Problem: Foreign Key Constraint Violations

**Symptoms**:

```text
❌ FOREIGN KEY constraint failed
```

**Solutions**:

1. **Create parent tables first** - Order migrations correctly

2. **Temporarily disable foreign keys**:

   ```sql
   PRAGMA foreign_keys = OFF;
   -- Perform migration
   PRAGMA foreign_keys = ON;
   ```

3. **Use CASCADE clauses** for automatic cleanup:

   ```sql
   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   ```

## Security Considerations

### SQL Injection Prevention

**Parameterized Queries**:

```javascript
// ✅ GOOD: Parameterized
await client.execute(
  "SELECT * FROM migrations WHERE filename = ?",
  [filename]
);

// ❌ BAD: String concatenation
await client.execute(
  `SELECT * FROM migrations WHERE filename = '${filename}'`
);
```

### Backup Before Migrations

**Production Workflow**:

```bash
# 1. Backup database
sqlite3 production.db ".backup backup-$(date +%Y%m%d-%H%M%S).db"

# 2. Run migrations
npm run migrate:up

# 3. Verify
npm run migrate:status
npm test

# 4. If failed, restore backup
cp backup-20250930-150000.db production.db
```

### Migration File Integrity

**Checksum Verification**:

```bash
node scripts/migrate.js verify
```

**Output**:

```text
🔍 Verifying migration integrity...
✅ All migrations verified successfully
```

## Related Documentation

- [Database Schema](./DATABASE_SCHEMA.md)
- [SQLite Best Practices](./SQLITE_GUIDE.md)
- [Deployment Guide](./DEPLOYMENT.md)