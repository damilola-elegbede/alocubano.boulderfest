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
npm test                     # All essential tests (26 unit tests)

# Test execution modes
npm run test:simple         # Same as npm test
npm run test:simple:watch   # Watch mode for development
npm run test:coverage       # With coverage report

# E2E testing (default - uses local development server)
npm run test:e2e            # 12 comprehensive E2E tests with CI config
npm run test:e2e:ui         # Interactive UI mode with CI config
npm run test:e2e:headed     # Headed browser mode with CI config
npm run test:e2e:debug      # Debug mode with CI config
npm run test:e2e:fast       # Fast mode (Chromium only) with CI config

# E2E testing with Vercel dev server (requires ngrok setup)
npm run test:e2e:vercel        # Full E2E tests with Vercel dev server
npm run test:e2e:vercel:ui     # Interactive UI mode with Vercel config
npm run test:e2e:vercel:headed # Headed browser mode with Vercel config
npm run test:e2e:vercel:debug  # Debug mode with Vercel config
npm run test:e2e:vercel:fast   # Fast mode (Chromium only) with Vercel config

# E2E testing with ngrok (automated environment setup)
npm run test:e2e:ngrok         # Full E2E tests with ngrok tunnel
npm run test:e2e:ngrok:ui      # Interactive UI mode with ngrok
npm run test:e2e:ngrok:headed  # Headed browser mode with ngrok
npm run test:e2e:ngrok:debug   # Debug mode with ngrok
npm run test:e2e:ngrok:fast    # Fast mode (Chromium only) with ngrok
npm run test:e2e:validate      # Validate E2E setup prerequisites

# E2E test flows (12 total)
npm run test:e2e -- tests/e2e/flows/admin-auth.test.js                      # Admin authentication
npm run test:e2e -- tests/e2e/flows/admin-dashboard.test.js                 # Admin panel & security
npm run test:e2e -- tests/e2e/flows/basic-navigation.test.js                # Basic navigation
npm run test:e2e -- tests/e2e/flows/cart-functionality.test.js              # Cart operations
npm run test:e2e -- tests/e2e/flows/gallery-basic.test.js                   # Gallery browsing
npm run test:e2e -- tests/e2e/flows/gallery-browsing.test.js                # Gallery performance & functionality
npm run test:e2e -- tests/e2e/flows/mobile-registration-experience.test.js  # Mobile registration flow
npm run test:e2e -- tests/e2e/flows/newsletter-simple.test.js               # Newsletter subscription
npm run test:e2e -- tests/e2e/flows/payment-flow.test.js                    # Payment processing
npm run test:e2e -- tests/e2e/flows/registration-flow.test.js               # Registration process
npm run test:e2e -- tests/e2e/flows/ticket-validation.test.js               # Ticket validation
npm run test:e2e -- tests/e2e/flows/user-engagement.test.js                 # User engagement metrics

# Health checks
npm run test:health         # API health verification
npm run test:smoke          # Quick smoke tests

# All tests (streamlined + E2E)
npm run test:all            # Complete test suite
```

### Database

```bash
# Development Database (SQLite)
npm run migrate:up           # Run pending migrations
npm run migrate:status       # Check migration status
npm run migrate:verify       # Verify integrity

# Database access
npm run db:shell            # SQLite shell
npm run health:database     # Health check
```

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

### Streamlined Testing Strategy
- **Simple test suite** with Vitest - 26 essential unit tests covering critical functionality
- **Fast execution** - complete unit test suite finishes in seconds
- **12 comprehensive E2E tests** - focused Playwright tests covering core user workflows and advanced scenarios
- **SQLite for unit tests** - fast, reliable local testing
- **Turso for E2E tests** - realistic production-like testing environment
- **Zero test abstractions** - every test readable by any JavaScript developer
- **Direct API testing** - no complex mocking or test infrastructure

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

# Testing (optional)
TEST_ADMIN_PASSWORD=     # Plain text password for admin panel E2E testing (not bcrypt hashed)
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

### Performance & Media (Phase 3)
- `POST /api/performance-metrics` - Performance data collection
- `GET /api/image-proxy/[fileId]` - Image optimization and format conversion
- `GET /api/hero-image/[pageId]` - Page-specific hero images

### Health & Monitoring
- `GET /api/health/check` - General application health
- `GET /api/health/database` - Development database health

## Database Migrations

Located in `/migrations/*.sql`, run automatically on deployment.

Features:
- Transactional execution with rollback
- Checksum verification
- Handles comments and multi-line statements
- Tracks status in `migrations` table

## CI/CD Configuration

### GitHub Actions
- **Streamlined testing**: Single test command `npm test` runs 26 essential unit tests
- **Fast execution**: Complete unit test suite finishes in seconds
- **Memory efficient**: No complex test infrastructure or high memory usage
- **Comprehensive E2E validation**: 12 focused Playwright tests for complete coverage
- **Reliable**: Direct API testing with minimal mocking

### Test Architecture
- **Unit Test Suite (26 tests)**:
  - api-contracts.test.js (7 tests) - API contract validation
  - basic-validation.test.js (8 tests) - Input validation and security
  - smoke-tests.test.js (3 tests) - Basic functionality verification  
  - registration-api.test.js (5 tests) - Registration API unit tests
  - registration-flow.test.js (3 tests) - Registration flow tests
- **E2E Test Suite (12 comprehensive tests)**:
  - admin-auth.test.js - Admin authentication flow
  - admin-dashboard.test.js - Admin panel & security testing
  - basic-navigation.test.js - Page navigation and routing
  - cart-functionality.test.js - Shopping cart operations
  - gallery-basic.test.js - Gallery browsing functionality
  - gallery-browsing.test.js - Gallery performance & API integration
  - mobile-registration-experience.test.js - Mobile-optimized registration flow
  - newsletter-simple.test.js - Newsletter subscription
  - payment-flow.test.js - Payment processing workflow
  - registration-flow.test.js - Registration process
  - ticket-validation.test.js - QR code validation
  - user-engagement.test.js - User engagement metrics and tracking
- **Database Strategy**:
  - **Unit tests**: SQLite for fast, isolated testing
  - **E2E tests**: Turso for production-like environment
- **Simple execution**: No complex test builders, managers, or abstractions
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
- **Unit test execution**: Fast completion for 26 unit tests
- **E2E test execution**: 2-5 minutes for 12 comprehensive tests
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
├── pages/              # HTML pages
├── js/                 # Frontend JavaScript
├── css/                # Stylesheets
├── tests/
│   ├── api-contracts.test.js        # API contract validation (7 tests)
│   ├── basic-validation.test.js     # Input validation (8 tests)
│   ├── smoke-tests.test.js          # Smoke tests (3 tests)
│   ├── registration-api.test.js     # Registration API contracts (5 tests)
│   ├── registration-flow.test.js    # Registration flow tests (3 tests)
│   ├── e2e/                         # Comprehensive E2E test structure
│   │   └── flows/                   # 12 focused E2E tests
│   │       ├── admin-auth.test.js                      # Admin authentication
│   │       ├── admin-dashboard.test.js                 # Admin panel & security
│   │       ├── basic-navigation.test.js                # Basic navigation
│   │       ├── cart-functionality.test.js              # Cart operations
│   │       ├── gallery-basic.test.js                   # Gallery browsing
│   │       ├── gallery-browsing.test.js                # Gallery performance & functionality
│   │       ├── mobile-registration-experience.test.js  # Mobile registration flow
│   │       ├── newsletter-simple.test.js               # Newsletter subscription
│   │       ├── payment-flow.test.js                    # Payment processing
│   │       ├── registration-flow.test.js               # Registration process
│   │       ├── ticket-validation.test.js               # Ticket validation
│   │       └── user-engagement.test.js                 # User engagement metrics
│   ├── helpers.js               # Simple test utilities
│   ├── setup.js                 # Minimal test setup
│   └── vitest.config.js         # Vitest configuration
├── migrations/         # Database migrations
├── scripts/            # Build and utility scripts
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
- [API Documentation](/docs/api/README.md)