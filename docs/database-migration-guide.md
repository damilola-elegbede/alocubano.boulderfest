# Database Migration Guide

## Overview

This guide documents the database migration system for the A Lo Cubano Boulder Fest ticketing platform, specifically focusing on the wallet tracking schema migration (Migration 009).

## Migration 009: Add Wallet Tracking

### Purpose
Adds critical columns for tracking wallet adoption and access methods:
- `wallet_source`: Tracks which wallet service (Apple/Google) was used
- Performance indexes for analytics queries
- Data validation constraints

### Prerequisites

Before running the migration:

1. **Environment Variables**
   ```bash
   TURSO_DATABASE_URL=your_database_url
   TURSO_AUTH_TOKEN=your_auth_token
   NODE_ENV=production
   ```

2. **Database Access**
   - Ensure database connection is stable
   - Verify sufficient storage for backups (minimum 2x database size)
   - Check no active transactions are running

3. **Dependencies**
   ```bash
   npm install  # Ensure all dependencies are installed
   ```

## Running the Migration

### Standard Migration

```bash
node scripts/run-migration.js
```

This will:
1. Create an automated backup
2. Validate current schema
3. Run dry-run to preview changes
4. Execute migration with rollback protection
5. Validate migration success
6. Test application endpoints
7. Clean up old backups

### Dry Run (Preview Only)

```bash
node scripts/run-migration.js --dry-run
```

Preview changes without applying them. Useful for:
- Reviewing SQL statements that will be executed
- Estimating migration time
- Validating migration file syntax

### Force Re-apply

```bash
node scripts/run-migration.js --force
```

Force migration even if already applied. Use when:
- Schema is partially corrupted
- Migration was marked complete but failed
- Testing migration procedures

## Migration Components

### 1. Backup Manager (`api/db/backup-manager.js`)

**Features:**
- Automated backup creation with compression
- Integrity verification using SHA-256 checksums
- 30-day retention policy with automatic cleanup
- Restore functionality with validation

**Usage:**
```javascript
import { BackupManager } from './api/db/backup-manager.js';

const manager = new BackupManager();

// Create backup
const backup = await manager.createBackup('pre_migration');

// Verify integrity
const valid = await manager.verifyBackupIntegrity(backup.path);

// Restore if needed
await manager.restoreFromBackup(backup.path);
```

### 2. Migration Runner (`api/db/rollback-procedures.js`)

**Features:**
- Atomic migration execution
- Automatic rollback on failure
- Migration status tracking
- Schema integrity validation

**Usage:**
```javascript
import { MigrationRunner } from './api/db/rollback-procedures.js';

const runner = new MigrationRunner();

// Run migration
const result = await runner.runMigration('009_add_wallet_tracking.sql');

// Validate
const valid = await runner.validateMigration('009');

// Rollback if needed
await runner.rollbackMigration('009');
```

### 3. Schema Validator (`scripts/validate-schema.js`)

**Features:**
- Column existence validation
- Data type verification
- Index performance testing
- Codebase reference scanning

**Usage:**
```bash
node scripts/validate-schema.js
```

Generates `schema-validation-report.json` with comprehensive analysis.

## Rollback Procedures

### Automatic Rollback

If migration fails, automatic rollback occurs:
1. Failure detected during execution
2. Backup automatically restored
3. Migration marked as failed
4. Original state recovered

### Manual Rollback

If automatic rollback fails:

```bash
# List available backups
ls -la ./backups/

# Identify pre-migration backup
# Look for: backup_*_pre_migration_009_*.db.gz

# Restore manually
node -e "
import { BackupManager } from './api/db/backup-manager.js';
const manager = new BackupManager();
await manager.restoreFromBackup('./backups/backup_XXX.db.gz');
"
```

### Emergency Recovery

If all else fails:

1. **Stop all services**
   ```bash
   # Stop application servers
   pm2 stop all
   ```

2. **Restore from latest backup**
   ```bash
   # Find latest backup
   ls -t ./backups/*.db.gz | head -1
   
   # Restore
   node scripts/restore-backup.js --file=backup_latest.db.gz
   ```

3. **Verify restoration**
   ```bash
   node scripts/validate-schema.js
   ```

4. **Restart services**
   ```bash
   pm2 restart all
   ```

## Monitoring

### Health Checks

Monitor migration progress:

```javascript
// Check migration status
const status = await runner.getMigrationStatus();
console.log('Applied migrations:', status.appliedMigrations);

// Validate schema integrity
const integrity = await runner.validateSchemaIntegrity();
console.log('Schema valid:', integrity.valid);
```

### Performance Metrics

After migration, monitor:
- Query execution times
- Index usage statistics
- Application response times

```bash
# Run performance tests
node -e "
import { SchemaValidator } from './scripts/validate-schema.js';
const validator = new SchemaValidator();
const perf = await validator.testQueryPerformance();
console.log(perf);
"
```

## Troubleshooting

### Common Issues

#### 1. "Database is locked"
**Cause:** Active transactions preventing migration
**Solution:** 
```bash
# Wait for transactions to complete
# Or restart database connection
```

#### 2. "Column already exists"
**Cause:** Partial migration or duplicate execution
**Solution:**
```bash
# Check current schema
node scripts/validate-schema.js

# Force re-apply if needed
node scripts/run-migration.js --force
```

#### 3. "Backup integrity check failed"
**Cause:** Corrupted backup file
**Solution:**
```bash
# Create new backup
node -e "
import { BackupManager } from './api/db/backup-manager.js';
await new BackupManager().createBackup('manual_backup');
"
```

#### 4. "Migration validation failed"
**Cause:** Schema changes not applied correctly
**Solution:**
```bash
# Check specific validation failures
node scripts/validate-schema.js

# Review migration log
cat migration.log

# Attempt manual fixes or rollback
```

### Log Files

Migration activity is logged to:
- `./migration.log` - Detailed migration logs
- `./schema-validation-report.json` - Schema validation results

### Getting Help

If issues persist:

1. Collect diagnostic information:
   ```bash
   # Generate diagnostic bundle
   tar -czf migration-debug.tar.gz \
     migration.log \
     schema-validation-report.json \
     backups/*.json
   ```

2. Review recent changes:
   ```bash
   git log --oneline -10
   git diff HEAD~1
   ```

3. Contact support with:
   - Error messages
   - Diagnostic bundle
   - Steps to reproduce

## Best Practices

### Before Migration

1. **Schedule maintenance window**
   - Notify users of potential downtime
   - Plan for 2x expected migration time

2. **Verify backups**
   ```bash
   # Test backup and restore process
   node -e "
   import { BackupManager } from './api/db/backup-manager.js';
   const manager = new BackupManager();
   const backup = await manager.createBackup('test');
   await manager.verifyBackupIntegrity(backup.path);
   "
   ```

3. **Review migration SQL**
   ```bash
   cat migrations/009_add_wallet_tracking.sql
   ```

### During Migration

1. **Monitor progress**
   - Watch migration.log in real-time
   - Monitor database CPU/memory usage
   - Check application error rates

2. **Be ready to rollback**
   - Keep backup path handy
   - Have rollback command ready
   - Monitor for anomalies

### After Migration

1. **Validate thoroughly**
   ```bash
   # Run full validation suite
   node scripts/validate-schema.js
   
   # Test critical endpoints
   npm test
   ```

2. **Monitor performance**
   - Check query execution times
   - Monitor application metrics
   - Watch for errors in logs

3. **Document changes**
   - Update schema documentation
   - Note any issues encountered
   - Record migration completion time

## Migration Safety Checklist

- [ ] Database backup created and verified
- [ ] Migration script reviewed
- [ ] Dry run completed successfully
- [ ] Rollback procedure tested
- [ ] Monitoring in place
- [ ] Team notified of migration window
- [ ] Application endpoints tested post-migration
- [ ] Performance validated
- [ ] Documentation updated
- [ ] Old backups cleaned up

## Appendix

### SQL Changes Applied

```sql
-- Add wallet tracking column
ALTER TABLE tickets ADD COLUMN wallet_source TEXT 
  CHECK (wallet_source IN ('apple_wallet', 'google_wallet') OR wallet_source IS NULL);

-- Add indexes for performance
CREATE INDEX idx_tickets_wallet_source 
  ON tickets(wallet_source) 
  WHERE wallet_source IS NOT NULL;

CREATE INDEX idx_tickets_wallet_analytics 
  ON tickets(wallet_source, qr_access_method, created_at)
  WHERE wallet_source IS NOT NULL;
```

### Environment Configuration

Required environment variables:
```bash
# Database
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Backup settings
BACKUP_RETENTION_DAYS=30  # Default: 30 days

# Environment
NODE_ENV=production
```

### File Structure

```
project/
├── api/
│   ├── db/
│   │   ├── backup-manager.js      # Backup management
│   │   └── rollback-procedures.js # Migration runner
│   └── lib/
│       └── database.js            # Database connection
├── migrations/
│   └── 009_add_wallet_tracking.sql # Migration SQL
├── scripts/
│   ├── run-migration.js           # Migration executor
│   └── validate-schema.js         # Schema validator
├── tests/
│   └── unit/
│       └── database-migration.test.js # Migration tests
└── backups/                       # Backup storage
    └── backup_*.db.gz             # Compressed backups
```

---

**Last Updated:** January 9, 2025
**Migration Version:** 009
**Status:** Production Ready