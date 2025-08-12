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
# Run unit tests (default)
npm test

# Run specific test file
npm run test:unit -- tests/unit/brevo-service.test.js

# Test categories
npm run test:integration     # Integration tests
npm run test:performance     # Performance tests  
npm run test:security        # Security tests
npm run test:e2e             # End-to-end tests

# Coverage
npm run test:coverage        # Unit test coverage
npm run test:unit:coverage   # With coverage report

# CI-specific commands (with exclusions and optimizations)
npm run test:unit:ci
npm run test:integration:ci
npm run test:performance:ci
```

### Database

```bash
# Migrations
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

### Testing
- **Vitest** with jsdom for unit tests (2 threads max to prevent memory issues)
- **Playwright** for E2E tests
- **Test isolation** with TestEnvironmentManager for reliable async testing
- **CI/CD** via GitHub Actions with 2 test shards (reduced from 4)

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
- `GET /api/tickets/apple-wallet/[ticketId]` - Apple Wallet pass
- `GET /api/tickets/google-wallet/[ticketId]` - Google Wallet pass

### Admin
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/dashboard` - Dashboard data
- `GET /api/admin/registrations` - Registration list

### Gallery
- `GET /api/gallery` - Google Drive photos/videos
- `GET /api/gallery/years` - Available years
- `GET /api/featured-photos` - Featured photos

## Database Migrations

Located in `/migrations/*.sql`, run automatically on deployment.

Features:
- Transactional execution with rollback
- Checksum verification
- Handles comments and multi-line statements
- Tracks status in `migrations` table

## CI/CD Configuration

### GitHub Actions
- **Test shards**: 2 (reduced from 4 to prevent memory exhaustion)
- **Memory limit**: NODE_OPTIONS='--max-old-space-size=1024'
- **SQLite**: Uses in-memory database in CI to prevent lock conflicts
- **Test exclusions**: Some unit tests excluded in CI via TEST_CI_EXCLUDE_PATTERNS

### Test Failures
- Integration/performance tests may fail in CI due to resource constraints
- Database tests use retry logic for SQLITE_BUSY errors
- External API tests are mocked in CI environment

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
- **Test concurrency**: 2 threads max (memory constraint)

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
│   └── gallery/        # Gallery endpoints
├── pages/              # HTML pages
├── js/                 # Frontend JavaScript
├── css/                # Stylesheets
├── tests/
│   ├── unit/           # Unit tests (Vitest)
│   ├── integration/    # Integration tests
│   ├── performance/    # Performance tests
│   ├── security/       # Security tests
│   ├── e2e/            # E2E tests (Playwright)
│   └── utils/          # Test helpers
├── migrations/         # Database migrations
├── scripts/            # Build and utility scripts
└── config/             # ESLint, HTMLHint configs
```

## Contact & Resources

**Email**: alocubanoboulderfest@gmail.com  
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

**Documentation**:
- [Async Initialization Guide](/docs/ASYNC_INITIALIZATION_GUIDE.md)
- [Testing Strategy](/docs/testing/TESTING_STRATEGY.md)
- [API Documentation](/docs/api/API_DOCUMENTATION.md)