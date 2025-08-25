# Rollback Procedures: Automatic Migrations System

## Overview

This document provides comprehensive rollback procedures for the automatic migrations system, covering various failure scenarios and recovery methods.

## Rollback Scenarios

### Scenario 1: Migration Failure During Execution

**Symptoms:**
- Migration partially applied
- API errors due to schema mismatch
- Lock held indefinitely

**Immediate Actions:**
1. Set `AUTO_MIGRATE=false` in Vercel Dashboard
2. Redeploy to stop automatic migration attempts
3. Check lock status: `GET /api/migrations/status`

**Recovery Steps:**
```bash
# 1. Connect to database
npm run db:shell

# 2. Check migration status
SELECT * FROM migrations ORDER BY applied_at DESC LIMIT 5;

# 3. Check lock status
SELECT * FROM migration_lock;

# 4. Release stuck lock if needed
DELETE FROM migration_lock WHERE id = 1;

# 5. Run rollback for failed migration
npm run migrate:rollback --version=<failed_version>

# 6. Verify schema state
npm run migrate:verify
```

### Scenario 2: Performance Degradation

**Symptoms:**
- Increased cold start times >500ms
- Lock contention causing timeouts
- Cache invalidation issues

**Immediate Actions:**
1. Disable auto-migrations: `AUTO_MIGRATE=false`
2. Increase cache TTL: `MIGRATION_CACHE_TTL=600000`
3. Monitor metrics for improvement

**Recovery Steps:**
1. Clear migration cache
2. Optimize lock timeout: `MIGRATION_LOCK_TIMEOUT=60000`
3. Enable optimistic checking mode
4. Consider build-time migration switch

### Scenario 3: Concurrent Migration Conflicts

**Symptoms:**
- Multiple functions attempting migrations
- Lock timeout errors in logs
- Inconsistent migration state

**Immediate Actions:**
1. Check active locks: `GET /api/migrations/status`
2. Force lock release if stuck
3. Disable auto-migrations temporarily

**Recovery Steps:**
```sql
-- Force release all locks
DELETE FROM migration_lock;

-- Reset migration tracking
UPDATE migrations 
SET applied_at = CURRENT_TIMESTAMP 
WHERE filename = '<problematic_migration>';

-- Verify consistency
SELECT * FROM migrations ORDER BY filename;
```

### Scenario 4: Production Emergency

**Symptoms:**
- Critical production errors
- Database inaccessible
- Complete migration system failure

**Immediate Actions:**
1. **EMERGENCY DISABLE**: Set `AUTO_MIGRATE=false`
2. **Bypass migrations**: Deploy hotfix with migration bypass
3. **Alert team**: Trigger incident response

**Recovery Steps:**
1. Roll back to previous deployment
2. Restore database from backup if needed
3. Apply migrations manually when stable
4. Post-mortem analysis

## Environment Variable Rollback

### Quick Disable
```bash
# Vercel Dashboard - Environment Variables
AUTO_MIGRATE=false               # Disable immediately
MIGRATION_DRY_RUN=true           # Preview mode only
MIGRATION_MAX_RETRIES=0          # Stop retries
```

### Progressive Re-enable
```bash
# Step 1: Dry run mode
MIGRATION_DRY_RUN=true
AUTO_MIGRATE=true

# Step 2: Limited rollout
AUTO_MIGRATE=true
MIGRATION_MAX_RETRIES=1

# Step 3: Full enable
AUTO_MIGRATE=true
MIGRATION_DRY_RUN=false
MIGRATION_MAX_RETRIES=3
```

## Code-Level Rollback

### Feature Flag Bypass
```javascript
// api/lib/database.js - Emergency bypass
const EMERGENCY_BYPASS = process.env.EMERGENCY_BYPASS === 'true';

async ensureInitialized() {
  if (EMERGENCY_BYPASS) {
    // Skip all migration logic
    return this._performInitialization();
  }
  // Normal flow with migrations
}
```

### Revert Commits
```bash
# Identify problematic commit
git log --oneline -10

# Revert migration changes
git revert <commit-hash>

# Deploy immediately
git push origin main
```

## Database Rollback Procedures

### Manual Migration Rollback
```bash
# 1. Connect to production database
npm run db:shell:prod

# 2. Begin transaction
BEGIN TRANSACTION;

# 3. Execute rollback SQL
-- Run rollback statements from migration file
-- Example: DROP TABLE new_table;

# 4. Update tracking table
DELETE FROM migrations 
WHERE filename = '<migration_to_rollback>';

# 5. Commit or rollback
COMMIT; -- or ROLLBACK if issues
```

### Point-in-Time Recovery
```bash
# For critical failures - restore from backup
# 1. Identify last good backup
vercel env pull .env.backup

# 2. Restore database
npm run db:restore --timestamp=<backup_time>

# 3. Replay necessary migrations
npm run migrate:up --from=<last_good_version>
```

## Monitoring During Rollback

### Key Metrics to Watch
- API error rates
- Database connection failures
- Lock acquisition timeouts
- Migration retry attempts
- Cold start durations

### Alert Thresholds
```yaml
Critical:
  - Migration failure rate >10%
  - Lock timeout >30s
  - API errors >5%

Warning:
  - Migration retry rate >50%
  - Cache miss rate >80%
  - Cold start >1000ms
```

## Post-Rollback Verification

### Health Checks
```bash
# 1. Migration system health
curl https://api.example.com/api/migrations/health

# 2. Database schema verification
npm run migrate:verify

# 3. API endpoint testing
npm run test:e2e

# 4. Lock table cleanup
npm run migrate:cleanup
```

### Validation Checklist
- [ ] AUTO_MIGRATE set correctly
- [ ] No stuck locks in database
- [ ] Migration tracking table consistent
- [ ] API endpoints responding normally
- [ ] Monitoring shows normal metrics
- [ ] No migration attempts in logs

## Prevention Measures

### Pre-Deployment Checks
1. Run migrations in staging first
2. Use dry-run mode for preview
3. Monitor staging for 24 hours
4. Review migration SQL carefully
5. Have rollback SQL ready

### Gradual Rollout
```bash
# Phase 1: Single function test
functions:
  "api/test-endpoint.js":
    env:
      AUTO_MIGRATE: "true"

# Phase 2: 10% of functions
# Phase 3: 50% of functions  
# Phase 4: Full rollout
```

## Emergency Contacts

### Escalation Path
1. **Level 1**: On-call engineer - Check runbook
2. **Level 2**: Database team - Schema issues
3. **Level 3**: Platform team - Infrastructure issues
4. **Level 4**: Incident commander - Major outage

### Communication Channels
- Slack: #incidents
- PagerDuty: migration-failures
- Email: database-team@example.com

## Recovery Time Objectives

| Scenario | Detection | Mitigation | Recovery |
|----------|-----------|------------|----------|
| Migration failure | <1 min | <5 min | <30 min |
| Lock deadlock | <2 min | <5 min | <15 min |
| Performance degradation | <5 min | <10 min | <30 min |
| Complete failure | <1 min | <2 min | <60 min |

## Lessons Learned Log

Document all rollback events:
- Date/Time of incident
- Root cause analysis
- Actions taken
- Time to recovery
- Prevention measures
- Process improvements

## Testing Rollback Procedures

### Regular Drills
- Monthly: Test lock release procedures
- Quarterly: Full rollback simulation
- Semi-annual: Disaster recovery exercise

### Validation
- Rollback procedures work as documented
- Team familiar with procedures
- Monitoring alerts properly configured
- Recovery time within objectives