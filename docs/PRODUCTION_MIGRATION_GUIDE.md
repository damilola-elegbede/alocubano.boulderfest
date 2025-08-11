# Production Migration Deployment Guide

## 🚀 Overview

This guide covers deploying database migrations to production on Vercel using your existing migration system.

Your migration system is already production-ready with:

- ✅ **Atomic transactions** (BEGIN/COMMIT/ROLLBACK)
- ✅ **Checksum verification** for data integrity
- ✅ **Sequential execution** with proper ordering
- ✅ **Comprehensive error handling**
- ✅ **SQL statement parsing** (handles comments, strings)
- ✅ **Migration status tracking**

## 🔧 Setup Instructions

### 1. **Environment Variables in Vercel**

Copy values from `.env.production.template` to **Vercel Dashboard** → **Project** → **Settings** → **Environment Variables**:

```bash
# Required Database Variables
TURSO_DATABASE_URL=libsql://your-production-database.turso.io
TURSO_AUTH_TOKEN=your-non-expiring-production-auth-token

# Required Application Variables
BREVO_API_KEY=your-production-brevo-api-key
BREVO_NEWSLETTER_LIST_ID=your-production-list-id
UNSUBSCRIBE_SECRET=your-production-unsubscribe-secret

# Required Security Variables
MIGRATION_SECRET_KEY=your-production-migration-secret-key
NODE_ENV=production
VERCEL_ENV=production
```

### 2. **Migration Deployment Options**

#### **Option A: Manual Migration (Recommended for Critical Updates)**

```bash
# 1. Check current migration status
npm run migrate:prod:check

# 2. Dry run to see what will be applied
npm run migrate:prod:dry-run

# 3. Deploy migrations to production
npm run migrate:prod:deploy

# 4. Verify deployment
npm run migrate:verify
```

#### **Option B: Build-time Migrations (Automatic)**

Update `package.json` build script to include migrations:

```json
{
  "scripts": {
    "build": "npm run migrate:prod && npm run verify-structure && echo 'Build process completed'"
  }
}
```

#### **Option C: API Endpoint (Advanced Users)**

Use the `/api/migrate` endpoint with proper authentication:

```bash
curl -X POST https://your-app.vercel.app/api/migrate \
  -H "Content-Type: application/json" \
  -H "x-migration-key: your-migration-secret-key" \
  -d '{"action": "run"}'
```

## 📋 Deployment Checklist

### **Pre-Deployment**

- [ ] **Database backup created** (use Turso CLI: `turso db replicate prod-db backup-db`)
- [ ] **Environment variables configured** in Vercel
- [ ] **Migration files tested** in staging environment
- [ ] **All tests passing** (`npm run test:database`)
- [ ] **Code review completed** for migration files

### **During Deployment**

- [ ] **Pre-flight checks passed** (`npm run migrate:prod:check`)
- [ ] **Dry run executed** (`npm run migrate:prod:dry-run`)
- [ ] **Production deployment** (`npm run migrate:prod:deploy`)
- [ ] **Verification completed** (`npm run migrate:verify`)

### **Post-Deployment**

- [ ] **Health check passed** (visit `/api/test-db`)
- [ ] **Application functionality verified**
- [ ] **Performance monitoring** for any regression
- [ ] **Backup cleanup** (remove old backups)

## 🔍 Migration Files Analysis

Your current migration files:

```
migrations/
├── 000_test.sql              # Test table (can be removed in prod)
├── 001_core_tables_simple.sql # Transactions table + triggers
├── 002_tickets_table.sql      # Tickets table + triggers
├── 003_transaction_items.sql  # Transaction items table
├── 004_payment_events.sql     # Payment events table
└── 005_final_indexes.sql      # Performance indexes
```

**Migration Order**: Files execute alphabetically (000 → 005)
**Safety Features**: Each migration uses `CREATE TABLE IF NOT EXISTS`

## 🛠️ Migration Commands

### **Local Development**

```bash
npm run migrate:up          # Run local migrations
npm run migrate:status      # Show migration status
npm run migrate:verify      # Verify migration integrity
```

### **Production Deployment**

```bash
npm run migrate:prod:check    # Pre-flight checks
npm run migrate:prod:dry-run  # Simulate deployment
npm run migrate:prod:deploy   # Execute migrations
```

### **Monitoring & Debugging**

```bash
npm run test:db             # Test database connectivity
curl https://your-app.vercel.app/api/test-db  # Production health check
```

## 🚨 Rollback Procedures

### **If Migration Fails Mid-Execution**

Your migration system uses atomic transactions, so failed migrations automatically rollback:

1. **Check migration status**: `npm run migrate:status`
2. **Review error logs** in Vercel function logs
3. **Fix migration file** if there's a SQL error
4. **Retry deployment**: `npm run migrate:prod:deploy`

### **If Migration Succeeds But Causes Issues**

1. **Immediate Response**:

   ```bash
   # Restore from backup
   turso db restore prod-db backup-db
   ```

2. **Create Rollback Migration**:

   ```sql
   -- migrations/006_rollback_feature.sql
   DROP TABLE IF EXISTS problematic_table;
   -- Add other rollback statements
   ```

3. **Deploy Rollback**:
   ```bash
   npm run migrate:prod:deploy
   ```

## 📊 Monitoring & Health Checks

### **Built-in Health Monitoring**

Your application includes comprehensive database monitoring:

- **Connection Testing**: `/api/test-db` endpoint
- **Migration Status**: Dynamic migration status tracking
- **Table Verification**: Automatic schema validation
- **Performance Metrics**: Query execution timing

### **Production Monitoring Dashboard**

Access: `https://your-app.vercel.app/api/test-db`

Returns:

```json
{
  "status": "healthy",
  "tests": {
    "connection": { "status": "passed" },
    "tables": { "status": "passed" },
    "migrations": { "status": "passed" },
    "configuration": { "status": "passed" }
  },
  "summary": {
    "passed": 4,
    "failed": 0,
    "successRate": "100%"
  }
}
```

## 🔐 Security Considerations

### **Migration API Security**

The `/api/migrate` endpoint includes:

- **Authentication required** in production
- **Secret key validation** (`MIGRATION_SECRET_KEY`)
- **Method restrictions** (POST only)
- **Action validation** (run/status/verify only)

### **Environment Variable Security**

- **Never commit** actual credentials to Git
- **Use Vercel's encrypted** environment variable storage
- **Rotate tokens** periodically
- **Use non-expiring tokens** for production stability

## 🚀 Quick Start for Production

1. **Setup Turso Production Database**:

   ```bash
   turso db create alocubano-boulderfest-prod
   turso db show alocubano-boulderfest-prod --url
   turso db tokens create alocubano-boulderfest-prod --expiration=never
   ```

2. **Configure Vercel Environment Variables** (use template above)

3. **Deploy with Migrations**:

   ```bash
   # Test first
   npm run migrate:prod:dry-run

   # Deploy for real
   npm run migrate:prod:deploy

   # Verify
   curl https://your-app.vercel.app/api/test-db
   ```

4. **Monitor Health**:
   - Check `/api/test-db` endpoint regularly
   - Monitor Vercel function logs
   - Set up alerts for database errors

## 📞 Support & Troubleshooting

### **Common Issues**

1. **"TURSO_DATABASE_URL environment variable is required"**
   - Verify environment variables in Vercel dashboard
   - Ensure variable names match exactly

2. **"Migration verification failed"**
   - Check if migration files were modified after execution
   - Run `npm run migrate:verify` to see checksum mismatches

3. **"Database connection failed"**
   - Verify Turso auth token is still valid
   - Check database URL format: `libsql://your-db.turso.io`

4. **"Migration already executed"**
   - This is normal - migrations are idempotent
   - Check status with `npm run migrate:status`

### **Getting Help**

- **Check logs**: Vercel Dashboard → Functions → View Function Logs
- **Test connectivity**: `npm run test:db`
- **Migration status**: `npm run migrate:status`
- **Health check**: Visit `/api/test-db` endpoint

Your migration system is robust and production-ready! 🎉
