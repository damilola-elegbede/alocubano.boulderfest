# Disaster Recovery Runbook

**Last Updated**: 2025-01-15
**Owner**: Database Team
**Review Schedule**: Quarterly

---

## Table of Contents

1. [Overview](#overview)
2. [Backup Strategy](#backup-strategy)
3. [Recovery Scenarios](#recovery-scenarios)
4. [Emergency Contacts](#emergency-contacts)
5. [Testing Schedule](#testing-schedule)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This runbook provides step-by-step procedures for recovering the A Lo Cubano Boulder Fest database from various failure scenarios. All recovery procedures should be tested quarterly to ensure reliability.

### Backup Tiers

| Tier | Method | Retention | RTO | RPO | Use Case |
|------|--------|-----------|-----|-----|----------|
| **Tier 1** | Turso PITR | 24 hours | <5 min | Near-zero | Same-day mistakes |
| **Tier 2** | Daily SQL Dumps | 30 days | 30-60 min | <24 hours | Recent data loss |
| **Tier 3** | Monthly Branches | 12 months | <1 min | 1 month | Historical access |

### Current Databases

- **Production**: `alocubano-boulderfest-prod`
- **Development**: `alocubano-boulderfest-dev`

---

## Backup Strategy

### Automated Backups

#### Daily Backups (Vercel Blob)

- **Schedule**: Daily at 3 AM UTC (8 PM Mountain Time previous day)
- **Workflow**: `.github/workflows/database-backup-daily.yml`
- **Storage**: Vercel Blob Storage
- **Retention**: 30 days
- **Format**: Compressed SQL dumps (.sql.gz)
- **Location**: `database-backups/prod/` and `database-backups/dev/`

#### Monthly Snapshots (Turso Branches)

- **Schedule**: 1st of each month at 3 AM UTC
- **Workflow**: `.github/workflows/database-snapshot-monthly.yml`
- **Storage**: Turso Database Platform
- **Retention**: 12 months
- **Format**: Turso database branches
- **Naming**: `{database-name}-{YYYY-MM}`

#### Native PITR (Turso Built-in)

- **Schedule**: Continuous (automatic)
- **Storage**: Turso/AWS S3
- **Retention**: 24 hours (free tier)
- **Format**: WAL fragments

### Manual Backups

Trigger backups manually via GitHub Actions:

```bash
# Daily backup (both databases)
gh workflow run database-backup-daily.yml

# Daily backup (specific database)
gh workflow run database-backup-daily.yml -f database=prod
gh workflow run database-backup-daily.yml -f database=dev

# Monthly snapshot
gh workflow run database-snapshot-monthly.yml

# Monthly snapshot (dry run)
gh workflow run database-snapshot-monthly.yml -f dry_run=true
```

---

## Recovery Scenarios

### Scenario 1: Recent Data Loss (Last 24 Hours)

**When to Use**: Accidental deletion, bad migration, or code bug within the last 24 hours.

**RTO**: 5-10 minutes
**RPO**: Near-zero (continuous backup)

#### Prerequisites

- Turso CLI installed and authenticated
- Know the approximate time of the incident

#### Step-by-Step Procedure

1. **Identify Recovery Timestamp**

   ```bash
   # Determine when the issue occurred
   # Example: 6 hours ago
   RECOVERY_TIME=$(date -u -d '6 hours ago' '+%Y-%m-%dT%H:%M:%S-00:00')
   echo "Recovery Timestamp: $RECOVERY_TIME"
   ```

2. **Create Point-in-Time Restore**

   ```bash
   # For production database
   turso db create alocubano-recovered-prod \
     --from-db alocubano-boulderfest-prod \
     --timestamp "$RECOVERY_TIME"

   # For development database
   turso db create alocubano-recovered-dev \
     --from-db alocubano-boulderfest-dev \
     --timestamp "$RECOVERY_TIME"
   ```

3. **Verify Restored Data**

   ```bash
   # Check ticket count
   turso db shell alocubano-recovered-prod \
     "SELECT COUNT(*) as ticket_count FROM tickets"

   # Check recent transactions
   turso db shell alocubano-recovered-prod \
     "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10"

   # Verify critical data
   turso db shell alocubano-recovered-prod \
     "SELECT COUNT(*) as active_tickets FROM tickets WHERE status = 'valid'"
   ```

4. **Get Connection Credentials**

   ```bash
   # Get database URL
   turso db show alocubano-recovered-prod

   # Generate auth token
   turso db tokens create alocubano-recovered-prod
   ```

5. **Update Vercel Environment Variables**

   ```bash
   # Update production database URL
   vercel env edit TURSO_DATABASE_URL production
   # Follow prompts to enter the new database URL

   # Update auth token
   vercel env edit TURSO_AUTH_TOKEN production
   # Follow prompts to enter the new auth token

   # Alternative: Remove and re-add if edit fails
   # vercel env rm TURSO_DATABASE_URL production
   # vercel env add TURSO_DATABASE_URL production
   # vercel env rm TURSO_AUTH_TOKEN production
   # vercel env add TURSO_AUTH_TOKEN production

   # Trigger redeployment
   vercel --prod
   ```

6. **Verify Application**
   - Visit production website
   - Check that data is correct
   - Test critical functionality (tickets, registrations, etc.)

7. **Clean Up (After Verification)**

   ```bash
   # Once confident recovery is successful:

   # Option A: Keep old database as backup
   turso db create alocubano-backup-old-prod \
     --from-db alocubano-boulderfest-prod

   # Then destroy original and rename recovered
   turso db destroy alocubano-boulderfest-prod --yes
   # Note: Cannot rename in Turso, so update env vars to point to recovered DB

   # Option B: Destroy recovered database if not needed
   turso db destroy alocubano-recovered-prod --yes
   ```

---

### Scenario 2: Data Loss (24 Hours - 30 Days Ago)

**When to Use**: Data loss discovered after 24 hours but within 30 days.

**RTO**: 30-60 minutes
**RPO**: Up to 24 hours (daily backups)

#### Prerequisites

- Access to Vercel Blob Storage
- Turso CLI installed
- `BLOB_READ_WRITE_TOKEN` configured

#### Step-by-Step Procedure

1. **List Available Backups**

   ```bash
   # Install Vercel CLI if needed
   npm install -g vercel

   # List recent backups
   node scripts/cleanup-old-backups.js --dry-run

   # Or manually via Vercel Blob API
   # Check: https://vercel.com/dashboard/stores
   ```

2. **Identify Correct Backup**
   - Backups are named: `backup-{env}-{YYYY-MM-DD}_{HH-MM-SS}.sql.gz`
   - Example: `backup-prod-2025-01-14_03-00-00.sql.gz`
   - Choose backup from before the data loss occurred

3. **Download Backup from Vercel Blob**

   ```bash
   # Get the blob URL from Vercel dashboard or API
   BLOB_URL="https://[your-blob-url].vercel-storage.com/..."

   # Download backup
   curl -o backup.sql.gz "$BLOB_URL"

   # Verify download
   ls -lh backup.sql.gz
   ```

4. **Decompress Backup**

   ```bash
   # Decompress the SQL dump
   gunzip backup.sql.gz

   # Verify SQL file
   head -n 20 backup.sql
   ```

5. **Create New Turso Database**

   ```bash
   # Create empty database for restoration
   turso db create alocubano-restored-prod

   # Get connection info
   turso db show alocubano-restored-prod
   turso db tokens create alocubano-restored-prod
   ```

6. **Import SQL Dump**

   ```bash
   # Option A: Via Turso shell (smaller dumps)
   cat backup.sql | turso db shell alocubano-restored-prod

   # Option B: Via libSQL client (larger dumps - more reliable)
   # Install libsql CLI: npm install -g @libsql/client
   # Then import using connection URL and token
   ```

7. **Verify Restored Data**

   ```bash
   # Check row counts
   turso db shell alocubano-restored-prod \
     "SELECT
        (SELECT COUNT(*) FROM tickets) as tickets,
        (SELECT COUNT(*) FROM transactions) as transactions,
        (SELECT COUNT(*) FROM registrations) as registrations"

   # Check latest data
   turso db shell alocubano-restored-prod \
     "SELECT MAX(created_at) as latest_data FROM tickets"
   ```

8. **Switch Application to Restored Database**
   - Follow steps 5-7 from Scenario 1

9. **Clean Up**

   ```bash
   # Delete downloaded files
   rm backup.sql backup.sql.gz
   ```

---

### Scenario 3: Historical Data Access (1-12 Months Ago)

**When to Use**: Need to access historical data for compliance, auditing, or analysis.

**RTO**: Immediate (read-only)
**RPO**: Monthly snapshot

#### Prerequisites

- Turso CLI installed and authenticated
- Know the approximate month needed

#### Step-by-Step Procedure

1. **List Available Monthly Snapshots**

   ```bash
   # List all databases
   turso db list

   # Filter for snapshots
   turso db list | grep -E "alocubano.*-20[0-9]{2}-[0-9]{2}"
   ```

2. **Identify Correct Snapshot**
   - Snapshots are named: `{database-name}-{YYYY-MM}`
   - Example: `alocubano-boulderfest-prod-2024-12`

3. **Query Historical Data**

   ```bash
   # Connect to historical snapshot
   turso db shell alocubano-boulderfest-prod-2024-12

   # Run queries
   SELECT COUNT(*) FROM tickets WHERE event_date = '2024-12-31';
   SELECT * FROM transactions WHERE created_at >= '2024-12-01' LIMIT 100;
   ```

4. **Export Specific Data (If Needed)**

   ```bash
   # Export to CSV
   turso db shell alocubano-boulderfest-prod-2024-12 \
     ".mode csv" \
     ".output december-tickets.csv" \
     "SELECT * FROM tickets WHERE event_date LIKE '2024-12%'" \
     ".quit"

   # Or export entire snapshot
   turso db shell alocubano-boulderfest-prod-2024-12 .dump > snapshot-2024-12.sql
   ```

5. **Use for Compliance/Auditing**
   - Data remains in snapshot (no restoration needed)
   - Can query anytime within 12-month retention
   - Read-only access preserves historical integrity

---

### Scenario 4: Catastrophic Failure (Turso Service Outage)

**When to Use**: Turso platform unavailable or account compromised.

**RTO**: 2-4 hours
**RPO**: Up to 24 hours

#### Prerequisites

- Latest daily backup from Vercel Blob
- Alternative database provider ready (e.g., new Turso account, Fly.io, Railway)
- Database migration scripts

#### Step-by-Step Procedure

1. **Download Latest Backup**
   - Follow steps 2-4 from Scenario 2

2. **Set Up Alternative Database**

   ```bash
   # Option A: New Turso Account
   # Create new account at https://turso.tech
   turso auth login
   turso db create alocubano-emergency-prod

   # Option B: Migrate to different provider
   # (Follow provider-specific SQLite import instructions)
   ```

3. **Import Latest Backup**
   - Follow step 6 from Scenario 2

4. **Update Application Configuration**

   ```bash
   # Update Vercel environment variables
   vercel env edit TURSO_DATABASE_URL production
   # Follow prompts to enter the new database URL

   vercel env edit TURSO_AUTH_TOKEN production
   # Follow prompts to enter the new auth token

   # Alternative: Remove and re-add if edit fails
   # vercel env rm TURSO_DATABASE_URL production
   # vercel env add TURSO_DATABASE_URL production
   # vercel env rm TURSO_AUTH_TOKEN production
   # vercel env add TURSO_AUTH_TOKEN production

   # Deploy immediately
   vercel --prod --force
   ```

5. **Notify Users**
   - Post status update
   - Inform about potential data loss (up to 24 hours)
   - Provide ETA for full recovery

6. **Manual Data Entry (If Critical)**
   - Identify transactions from last 24 hours (use Stripe dashboard)
   - Manually recreate tickets and registrations
   - Contact affected customers

---

## Emergency Contacts

### Internal Team

- **Database Admin**: [Your email]
- **DevOps Lead**: [Your email]
- **CTO/Technical Lead**: [Your email]

### External Services

- **Turso Support**: support@turso.tech
- **Vercel Support**: https://vercel.com/support
- **Stripe Support**: https://support.stripe.com

### Escalation Path

1. Attempt recovery using this runbook (30 minutes)
2. Contact Turso support if Turso-specific issue (1 hour)
3. Contact Vercel support if blob storage issue (1 hour)
4. Escalate to CTO if recovery unsuccessful (2 hours)
5. Implement catastrophic failure procedure (Scenario 4)

---

## Testing Schedule

### Quarterly Recovery Drills

**Schedule**: 1st Monday of each quarter (Jan, Apr, Jul, Oct)

#### Q1 Drill (January)

- Test Scenario 1: PITR restore to previous day
- Verify backup automation is working
- Review and update runbook

#### Q2 Drill (April)

- Test Scenario 2: Restore from SQL dump (1 week old)
- Verify Vercel Blob access
- Test import procedure

#### Q3 Drill (July)

- Test Scenario 3: Access monthly snapshot
- Verify query performance
- Test data export

#### Q4 Drill (October)

- Test Scenario 4: Full disaster recovery simulation
- Time each step
- Update RTO/RPO estimates

### Drill Checklist

- [ ] Schedule 2-hour maintenance window
- [ ] Notify team members
- [ ] Execute recovery procedure on development database
- [ ] Document execution time for each step
- [ ] Note any issues or improvements needed
- [ ] Update runbook with lessons learned
- [ ] Share results with team

---

## Troubleshooting

### Common Issues

#### Issue: Turso CLI Not Authenticated

**Symptoms**:

```text
Error: Not authenticated
```

**Solution**:

```bash
# Re-authenticate
turso auth login

# Or set token manually
mkdir -p ~/.config/turso
echo "$TURSO_AUTH_TOKEN" > ~/.config/turso/token
```

#### Issue: Backup Download Fails

**Symptoms**:

```text
Error: Failed to fetch blob
```

**Solution**:

```bash
# Verify BLOB_READ_WRITE_TOKEN
echo $BLOB_READ_WRITE_TOKEN

# Re-pull environment variables
vercel env pull .env.vercel

# Try alternate download method via Vercel dashboard
# https://vercel.com/dashboard/stores/blob
```

#### Issue: SQL Import Timeout

**Symptoms**:

```text
Error: Operation timed out
```

**Solution**:

```bash
# Split large SQL file into chunks
split -l 10000 backup.sql backup_chunk_

# Import chunks separately
for file in backup_chunk_*; do
  cat $file | turso db shell alocubano-restored-prod
done
```

#### Issue: Database Already Exists

**Symptoms**:

```text
Error: Database already exists
```

**Solution**:

```bash
# Use different name with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
turso db create alocubano-recovered-$TIMESTAMP

# Or destroy existing (CAREFUL!)
turso db destroy alocubano-recovered-prod --yes
turso db create alocubano-recovered-prod
```

#### Issue: Missing Data After Restore

**Symptoms**:

- Ticket count lower than expected
- Recent transactions missing

**Solution**:

1. Check backup timestamp - may be older than expected
2. Try more recent backup
3. Check for data in monthly snapshot
4. Contact Stripe for transaction records
5. Manual data entry as last resort

---

## Runbook Maintenance

### Review Schedule

- **Quarterly**: Test recovery procedures
- **After Incidents**: Document lessons learned
- **Annual**: Full runbook review and update

### Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-01-15 | 1.0 | Initial runbook creation | Claude |

### Next Review Date

**April 1, 2025**

---

## Additional Resources

- [Turso Documentation](https://docs.turso.tech)
- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [GitHub Actions Workflows](../.github/workflows/)
- [Backup Scripts](../scripts/)

---

**Remember**: In a real disaster, staying calm and following this runbook step-by-step is more important than rushing. Take time to verify each step before proceeding to the next.
