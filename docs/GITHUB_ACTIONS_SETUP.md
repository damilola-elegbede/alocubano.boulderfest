# 🚀 GitHub Actions Setup Guide

## Overview

Your repository now has professional CI/CD workflows that will:

✅ **Run quality checks** (linting, testing) on every push
✅ **Deploy migrations** safely before code deployment  
✅ **Deploy to staging** on feature branches
✅ **Deploy to production** on main branch pushes
✅ **Health check** applications after deployment
✅ **Auto-rollback** and create issues on failures

## 🔑 Required GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### **Vercel Integration Secrets**

```bash
# Get these from: https://vercel.com/account/tokens
VERCEL_TOKEN=your-vercel-token-here

# Get from: Vercel Dashboard → Settings → General
VERCEL_ORG_ID=your-org-id
VERCEL_PROJECT_ID=your-project-id
```

**How to get Vercel values:**

1. **VERCEL_TOKEN**: Vercel Dashboard → Settings → Tokens → Create Token
2. **VERCEL_ORG_ID & PROJECT_ID**: Run `vercel link` in your project, then check `.vercel/project.json`

### **Application Secrets**

```bash
# Your production Vercel URL (without https://)
VERCEL_PRODUCTION_URL=your-app.vercel.app

# Migration API secret key (generate a strong password)
MIGRATION_SECRET_KEY=your-strong-secret-key-here
```

## 📋 Setup Checklist

### **Step 1: Create GitHub Secrets**

- [ ] `VERCEL_TOKEN` - Your Vercel API token
- [ ] `VERCEL_ORG_ID` - Your Vercel organization ID
- [ ] `VERCEL_PROJECT_ID` - Your Vercel project ID
- [ ] `VERCEL_PRODUCTION_URL` - Your production domain
- [ ] `MIGRATION_SECRET_KEY` - Secret key for migration API

### **Step 2: Update Vercel Environment Variables**

Add the migration secret to Vercel production environment:

- [ ] `MIGRATION_SECRET_KEY` - Same value as GitHub secret

### **Step 3: Test Workflows**

1. **Test Staging Deployment:**

   ```bash
   # Create a feature branch and push
   git checkout -b feature/test-deployment
   git push origin feature/test-deployment
   ```

2. **Test Production Deployment:**
   ```bash
   # Push to main branch
   git checkout main
   git push origin main
   ```

### **Step 4: Verify Setup**

- [ ] Check GitHub Actions tab shows green builds
- [ ] Staging deployments create preview URLs
- [ ] Production deployments run migrations first
- [ ] Health checks pass after deployment
- [ ] Failed deployments create GitHub issues

## 🔄 Workflow Triggers

### **Staging Workflow** (`.github/workflows/deploy-staging.yml`)

- ✅ Pushes to `develop`, `staging`, `feature/*` branches
- ✅ Pull requests to `main` branch
- ✅ Runs tests and deploys to Vercel preview
- ✅ Comments on PRs with preview URL

### **Production Workflow** (`.github/workflows/deploy-production.yml`)

- ✅ Pushes to `main` branch
- ✅ Manual trigger (workflow_dispatch)
- ✅ Runs complete quality gates
- ✅ Deploys migrations first, then application
- ✅ Creates issues on failure

## 🗄️ Migration Process

The production workflow handles migrations automatically:

1. **Quality Checks** - Lint, test, database tests
2. **Migration Status** - Check what migrations are pending
3. **Deploy Migrations** - Apply database changes first
4. **Verify Migrations** - Ensure integrity and success
5. **Deploy Application** - Deploy code after DB is ready
6. **Health Check** - Verify everything works
7. **Success/Failure Notifications** - GitHub summaries and issues

## 🛠️ Manual Controls

### **Skip Migrations**

Sometimes you want to deploy code without running migrations:

1. Go to **Actions** tab → **Production Deployment**
2. Click **Run workflow**
3. Set "Skip database migrations" to `true`
4. Click **Run workflow**

### **Migration-Only Deployment**

Run just migrations without deploying code:

```bash
# Use your existing remote migration script
./scripts/remote-migrate.sh run
```

## 📊 Monitoring & Notifications

### **GitHub Summaries**

Each workflow run shows detailed summaries:

- Migration status and count
- Deployment URLs
- Health check results
- Performance metrics

### **Automatic Issue Creation**

Failed deployments automatically create GitHub issues with:

- Error details and logs
- Recovery steps
- Assigned labels (bug, production, urgent)

### **PR Comments**

Staging deployments comment on PRs with:

- Preview URL for testing
- Health status
- Test checklist

## 🚨 Troubleshooting

### **Common Setup Issues**

1. **"Invalid token" errors**
   - Verify `VERCEL_TOKEN` is correct and has permissions
   - Check token hasn't expired

2. **"Project not found" errors**
   - Verify `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are correct
   - Run `vercel link` locally and check `.vercel/project.json`

3. **Migration API failures**
   - Ensure `MIGRATION_SECRET_KEY` matches in both GitHub and Vercel
   - Check your production URL is accessible

4. **Health check failures**
   - Verify `VERCEL_PRODUCTION_URL` doesn't include `https://`
   - Check your `/api/test-db` endpoint works

### **Debug Workflow Issues**

1. **Check Actions tab** for detailed logs
2. **Review step-by-step** execution in failed runs
3. **Verify secrets** are set correctly
4. **Test endpoints manually** to isolate issues

## 🎯 Best Practices

### **Branch Strategy**

```bash
main           # Production deployments + migrations
├── develop    # Staging deployments
├── feature/*  # Preview deployments
└── hotfix/*   # Emergency fixes
```

### **Migration Safety**

- **Always test migrations** in staging first
- **Use feature flags** for risky changes
- **Keep migrations small** and focused
- **Have rollback plan** for major changes

### **Monitoring**

- **Watch GitHub Actions** for deployment status
- **Monitor health endpoints** after deployments
- **Set up alerts** for production issues
- **Review performance** regularly

## 📚 Workflow Files Explained

### **Production Workflow Features**

- **5 Jobs** running in sequence with proper dependencies
- **Quality gates** prevent bad code from reaching production
- **Migration safety** with pre-checks and verification
- **Health monitoring** ensures deployments are successful
- **Failure recovery** with automatic issue creation
- **Manual triggers** for emergency deployments

### **Staging Workflow Features**

- **Lightweight testing** for faster feedback
- **Preview deployments** for every branch/PR
- **PR comments** with test URLs and checklists
- **No database migrations** (uses existing staging data)

## 🎉 You're All Set!

Your GitHub Actions setup provides:

✅ **Enterprise-grade CI/CD** with proper quality gates
✅ **Safe migration deployment** with rollback capabilities
✅ **Automated testing** and health monitoring
✅ **Professional workflow** with notifications and summaries
✅ **Manual controls** for emergency situations

Push to `main` and watch your first automated production deployment! 🚀
