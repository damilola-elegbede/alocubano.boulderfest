# Installation Guide

Complete setup instructions for A Lo Cubano Boulder Fest website development environment.

## System Requirements

### Minimum Requirements

- **Node.js**: 22.x (required)
- **npm**: 10.0.0 or higher (included with Node.js)
- **Vercel CLI**: Global installation required for E2E testing (`npm i -g vercel`)
- **SQLite**: 3.9.0 or higher with JSON support
- **Git**: 2.20 or higher
- **Operating System**: macOS, Linux, or Windows 10/11

### Recommended Requirements

- **Node.js**: 22.x LTS
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
# Edit .env.local with your configuration

# Database initialization
npm run migrate:up

# Verification
npm test                       # Run unit tests (fast execution)
npm run test:e2e               # Run E2E tests (Vercel Preview Deployments)

# Start development
npm run vercel:dev             # Development server with ngrok tunnel
```

## Installation Steps

### 1. Repository Setup

```bash
# Clone the repository
git clone https://github.com/damilola-elegbede/alocubano.boulderfest.git
cd alocubano.boulderfest

# Verify Node.js version
node --version  # Should be 22.x
npm --version   # Should be 10.0.0+
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
ADMIN_PASSWORD=            # Generate with bcrypt hashing
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
```

### 5. Verification

Start the development server to verify installation:

```bash
# Start development server with ngrok tunnel (recommended)
npm run vercel:dev

# Alternative: Start development server locally
npm start
```

### 6. Run Tests

Verify everything works correctly:

```bash
# Run unit tests (fast execution)
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run E2E tests with Vercel Preview Deployments
npm run test:e2e

# Run all tests
npm test && npm run test:integration && npm run test:e2e
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

### Streamlined Script Set

The project uses essential commands for all development needs:

```bash
# Core Development
npm run vercel:dev             # Development server with ngrok tunnel
npm start                      # Alias for npm run vercel:dev
npm run build                  # Production build
npm run vercel:preview         # Vercel preview deployment

# Testing (Streamlined)
npm test                       # Unit tests (fast execution)
npm run test:integration       # Integration tests
npm run test:e2e               # E2E tests with Vercel Preview Deployments
npm run test:coverage          # Coverage reports

# Quality & Build Verification
npm run lint                   # Code quality (ESLint + HTMLHint + Markdown)
npm run verify-structure       # Verify project structure (via build)

# Database Management
npm run migrate:up             # Run database migrations
npm run migrate:status         # Check migration status
```

## CI/CD Setup

### Overview

The project includes comprehensive CI/CD automation using GitHub Actions for testing, quality assurance, and deployment with **Vercel Preview Deployments** for E2E testing.

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

Create `.github/workflows/ci.yml` with **Vercel Preview Deployments** integration:

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
          node-version: '22'
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

  unit-tests:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
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

  integration-tests:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}

      - name: Run integration tests
        run: npm run test:integration
        env:
          CI: true
          NODE_ENV: test
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}

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
          node-version: '22'
          cache: 'npm'

      - name: Install Vercel CLI
        run: npm i -g vercel

      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}

      - name: Run E2E tests with Vercel Preview Deployments
        run: npm run test:e2e
        env:
          PLAYWRIGHT_BROWSER: ${{ matrix.browser }}
          CI: true
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}
          ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
          ADMIN_SECRET: ${{ secrets.ADMIN_SECRET }}

  quality-gates:
    needs: [unit-tests, integration-tests, e2e-tests]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}

      - name: Run linting
        run: npm run lint
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
    ✅ integration-tests
    ✅ e2e-tests (chromium)
    ✅ e2e-tests (firefox)
    ✅ e2e-tests (webkit)
    ✅ quality-gates
✅ Require branches to be up to date before merging
✅ Require linear history
✅ Include administrators
```

### Local CI Testing

Test CI workflows locally before pushing:

```bash
# Install Vercel CLI globally
npm i -g vercel

# Run complete test pipeline
npm test && npm run test:integration && npm run test:e2e

# Test specific components
npm run lint                   # Test quality gates
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
npm run vercel:dev
```

#### Database Connection Issues

```bash
# Reset local database
rm -f data/development.db
npm run migrate:up

# Check SQLite installation
sqlite3 --version
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

#### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Use different port
PORT=3001 npm run vercel:dev
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

# Use lightweight development approach
npm run vercel:dev
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
npm run vercel:preview
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
- E2E tests pass across all browsers with **Vercel Preview Deployments**
- Performance benchmarks are met

## Streamlined Development Experience

### Current Essential Scripts

The project focuses on the commands you actually need:

```bash
# Core Development
npm run vercel:dev             # Development server with ngrok tunnel
npm start                      # Alias for npm run vercel:dev
npm run build                  # Production build
npm run vercel:preview         # Vercel preview deployment

# Testing Suite
npm test                       # Unit tests (fast execution)
npm run test:integration       # Integration tests
npm run test:e2e               # E2E tests with Vercel Preview Deployments
npm run test:coverage          # Coverage reports

# Quality & Build Verification
npm run lint                   # Complete code quality (ESLint + HTMLHint + Markdown)
npm run verify-structure       # Verify project structure (via build)

# Database Management
npm run migrate:up             # Run database migrations
npm run migrate:status         # Check migration status
```

**Benefits:**

- **Clear purpose**: Each script has a single, well-defined responsibility
- **Simplified workflow**: Focus on Vercel Preview Deployments for E2E testing
- **Predictable naming**: Standard command naming conventions
- **Essential only**: Only the commands needed for development

## Support

### Getting Help

- **Documentation**: Check `/docs` folder
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

This installation guide provides everything needed to set up a complete development environment with streamlined commands, comprehensive database configuration, **Vercel Preview Deployments** for E2E testing, and CI/CD integration.