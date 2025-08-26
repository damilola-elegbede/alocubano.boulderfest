# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## A Lo Cubano Boulder Fest - Cuban Salsa Festival Website

**Festival Dates**: May 15-17, 2026  
**Location**: Avalon Ballroom, Boulder, CO

## Critical Development Rules

**NEVER use --no-verify** - Test failures indicate real problems that need fixing.

```bash
# ❌ FORBIDDEN
git commit --no-verify
git push --no-verify

# ✅ REQUIRED - Fix failures first
npm test && git commit
npm test && git push
```

## Common Commands

### Development

```bash
# Start with ngrok tunnel (recommended)
npm start  # https://alocubanoboulderfest.ngrok.io

# Local development
npm run start:local  # http://localhost:3000

# Simple HTTP server (no API)
npm run serve:simple  # http://localhost:8000
```

### Testing

```bash
# Run streamlined test suite (default)
npm test                     # All essential tests (24 tests, ~1.3s)

# Test execution modes
npm run test:simple         # Same as npm test
npm run test:simple:watch   # Watch mode for development
npm run test:coverage       # With coverage report

# E2E testing
npm run test:e2e            # Playwright end-to-end tests
npm run test:e2e:ui         # Interactive UI mode

# Health checks
npm run test:health         # API health verification
npm run test:smoke          # Quick smoke tests

# All tests (streamlined + E2E)
npm run test:all            # Complete test suite
```

### Database

```bash
# Development Database Migrations
npm run migrate:up           # Run pending migrations
npm run migrate:status       # Check migration status
npm run migrate:verify       # Verify integrity

# Database access
npm run db:shell            # SQLite shell
npm run health:database     # Health check
```

### E2E Test Database Management

End-to-end testing requires isolated database operations with built-in safety mechanisms:

```bash
# E2E Database Setup
npm run db:e2e:setup        # Create tables and insert test data
npm run db:e2e:validate     # Validate existing database schema
npm run db:e2e:clean        # Remove test data only
npm run db:e2e:reset        # Full reset - drop and recreate everything

# E2E Database Migration Management
npm run migrate:e2e:up      # Run E2E database migrations
npm run migrate:e2e:status  # Check E2E migration status
npm run migrate:e2e:validate # Validate E2E schema integrity
npm run migrate:e2e:reset   # Reset E2E migrations completely

# E2E Database Health Check
curl -f http://localhost:3000/api/health/e2e-database | jq '.'
```

**E2E Database Safety Features:**
- **Environment Flags**: Requires `E2E_TEST_MODE=true` or `ENVIRONMENT=e2e-test`
- **Database URL Validation**: Warns if database URL doesn't contain "test" or "staging"
- **Automatic Test Data Cleanup**: Removes test data matching `%@e2e-test.%` patterns
- **Schema Validation**: Verifies required tables and columns exist
- **Migration Isolation**: Separate migration tracking from development database

### Deployment

```bash
# Quality gates
npm run lint                # ESLint + HTMLHint
npm run deploy:check        # Pre-deployment validation

# Deployment
npm run deploy:staging      # Stage with quality gates
git push origin main        # Auto-deploy to production
```

## Architecture Overview

### Frontend
- **Vanilla JavaScript** ES6 modules - no framework dependencies
- **Typography-forward design** with Bebas Neue, Playfair Display, Space Mono
- **Virtual gallery** with Google Drive integration and lazy loading
- **Floating cart** with intelligent page-specific visibility rules
- **Mobile-first** with slide-in navigation and 44px touch targets

### Backend (Vercel Serverless)
- **SQLite database** with Turso for production
- **Async services** using Promise-Based Lazy Singleton pattern
- **Email** via Brevo (SendinBlue) with webhook processing
- **Payments** via Stripe Checkout with webhook handling
- **Wallet passes** for Apple/Google with JWT authentication
- **Admin panel** with bcrypt auth and JWT sessions

### Testing
- **Streamlined test suite** with Vitest - 96% complexity reduction (419 vs 11,411 lines)
- **24 essential tests** covering critical API contracts and business flows
- **395ms execution time** for complete test suite
- **Playwright** for E2E tests
- **Zero abstractions** - every test readable by any JavaScript developer
- **Direct API calls** - no complex mocking or test infrastructure

## Key API Patterns

### Database Service Pattern

All async services MUST use this pattern to prevent race conditions:

```javascript
// ✅ REQUIRED: Promise-based singleton
class AsyncService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null; // Cache the promise
  }

  async ensureInitialized() {
    if (this.initialized && this.instance) {
      return this.instance; // Fast path
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise; // Wait for existing
    }
    
    this.initializationPromise = this._performInitialization();
    
    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null; // Enable retry
      throw error;
    }
  }
}
```

### API Handler Pattern

```javascript
import { getDatabaseClient } from "./lib/database.js";

export default async function handler(req, res) {
  const client = await getDatabaseClient(); // Always await initialization
  const result = await client.execute("SELECT * FROM table");
  res.json(result.rows);
}
```

## Environment Variables

Required in `.env.local`:

```bash
# Email
BREVO_API_KEY=
BREVO_NEWSLETTER_LIST_ID=
BREVO_WEBHOOK_SECRET=

# Payments
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Database
TURSO_DATABASE_URL=      # Production only
TURSO_AUTH_TOKEN=        # Production only

# Admin
ADMIN_PASSWORD=          # bcrypt hash
ADMIN_SECRET=            # min 32 chars

# Wallet Passes
APPLE_PASS_KEY=          # base64 encoded
WALLET_AUTH_SECRET=      # JWT signing

# E2E Testing (optional)
E2E_TEST_MODE=true       # Enables E2E database operations
ENVIRONMENT=e2e-test     # Alternative way to enable E2E mode
```

## API Endpoints

### Email
- `POST /api/email/subscribe` - Newsletter signup
- `GET/POST /api/email/unsubscribe` - Unsubscribe with token
- `POST /api/email/brevo-webhook` - Process Brevo webhooks

### Payments
- `POST /api/payments/create-checkout-session` - Create Stripe session
- `POST /api/payments/stripe-webhook` - Handle payment webhooks
- `GET /api/payments/checkout-success` - Post-payment handler

### Tickets
- `GET /api/tickets/[ticketId]` - Ticket details
- `POST /api/tickets/validate` - Validate QR code
- `POST /api/tickets/register` - Register ticket attendee information
- `GET /api/tickets/apple-wallet/[ticketId]` - Apple Wallet pass
- `GET /api/tickets/google-wallet/[ticketId]` - Google Wallet pass

### Registration
- `GET /api/registration/[token]` - Registration status for all tickets
- `POST /api/registration/batch` - Register multiple tickets
- `GET /api/registration/health` - Registration system health

### Admin
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/dashboard` - Dashboard data
- `GET /api/admin/registrations` - Registration list

### Gallery
- `GET /api/gallery` - Google Drive photos/videos
- `GET /api/gallery/years` - Available years
- `GET /api/featured-photos` - Featured photos

### Health & Monitoring
- `GET /api/health/check` - General application health
- `GET /api/health/database` - Development database health
- `GET /api/health/e2e-database` - E2E database health (E2E mode only)

## Database Migrations

Located in `/migrations/*.sql`, run automatically on deployment.

Features:
- Transactional execution with rollback
- Checksum verification
- Handles comments and multi-line statements
- Tracks status in `migrations` table

## CI/CD Configuration

### GitHub Actions
- **Streamlined testing**: Single test command `npm test` runs 24 essential tests
- **Fast execution**: Complete test suite finishes in under 1 second
- **Memory efficient**: No complex test infrastructure or high memory usage
- **Reliable**: Direct API testing with minimal mocking

### Test Architecture
- **Test suites**:
  - Unit/contract (Vitest): api-contracts.test.js, basic-validation.test.js, smoke-tests.test.js, registration-api.test.js, registration-flow.test.js (24 tests)
  - E2E (Playwright): tests/e2e/flows/*.test.js, tests/e2e/smoke/*.spec.js (15+ tests)
- **419 total lines**: Massive reduction from 11,411 lines (96% complexity reduction)
- **Zero test frameworks**: No complex test builders, managers, or abstractions
- **Real API testing**: Tests interact with actual endpoints and services

## Floating Cart Visibility

Managed by `determineCartVisibility()` in `floating-cart.js`:

- **Always visible**: `/tickets`, `/donations`
- **Visible with items**: `/about`, `/artists`, `/schedule`, `/gallery`
- **Never visible**: `/404`, `/index.html`

## Performance Targets

- **Gallery**: Virtual scrolling for 1000+ images
- **Images**: Progressive loading (AVIF → WebP → JPEG)
- **API response**: <100ms target
- **Browser cache**: 24-hour for static assets
- **Test execution**: 1.3s for complete test suite (24 tests)
- **Test simplicity**: Zero abstractions, readable by any JavaScript developer

## Debugging

```javascript
// Gallery debugging
window.enableGalleryDebug();
window.galleryDebugAPI.getCacheStats();
window.galleryDebugAPI.clearCache();

// Cart debugging
console.log("Cart:", JSON.parse(localStorage.getItem("cart") || "[]"));
document.querySelector(".floating-cart").style.display = "block"; // Force show
```

## Project Structure

```
/
├── api/                 # Serverless functions
│   ├── lib/            # Shared services (async singletons)
│   ├── admin/          # Admin endpoints
│   ├── email/          # Email endpoints
│   ├── payments/       # Payment processing
│   ├── tickets/        # Ticket management
│   ├── registration/   # Registration endpoints
│   ├── gallery/        # Gallery endpoints
│   └── health/         # Health check endpoints
│       └── e2e-database.js # E2E database health monitoring
├── pages/              # HTML pages
├── js/                 # Frontend JavaScript
├── css/                # Stylesheets
├── tests/
│   ├── api-contracts.test.js    # API contract validation (6 tests)
│   ├── basic-validation.test.js # Input validation (8 tests)  
│   ├── smoke-tests.test.js      # Smoke tests (3 tests)
│   ├── helpers.js               # Simple test utilities
│   ├── setup.js                 # Minimal test setup
│   └── vitest.config.js         # Vitest configuration
├── migrations/         # Database migrations
├── scripts/            # Build and utility scripts
│   ├── setup-e2e-database.js   # E2E database automation
│   └── migrate-e2e.js          # E2E migration management
└── config/             # ESLint, HTMLHint configs
```

## Contact & Resources

**Email**: alocubanoboulderfest@gmail.com  
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

**Documentation**:
- [Installation Guide](INSTALLATION.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Async Initialization Guide](/docs/ASYNC_INITIALIZATION_GUIDE.md)
- [Testing Strategy](/docs/testing/TESTING_STRATEGY.md)
- [API Documentation](/docs/api/API_DOCUMENTATION.md)