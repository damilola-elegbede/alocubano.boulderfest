# Installation Guide

Complete setup instructions for A Lo Cubano Boulder Fest website development environment.

## System Requirements

### Minimum Requirements
- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher (included with Node.js)
- **SQLite**: 3.9.0 or higher with JSON support
- **Git**: 2.20 or higher
- **Operating System**: macOS, Linux, or Windows 10/11

### Recommended Requirements
- **Node.js**: 20+ LTS
- **RAM**: 8GB or more
- **Storage**: 2GB free space
- **Internet**: Stable connection for dependencies and API integrations

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

# Verify installation
npm ls --depth=0
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

# Database (SQLite - no setup required for local development)
# Production database will use Turso
TURSO_DATABASE_URL=    # Leave empty for local SQLite
TURSO_AUTH_TOKEN=      # Leave empty for local SQLite

# Admin Access
ADMIN_PASSWORD=        # Generate with: npm run generate-admin-password
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

The application uses SQLite for local development, automatically creating the database file:

```bash
# Initialize database with migrations
npm run migrate:up

# Verify database setup
npm run migrate:status

# Test database connectivity
npm run health:database
```

### 5. Verification

Start the development server to verify installation:

```bash
# Start development server with ngrok tunnel (recommended)
npm start

# Alternative: Start local development server
npm run start:local

# Simple HTTP server (no API functions)
npm run serve:simple
```

### 6. Run Tests

Verify everything works correctly:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests (after setting up E2E database)
npm run test:e2e
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
npm run start:local    # Local development server
npm run serve:simple   # Simple HTTP server (no APIs)
```

### Testing
```bash
npm test               # Run all tests (24 tests, ~1.3s)
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
npm run test:e2e       # End-to-end tests
npm run test:all       # All tests including E2E
```

### Database Management
```bash
npm run migrate:up     # Run pending migrations
npm run migrate:status # Check migration status
npm run db:shell       # SQLite shell access
npm run health:database # Database health check
```

### Quality & Deployment
```bash
npm run lint           # ESLint + HTMLHint
npm run deploy:check   # Pre-deployment validation
npm run build          # Build for production
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

#### Database Connection Issues
```bash
# Reset database
rm -f data/development.db
npm run migrate:up

# Check SQLite installation
sqlite3 --version
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

#### Permission Issues
```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) ~/.npm

# Clean npm cache
npm cache clean --force
```

### E2E Testing Setup

For comprehensive end-to-end testing:

```bash
# Install Playwright browsers
npm run test:e2e:install

# Set up E2E database
npm run db:e2e:setup

# Verify E2E environment
npm run test:e2e:debug
```

### Performance Issues

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
  }
}
```

## Production Deployment

### Vercel Deployment
```bash
# Install Vercel CLI
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

## Support

### Getting Help
- **Documentation**: Check `/docs` folder
- **Issues**: Report on GitHub repository
- **Email**: alocubanoboulderfest@gmail.com

### Development Resources
- [Node.js Documentation](https://nodejs.org/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Brevo API Documentation](https://developers.brevo.com)

This installation guide provides everything needed to set up a complete development environment. For specific feature development, refer to the relevant documentation in the `/docs` folder.