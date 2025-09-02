# Installation Guide

Complete setup instructions for A Lo Cubano Boulder Fest website development environment.

## System Requirements

### Minimum Requirements

- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher (included with Node.js)
- **Vercel CLI**: Global installation required for E2E testing (`npm i -g vercel`)
- **SQLite**: 3.9.0 or higher with JSON support
- **Git**: 2.20 or higher
- **Operating System**: macOS, Linux, or Windows 10/11

### Recommended Requirements

- **Node.js**: 20+ LTS
- **RAM**: 8GB or more
- **Storage**: 2GB free space
- **Internet**: Stable connection for dependencies and API integrations

## Quick Start

For immediate setup with testing:

```bash
# Clone and install
git clone https://github.com/damilola-elegbede/alocubano.boulderfest.git
cd alocubano.boulderfest
npm install

# Install Vercel CLI for E2E testing
npm i -g vercel

# Environment setup
cp .env.example .env.local
npm run generate-admin-password  # Follow prompts to set ADMIN_PASSWORD

# Database initialization
npm run migrate:up

# Verification
npm test                    # Run unit tests (26 tests, fast execution)
npm run test:e2e:install   # Install E2E browsers
npm run test:e2e          # Run E2E tests (uses Vercel Dev server)

# Start development
npm start  # With ngrok tunnel (recommended)
```

## Installation Steps

### 1. Repository Setup

```bash
# Clone the repository
git clone https://github.com/damilola-elegbede/alocubano.boulderfest.git
cd alocubano.boulderfest

# Verify Node.js version
node --version  # Should be 18.0.0+
npm --version   # Should be 8.0.0+
```

### 2. Dependencies Installation

```bash
# Install all dependencies
npm install

# Install Vercel CLI globally (REQUIRED for E2E testing)
npm i -g vercel

# Verify installation
npm ls --depth=0
vercel --version  # Should show Vercel CLI version
```

### 3. Environment Configuration

#### Create Environment File

```bash
# Copy the example environment file
cp .env.example .env.local
```

#### Essential Environment Variables

Edit `.env.local` with the following minimum configuration:

```bash
# ================================================
# REQUIRED FOR LOCAL DEVELOPMENT
# ================================================

# Database Configuration
# Local development uses SQLite automatically
TURSO_DATABASE_URL=         # Required for E2E tests and production
TURSO_AUTH_TOKEN=          # Required for E2E tests and production

# Admin Access
ADMIN_PASSWORD=            # Generate with: npm run generate-admin-password
ADMIN_SECRET=your-secure-session-secret-min-32-chars

# ================================================
# OPTIONAL FOR EXTENDED FUNCTIONALITY  
# ================================================

# Email Service (Brevo/SendinBlue)
BREVO_API_KEY=your-brevo-api-key
BREVO_NEWSLETTER_LIST_ID=1

# Payment Processing (Stripe)
STRIPE_PUBLISHABLE_KEY=pk_test_your-key
STRIPE_SECRET_KEY=sk_test_your-key

# Google Drive Gallery Integration
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="your-private-key"

# E2E Testing Mode (optional)
E2E_TEST_MODE=true         # Enables E2E database operations
ENVIRONMENT=e2e-test       # Alternative way to enable E2E mode

# Environment
NODE_ENV=development
```

### 4. Database Setup

#### Local Development Database

The application uses SQLite for local development, automatically creating the database file:

```bash
# Initialize database with migrations
npm run migrate:up

# Verify database setup
npm run migrate:status

# Test database connectivity
npm run health:database
```

#### Turso Database Setup for E2E Testing and Production

Turso is required for E2E testing and production deployments:

##### 1. Create Turso Account

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login to Turso
turso auth login
```

##### 2. Create Development Database

```bash
# Create a database for development/testing
turso db create alocubano-boulderfest-dev

# Get database URL and auth token
turso db show alocubano-boulderfest-dev
turso db tokens create alocubano-boulderfest-dev
```

##### 3. Configure Environment Variables

Add to your `.env.local`:

```bash
# Turso Configuration for E2E Tests
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your-auth-token-here
```

##### 4. Initialize Turso Database

```bash
# Run migrations on Turso database
npm run migrate:up

# Verify Turso connection
npm run health:database
```

### 5. E2E Database Management

End-to-end testing with **Vercel Dev** requires isolated database operations with comprehensive safety mechanisms:

```bash
# Setup E2E database (creates tables and test data)
npm run db:e2e:setup

# Validate E2E database schema
npm run db:e2e:validate

# Clean E2E test data (preserves schema)
npm run db:e2e:clean

# Full E2E database reset (use with caution)
npm run db:e2e:reset

# E2E database health check
curl -f http://localhost:3000/api/health/e2e-database | jq '.'
```

**E2E Database Safety Features:**

- **Environment Validation**: Requires `E2E_TEST_MODE=true` or `ENVIRONMENT=e2e-test`
- **URL Validation**: Warns if database URL doesn't contain "test" or "staging"
- **Automatic Cleanup**: Removes test data matching `%@e2e-test.%` patterns
- **Schema Validation**: Verifies required tables and columns exist
- **Migration Isolation**: Separate migration tracking from development database

### 6. Vercel Dev Setup for E2E Testing

**NEW**: E2E testing now uses **Vercel Dev** instead of custom CI server for production-like testing:

```bash
# Verify Vercel CLI installation
vercel --version

# Login to Vercel (if deploying)
vercel login

# Test Vercel dev server
npm run start:local  # Should start Vercel dev on port 3000

# Validate E2E setup
npm run test:e2e:validate
```

### 7. Verification

Start the development server to verify installation:

```bash
# Start development server with ngrok tunnel (recommended)
npm start

# Alternative: Start Vercel dev server locally
npm run start:local

# Simple HTTP server (no API functions)
npm run serve:simple
```

### 8. Run Tests

Verify everything works correctly:

```bash
# Run unit tests (26 tests, fast execution)
npm test

# Run with coverage
npm run test:coverage

# Install E2E testing browsers
npm run test:e2e:install

# Run E2E tests with Vercel Dev server
npm run test:e2e

# Run all tests (unit + E2E)
npm run test:all
```

## Service Configurations

### Email Service (Brevo/SendinBlue)

1. **Sign up** at [brevo.com](https://brevo.com)
2. **Get API key** from Settings → API Keys
3. **Create contact list** for newsletter
4. **Set up webhook** for email events

```bash
# Add to .env.local
BREVO_API_KEY=your-api-key
BREVO_NEWSLETTER_LIST_ID=your-list-id
BREVO_WEBHOOK_SECRET=your-webhook-secret
```

### Payment Processing (Stripe)

1. **Sign up** at [stripe.com](https://stripe.com)
2. **Get test API keys** from Dashboard → Developers → API keys
3. **Set up webhooks** for payment events

```bash
# Add to .env.local
STRIPE_PUBLISHABLE_KEY=pk_test_your-publishable-key
STRIPE_SECRET_KEY=sk_test_your-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### Google Drive Gallery

1. **Create Google Cloud Project** at [console.cloud.google.com](https://console.cloud.google.com)
2. **Enable Google Drive API**
3. **Create Service Account** and download JSON credentials
4. **Share target folder** with service account email

```bash
# Add to .env.local
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY="your-private-key-with-newlines"
```

## Development Commands

### Server Management

```bash
npm start              # Start with ngrok tunnel (recommended)
npm run start:local    # Vercel dev server locally
npm run serve:simple   # Simple HTTP server (no APIs)
```

### Testing

```bash
npm test                          # Run unit tests (26 tests, fast execution)
npm run test:watch               # Watch mode for development
npm run test:coverage            # With coverage report
npm run test:e2e           # End-to-end tests (uses Vercel Dev server)
npm run test:e2e:ui              # E2E tests with interactive UI
npm run test:all                 # All tests including E2E

# E2E browser management
npm run test:e2e:install         # Install Playwright browsers
npm run test:e2e:update          # Update browsers to latest version

# Health checks
npm run test:health              # API health verification
npm run test:smoke               # Quick smoke tests
```

### Database Management

```bash
# Development Database
npm run migrate:up               # Run pending migrations
npm run migrate:status           # Check migration status
npm run db:shell                 # SQLite shell access
npm run health:database          # Database health check

# E2E Database Management (works with Vercel Dev)
npm run db:e2e:setup            # Create E2E tables and test data
npm run db:e2e:validate         # Validate E2E database schema
npm run db:e2e:clean            # Remove E2E test data only
npm run db:e2e:reset            # Full E2E database reset

# E2E Database Migrations
npm run migrate:e2e:up          # Run E2E database migrations
npm run migrate:e2e:status      # Check E2E migration status
npm run migrate:e2e:validate    # Validate E2E schema integrity
npm run migrate:e2e:reset       # Reset E2E migrations completely
```

### Quality & Deployment

```bash
npm run lint                    # ESLint + HTMLHint
npm run deploy:check            # Pre-deployment validation
npm run build                   # Build for production
```

## CI/CD Setup

### Overview

The project includes comprehensive CI/CD automation using GitHub Actions for testing, quality assurance, and deployment with **Vercel Dev** for E2E testing.

### GitHub Actions Configuration

#### 1. Repository Secrets Setup

Configure the following secrets in your GitHub repository (Settings → Secrets and variables → Actions):

**Required Secrets:**

```bash
# Database Configuration
TURSO_DATABASE_URL          # Production database URL
TURSO_AUTH_TOKEN           # Production database authentication token

# Service API Keys
STRIPE_SECRET_KEY          # Payment processing (use test keys)
BREVO_API_KEY             # Email service integration
ADMIN_PASSWORD            # Admin panel testing (bcrypt hashed)
ADMIN_SECRET              # JWT signing secret (32+ characters)

# Optional Services
GOOGLE_DRIVE_FOLDER_ID    # Gallery integration
GOOGLE_SERVICE_ACCOUNT_EMAIL # Google Drive service account
GOOGLE_PRIVATE_KEY        # Google service account private key (base64 encoded)
```

#### 2. Workflow Files

Create `.github/workflows/ci.yml` with **Vercel Dev** integration:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      cache-hit: ${{ steps.cache-deps.outputs.cache-hit }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install Vercel CLI
        run: npm i -g vercel
          
      - name: Cache dependencies
        id: cache-deps
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
          
      - name: Install dependencies
        if: steps.cache-deps.outputs.cache-hit != 'true'
        run: npm ci
        
      - name: Setup environment with Vercel Dev
        run: npm run db:e2e:setup
        env:
          CI: true
          NODE_ENV: test
          E2E_TEST_MODE: true
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}

  unit-tests:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
          
      - name: Run unit tests
        run: npm test
        env:
          CI: true
          NODE_ENV: test
          
      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-test-results
          path: |
            test-results/
            coverage/

  e2e-tests:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install Vercel CLI
        run: npm i -g vercel
          
      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
          
      - name: Install Playwright browsers
        run: npm run test:e2e:install
        
      - name: Setup E2E environment with Vercel Dev
        run: npm run db:e2e:setup
        env:
          CI: true
          NODE_ENV: test
          E2E_TEST_MODE: true
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}
          ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
          ADMIN_SECRET: ${{ secrets.ADMIN_SECRET }}
          
      - name: Run E2E tests with Vercel Dev
        run: npm run test:e2e
        env:
          PLAYWRIGHT_BROWSER: ${{ matrix.browser }}
          CI: true
          
      - name: Upload E2E results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-results-${{ matrix.browser }}
          path: |
            test-results/
            playwright-report/

  quality-gates:
    needs: [unit-tests, e2e-tests]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
          
      - name: Run linting
        run: npm run lint
        
      - name: Run quality gates
        run: npm run quality:gates
        
      - name: Generate PR status report
        run: npm run pr:status-summary
        
      - name: Upload quality report
        uses: actions/upload-artifact@v4
        with:
          name: quality-report
          path: .tmp/ci/
```

#### 3. Branch Protection Rules

Configure branch protection rules in GitHub (Settings → Branches):

```bash
# Enable the following for the main branch:
✅ Require a pull request before merging
✅ Require approvals: 1
✅ Dismiss stale PR approvals when new commits are pushed
✅ Require review from code owners
✅ Require status checks to pass before merging
   - Required status checks:
     ✅ setup
     ✅ unit-tests  
     ✅ e2e-tests (chromium)
     ✅ e2e-tests (firefox)
     ✅ e2e-tests (webkit)
     ✅ quality-gates
✅ Require branches to be up to date before merging
✅ Require linear history
✅ Include administrators
```

### Local CI Testing

Test CI workflows locally with Vercel Dev before pushing:

```bash
# Install Vercel CLI globally
npm i -g vercel

# Setup E2E environment locally
npm run db:e2e:setup

# Run complete CI pipeline
npm run test:all

# Test specific CI components
npm run test:e2e            # Test E2E with Vercel Dev
npm run quality:gates       # Test quality gates
```

## Troubleshooting

### Common Issues

#### Node.js Version Issues

```bash
# Check version
node --version

# Update Node.js
# macOS: brew install node
# Windows: Download from nodejs.org
# Linux: Use package manager or nvm
```

#### Vercel CLI Issues

```bash
# Install Vercel CLI globally
npm i -g vercel

# Verify installation
vercel --version

# Login if needed
vercel login

# Test Vercel dev server
npm run start:local
```

#### Database Connection Issues

```bash
# Reset local database
rm -f data/development.db
npm run migrate:up

# Check SQLite installation
sqlite3 --version

# Test database connectivity
npm run health:database
```

#### Turso Connection Issues

Common Turso connection problems and solutions:

**Issue**: `TURSO_DATABASE_URL` not set
```bash
# Verify environment variables
echo $TURSO_DATABASE_URL
echo $TURSO_AUTH_TOKEN

# Set in .env.local (development)
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-token-here
```

**Issue**: Authentication failed
```bash
# Regenerate auth token
turso db tokens create your-database-name

# Verify token has correct permissions
turso db tokens list your-database-name
```

**Issue**: Database not found
```bash
# List available databases
turso db list

# Create database if missing
turso db create your-database-name

# Verify database exists
turso db show your-database-name
```

**Issue**: Migration failures on Turso
```bash
# Check migration status
npm run migrate:status

# Manually verify schema
turso db shell your-database-name
.schema

# Reset and re-run migrations (use with caution)
npm run migrate:reset
npm run migrate:up
```

**Issue**: E2E database setup fails
```bash
# Enable E2E mode
export E2E_TEST_MODE=true

# Verify E2E database setup
npm run db:e2e:validate

# Reset E2E database if corrupted
npm run db:e2e:reset
```

#### E2E Testing Issues with Vercel Dev

**Issue**: Vercel CLI not installed
```bash
# Install globally
npm i -g vercel

# Verify installation
vercel --version

# Test Vercel dev server
npm run start:local
```

**Issue**: E2E tests timeout with Vercel Dev
```bash
# Increase timeout in playwright.config.js
timeout: 60000  # 60 seconds

# Run with debug mode
npm run test:e2e:debug

# Validate setup
npm run test:e2e:validate
```

**Issue**: E2E database connection fails
```bash
# Check E2E environment variables
echo $E2E_TEST_MODE
echo $TURSO_DATABASE_URL

# Validate E2E database schema
npm run db:e2e:validate

# Reset E2E database
npm run db:e2e:reset
```

#### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Use different port
PORT=3001 npm start
```

#### Environment Variable Issues

```bash
# Verify environment file exists
ls -la .env.local

# Check environment loading
node -e "require('dotenv').config({ path: '.env.local' }); console.log(process.env.NODE_ENV);"
```

#### Performance Issues

If the development server is slow:

```bash
# Clear all caches
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Use simple server for frontend-only development
npm run serve:simple
```

## IDE Setup

### VS Code Extensions

- **ESLint** - JavaScript linting
- **Prettier** - Code formatting
- **SQLite Viewer** - Database inspection
- **REST Client** - API testing
- **Playwright Test** - E2E testing
- **GitHub Actions** - Workflow editing

### VS Code Settings

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.associations": {
    "*.js": "javascript"
  },
  "emmet.includeLanguages": {
    "javascript": "javascriptreact"
  },
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.yml"
  }
}
```

## Production Deployment

### Vercel Deployment

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Deploy to preview
npm run deploy:staging

# Deploy to production
vercel --prod
```

### Environment Variables for Production

Set these in Vercel dashboard:

- `TURSO_DATABASE_URL` - Production database
- `TURSO_AUTH_TOKEN` - Database authentication
- `BREVO_API_KEY` - Email service
- `STRIPE_SECRET_KEY` - Payment processing
- `ADMIN_PASSWORD` - Admin access
- All other service credentials

### CI/CD for Production

The GitHub Actions workflow automatically deploys to production when:

- Code is pushed to `main` branch
- All quality gates pass
- E2E tests pass across all browsers with **Vercel Dev**
- Performance benchmarks are met

## Migration Notes

### Breaking Changes - CI Server to Vercel Dev

**What Changed:**
- E2E tests now use **Vercel Dev** server instead of custom CI server (`scripts/ci-server.js`)
- Improved testing accuracy by using the same serverless environment as production
- Better API endpoint testing with real Vercel function execution

**Migration Required:**
1. **Install Vercel CLI globally**: `npm i -g vercel`
2. **Update E2E test commands**: Use `npm run test:e2e` (now uses Vercel Dev)
3. **Environment variables**: Ensure Turso credentials are set for E2E testing
4. **CI/CD adjustments**: Update workflows to use Vercel Dev for E2E testing

**Benefits:**
- **Production Parity**: Tests run in the same serverless environment as production
- **Real API Testing**: Actual Vercel function execution instead of mocked responses
- **Better Reliability**: More accurate testing of serverless architecture
- **Simplified Setup**: No need for custom CI server maintenance

**Troubleshooting:**
- If E2E tests fail, ensure `vercel` CLI is installed globally
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set
- Run `npm run test:e2e:validate` to check E2E prerequisites

## Support

### Getting Help

- **Documentation**: Check `/docs` folder
- **CI/CD Guide**: See [docs/ci-cd/README.md](docs/ci-cd/README.md)
- **Issues**: Report on GitHub repository
- **Email**: alocubanoboulderfest@gmail.com

### Development Resources

- [Node.js Documentation](https://nodejs.org/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)
- [Turso Documentation](https://docs.turso.tech)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Brevo API Documentation](https://developers.brevo.com)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright Documentation](https://playwright.dev/docs/intro)

### Database Resources

- [SQLite Documentation](https://sqlite.org/docs.html)
- [Turso CLI Guide](https://docs.turso.tech/reference/turso-cli)
- [LibSQL Documentation](https://docs.turso.tech/libsql)

This installation guide provides everything needed to set up a complete development environment with comprehensive database configuration, **Vercel Dev** for E2E testing, and CI/CD integration.