# Production Deployment Guide

This guide covers the complete deployment process for the A Lo Cubano Boulder Fest production data bootstrap system.

## Overview

The production data bootstrap system automatically populates essential database records during Vercel deployments. It runs as part of the build process: **migrations → bootstrap → build**.

## Deployment Process

### Automatic Deployment (Recommended)

The bootstrap system runs automatically during Vercel deployments with the following build sequence:

```bash
npm run migrate:vercel && npm run bootstrap:vercel && npm run build
```

### Manual Deployment

For manual deployment or testing:

```bash
# Local development
npm run bootstrap:local

# Vercel preview
npm run vercel:preview

# Production deployment
vercel --prod
```

## Environment Configuration

### Required Environment Variables

#### Production Environment
```bash
# Database (Required)
TURSO_DATABASE_URL=libsql://your-database-url.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Admin Access (Optional but Recommended)
ADMIN_EMAIL=admin@alocubanoboulderfest.org

# Security (Required for full functionality)
ADMIN_PASSWORD=bcrypt-hashed-password
ADMIN_SECRET=minimum-32-character-jwt-secret
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
BREVO_API_KEY=your-brevo-api-key
BREVO_NEWSLETTER_LIST_ID=your-list-id
BREVO_WEBHOOK_SECRET=your-webhook-secret
WALLET_AUTH_SECRET=minimum-32-character-wallet-secret
APPLE_PASS_KEY=base64-encoded-apple-pass-key
INTERNAL_API_KEY=minimum-32-character-internal-api-key
```

#### Preview Environment
```bash
# Database (Required)
TURSO_DATABASE_URL=libsql://your-preview-database-url.turso.io
TURSO_AUTH_TOKEN=your-preview-auth-token

# Admin Access (Optional)
ADMIN_EMAIL=admin@alocubanoboulderfest.org

# Test credentials for preview deployments
TEST_ADMIN_PASSWORD=test-admin-password-123
# ... other test credentials
```

#### Development Environment
```bash
# Local development can use SQLite or Turso
# No required environment variables for basic bootstrap functionality
# Optional: ADMIN_EMAIL for admin access setup
```

### Environment Variable Setup in Vercel

1. **Navigate to Vercel Dashboard** → Your Project → Settings → Environment Variables

2. **Add Production Variables** (set for "Production" environment):
   ```
   TURSO_DATABASE_URL
   TURSO_AUTH_TOKEN
   ADMIN_EMAIL
   ADMIN_PASSWORD
   ADMIN_SECRET
   STRIPE_PUBLISHABLE_KEY
   STRIPE_SECRET_KEY
   STRIPE_WEBHOOK_SECRET
   BREVO_API_KEY
   BREVO_NEWSLETTER_LIST_ID
   BREVO_WEBHOOK_SECRET
   WALLET_AUTH_SECRET
   APPLE_PASS_KEY
   INTERNAL_API_KEY
   ```

3. **Add Preview Variables** (set for "Preview" environment):
   ```
   TURSO_DATABASE_URL (preview database)
   TURSO_AUTH_TOKEN (preview auth token)
   ADMIN_EMAIL
   TEST_ADMIN_PASSWORD
   # ... other test credentials
   ```

## Bootstrap Configuration

### Configuration Files

Bootstrap data is defined in JSON configuration files:

- `/bootstrap/production.json` - Production events and settings
- `/bootstrap/preview.json` - Preview/staging events and settings
- `/bootstrap/development.json` - Development/testing events and settings

### Configuration Structure

```json
{
  "version": "1.0",
  "environment": "production",
  "metadata": {
    "created": "2025-01-18T00:00:00Z",
    "description": "Production bootstrap data"
  },
  "events": [
    {
      "slug": "event-slug",
      "name": "Event Name",
      "type": "festival|weekender|workshop|special",
      "status": "draft|upcoming|active|completed|cancelled",
      "description": "Event description",
      "venue": {
        "name": "Venue Name",
        "address": "6185 Arapahoe Road",
        "city": "Boulder",
        "state": "CO",
        "zip": "80301"
      },
      "dates": {
        "start": "2025-05-15",
        "end": "2025-05-17",
        "early_bird_end": "2025-03-15",
        "regular_price_start": "2025-04-01"
      },
      "capacity": 300,
      "display_order": 1,
      "is_featured": true,
      "is_visible": true,
      "settings": {
        "payment": {
          "stripe_enabled": true,
          "currency": "usd"
        },
        "registration": {
          "deadline_days": 7
        }
      },
      "ticket_types": [
        {
          "code": "full_festival",
          "name": "Full Festival Pass",
          "price": 299.00
        }
      ]
    }
  ],
  "admin_access": {
    "email": "${ADMIN_EMAIL}",
    "role": "admin",
    "events": ["*"],
    "granted_by": "bootstrap"
  }
}
```

## Deployment Verification

### Post-Deployment Checks

After each deployment, verify:

1. **Database Migration Status**
   ```bash
   # Check via API endpoint
   curl https://your-domain.com/api/health/database
   ```

2. **Bootstrap Success**
   - Check Vercel deployment logs for bootstrap success message
   - Verify events are visible on the website
   - Test admin access to dashboard

3. **Admin Panel Access**
   ```bash
   # Test admin login
   curl -X POST https://your-domain.com/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"password": "your-admin-password"}'
   ```

4. **API Endpoints**
   ```bash
   # Test key endpoints
   curl https://your-domain.com/api/health/check
   curl https://your-domain.com/api/gallery
   ```

### Troubleshooting

#### Bootstrap Failures

1. **Check Vercel Build Logs**
   - Look for bootstrap error messages
   - Verify environment variables are set
   - Check database connectivity

2. **Database Issues**
   ```bash
   # Test database connection locally
   npm run migrate:status
   ```

3. **Configuration Issues**
   - Validate JSON syntax in bootstrap files
   - Check required fields are present
   - Verify environment variable substitution

#### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Missing env vars | Bootstrap skips steps | Add required environment variables |
| Database timeout | Connection errors | Check Turso database status |
| Invalid JSON | Parse errors | Validate bootstrap configuration files |
| Migration failures | Bootstrap cannot run | Fix migration issues first |

## Rollback Procedures

### Emergency Rollback

1. **Vercel Rollback**
   ```bash
   # Rollback to previous deployment
   vercel rollback [deployment-url]
   ```

2. **Database Rollback**
   - Bootstrap operations are idempotent
   - Manual data cleanup may be required
   - Restore from database backup if available

3. **Configuration Rollback**
   ```bash
   # Revert bootstrap configuration
   git revert [commit-hash]
   git push origin main
   ```

### Gradual Rollback

1. **Disable Events**
   - Set `is_visible: false` in configuration
   - Redeploy to hide events temporarily

2. **Partial Rollback**
   - Remove specific events from configuration
   - Keep core functionality intact

## Monitoring

### Deployment Health

Monitor these endpoints post-deployment:

- `/api/health/check` - General application health
- `/api/health/database` - Database connectivity
- `/api/admin/dashboard` - Admin functionality
- `/api/gallery` - Gallery service

### Performance Metrics

- Bootstrap execution time: < 30 seconds
- Database migration time: < 60 seconds
- Build completion time: < 5 minutes

### Alerting

Set up monitoring for:

- Deployment failures
- Bootstrap script failures
- Database connectivity issues
- API endpoint availability

## CI/CD Integration

### GitHub Actions

The CI/CD pipeline automatically:

1. **Quality Gates** - Code quality, security, linting
2. **Unit Tests** - Fast essential test coverage
3. **Integration Tests** - Service validation
4. **E2E Tests** - Full application testing via Vercel Preview

### Deployment Triggers

- **Production**: Push to `main` branch
- **Preview**: Pull requests and feature branches
- **Manual**: Workflow dispatch with configurable options

### Environment-Specific Deployments

- **Development**: Local development server
- **Preview**: Vercel preview deployments with test data
- **Production**: Vercel production with live data

## Security Considerations

### Environment Variables

- Use Vercel's environment variable encryption
- Rotate secrets regularly
- Use different credentials for each environment
- Never commit secrets to version control

### Database Security

- Use Turso database with proper authentication
- Separate databases for production/preview/development
- Regular database backups
- Monitor for unauthorized access

### Access Control

- Admin access requires proper authentication
- API endpoints use proper security headers
- HTTPS enforced for all environments

## Support and Troubleshooting

### Contact Information

- **Technical Issues**: Check GitHub Issues
- **Deployment Issues**: Check Vercel deployment logs
- **Database Issues**: Check Turso dashboard

### Useful Commands

```bash
# Local development
npm run vercel:dev
npm run bootstrap:local
npm run test

# Deployment
npm run vercel:preview
vercel --prod

# Debugging
npm run migrate:status
npm run verify-structure
```

### Log Locations

- **Vercel Build Logs**: Vercel Dashboard → Deployments → [deployment] → Function Logs
- **Bootstrap Logs**: Included in build output with detailed progress
- **Application Logs**: Vercel Dashboard → Functions → Runtime Logs

---

## Quick Reference

### Deployment Checklist

✅ Environment variables configured in Vercel
✅ Bootstrap configuration files updated
✅ Database migrations tested
✅ Admin access credentials ready
✅ Monitoring and alerting configured
✅ Rollback plan prepared

### Emergency Contacts

- **Primary**: Check GitHub repository issues
- **Database**: Turso support dashboard
- **Hosting**: Vercel support dashboard

### Key URLs

- **Production**: https://www.alocubanoboulderfest.org
- **Admin Panel**: https://www.alocubanoboulderfest.org/admin
- **Health Check**: https://www.alocubanoboulderfest.org/api/health/check