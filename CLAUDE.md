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
# Development server
npm run vercel:dev              # Development server with ngrok tunnel
npm start                       # Alias for npm run vercel:dev

# Build and deployment
npm run build                   # Production build (Vercel)
npm run vercel:preview          # Vercel preview deployment
```

### Testing

```bash
# Streamlined Test Suite
npm test                        # Unit tests (fast execution)
npm run test:integration        # Integration tests
npm run test:e2e                # E2E tests (optimized: 2-5 minutes, parallel execution)
npm run test:coverage           # Generate coverage reports

# Individual E2E test flows - Run specific tests:
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
```

### Database

```bash
# Database migrations
npm run migrate:up              # Run pending migrations
npm run migrate:status          # Check migration status
```

### Quality & Build Verification

```bash
# Code quality
npm run lint                    # ESLint + HTMLHint + Markdown linting

# Build verification
npm run verify-structure        # Verify project structure (via build)
```

## Architecture Overview

### Frontend

- **Vanilla JavaScript** ES6 modules - no framework dependencies
- **Typography-forward design** with Bebas Neue, Playfair Display, Space Mono
- **Virtual gallery** with Google Drive integration and lazy loading
- **Floating cart** with intelligent page-specific visibility rules
- **Mobile-first** with slide-in navigation and 44px touch targets
- **Hybrid theme system** with user-controlled themes on main site and fixed dark theme on admin pages

### Backend (Vercel Serverless)

- **SQLite database** with Turso for production
- **Async services** using Promise-Based Lazy Singleton pattern
- **Email** via Brevo (SendinBlue) with webhook processing
- **Payments** via Stripe Checkout with webhook handling
- **Wallet passes** for Apple/Google with JWT authentication
- **Admin panel** with bcrypt auth and JWT sessions

### Theme System

**Hybrid Architecture:**
- **Admin pages**: Always dark theme (non-configurable)
- **Main site**: User-controlled themes (System/Light/Dark)
- **Performance optimized**: Cached DOM queries, debounced operations
- **FOUC prevention**: Synchronous theme application on page load

**Key Components:**
- `js/theme-manager.js`: Core theme management and detection
- `js/theme-toggle.js`: Three-state toggle component with accessibility
- `css/base.css`: CSS variable system with dark mode overrides

**Usage Guidelines:**
- Use semantic CSS variables (`--color-text-primary`) over direct colors
- Test components in both light and dark themes
- Include theme-manager.js early to prevent FOUC
- Theme toggle only appears on main site pages (hidden on admin)

### Streamlined Testing Strategy

**Revolutionary Script Simplification**:

- **Simplified commands**: Focus on core development workflows
- **Essential commands only**: Clear purpose for each script
- **Modern E2E approach**: E2E tests use **Vercel Preview Deployments**
- **Benefits**:
  - Simplified developer experience
  - Faster onboarding
  - Reduced maintenance burden
  - Clear command purposes

**Testing Architecture**:

- **Unit tests**: Fast, essential coverage with SQLite (`npm test`)
- **Integration tests**: Service and API validation (`npm run test:integration`)
- **E2E tests**: 12 comprehensive flows with Vercel Preview Deployments (`npm run test:e2e`)
- **Simple execution**: Direct API testing with minimal mocking
- **Zero abstractions**: Every test readable by any JavaScript developer

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
import { getDatabaseClient } from "../lib/database.js";

export default async function handler(req, res) {
  const client = await getDatabaseClient(); // Always await initialization
  const result = await client.execute("SELECT * FROM table");
  res.json(result.rows);
}
```

### Theme Integration Pattern

```javascript
// Include theme manager early in page lifecycle
import '/js/theme-manager.js';

// Initialize theme toggle for main site pages
import { initializeThemeToggle } from '/js/theme-toggle.js';
const toggle = initializeThemeToggle('#theme-toggle-container');

// Use CSS variables for theme-aware styling
// .component { color: var(--color-text-primary); }
```

## Environment Variables

### Single Source of Truth: Vercel Dashboard

All environment variables are configured in the Vercel Dashboard and automatically pulled during development and deployment. This eliminates the need for local `.env` files and ensures consistency across all environments.

### Configuration Approach

- **Development**: `vercel dev` automatically pulls environment variables from Vercel Dashboard
- **Production**: Vercel deployment uses Dashboard configuration
- **No local .env files**: All configuration lives in Vercel Dashboard

### Required Environment Variables

Configure these in your Vercel Dashboard (Settings → Environment Variables):

```bash
# Email
BREVO_API_KEY=                                # Brevo API key for email services
BREVO_NEWSLETTER_LIST_ID=                     # Newsletter list identifier
BREVO_WEBHOOK_SECRET=                         # Webhook security token

# Registration Email Templates
BREVO_PURCHASER_CONFIRMATION_TEMPLATE_ID=     # Individual purchaser confirmation
BREVO_ATTENDEE_CONFIRMATION_TEMPLATE_ID=      # Individual attendee confirmation
BREVO_BATCH_REGISTRATION_TEMPLATE_ID=         # Comprehensive batch registration summary (optional)

# Payments
STRIPE_PUBLISHABLE_KEY=                       # Stripe publishable key
STRIPE_SECRET_KEY=                            # Stripe secret key
STRIPE_WEBHOOK_SECRET=                        # Stripe webhook signing secret

# Database
TURSO_DATABASE_URL=                           # Production database URL (required for E2E tests)
TURSO_AUTH_TOKEN=                             # Production database auth token (required for E2E tests)

# Admin
ADMIN_PASSWORD=                               # bcrypt hash for admin authentication
ADMIN_SECRET=                                 # JWT signing secret (min 32 chars)

# Registration System
REGISTRATION_SECRET=                          # JWT signing for ticket registration tokens (min 32 chars)

# Wallet Passes
APPLE_PASS_KEY=                               # base64 encoded Apple Pass certificate
WALLET_AUTH_SECRET=                           # JWT signing secret for wallet authentication

# Google Drive Integration (optional)
GOOGLE_DRIVE_API_KEY=                         # Google Cloud API key with Drive API enabled
GOOGLE_DRIVE_FOLDER_ID=                       # Google Drive folder ID containing gallery images

# Internal APIs Security
INTERNAL_API_KEY=                             # API key for secure internal operations (cache management)

# Testing (optional)
TEST_ADMIN_PASSWORD=                          # Plain text password for admin panel E2E testing (not bcrypt hashed)

# Timeout Configuration (optional - for CI/CD flexibility)
E2E_STARTUP_TIMEOUT=                          # Server startup timeout in ms (default: 60000)
E2E_TEST_TIMEOUT=                             # Individual test timeout in ms (default: varies by scenario)
E2E_ACTION_TIMEOUT=                           # Action timeout (clicks, inputs) in ms (default: varies by scenario)
E2E_NAVIGATION_TIMEOUT=                       # Page navigation timeout in ms (default: varies by scenario)
E2E_WEBSERVER_TIMEOUT=                        # Webserver startup timeout in ms (default: varies by scenario)
E2E_EXPECT_TIMEOUT=                           # Expect assertion timeout in ms (default: varies by scenario)
E2E_HEALTH_CHECK_INTERVAL=                    # Health check interval in ms (default: 2000)
VITEST_TEST_TIMEOUT=                          # Vitest test timeout in ms (default: varies by environment)
VITEST_HOOK_TIMEOUT=                          # Vitest hook timeout in ms (default: varies by environment)
VITEST_SETUP_TIMEOUT=                         # Vitest setup timeout in ms (default: 10000)
VITEST_CLEANUP_TIMEOUT=                       # Vitest cleanup timeout in ms (default: 5000)
VITEST_REQUEST_TIMEOUT=                       # HTTP request timeout in ms (default: 30000)
```

### Environment Variable Management

- **Setup**: Configure variables once in Vercel Dashboard
- **Development**: Run `vercel dev` to automatically pull configuration
- **CI/CD**: GitHub Actions inherits variables from Vercel project
- **Security**: Sensitive values never stored in repository

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

### Google Drive Integration

- `GET /api/google-drive-health` - Google Drive service health and configuration status
- `GET /api/google-drive-cache` - Google Drive cache status and metrics
- `POST /api/google-drive-cache` - Warm up Google Drive cache with fresh data
- `DELETE /api/google-drive-cache` - Clear Google Drive cache

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

- **Streamlined testing**: Single `npm test` command for essential unit test coverage
- **Fast execution**: Complete unit test suite finishes in seconds
- **Memory efficient**: No complex test infrastructure or high memory usage
- **Comprehensive E2E validation**: 12 focused Playwright tests with **Vercel Preview Deployments**
- **Reliable**: Direct API testing with minimal mocking

### Test Architecture

- **Unit Test Suite**: Essential tests covering critical functionality
  - api-contracts.test.js - API contract validation
  - basic-validation.test.js - Input validation and security
  - smoke-tests.test.js - Basic functionality verification
  - registration-api.test.js - Registration API unit tests
  - registration-flow.test.js - Registration flow tests
- **Integration Test Suite**: Service and API integration validation
- **E2E Test Suite (21 comprehensive tests)** with **Vercel Preview Deployments**:
  - accessibility-compliance.test.js - WCAG compliance and accessibility
  - admin-auth.test.js - Admin authentication flow
  - admin-dashboard.test.js - Admin panel & security testing
  - basic-navigation.test.js - Page navigation and routing
  - brevo-cleanup-integration.test.js - Email service integration
  - cart-functionality.test.js - Shopping cart operations
  - dark-mode-admin.test.js - Dark mode functionality in admin
  - database-integrity.test.js - Database operations and integrity
  - email-transactional.test.js - Transactional email flows
  - gallery-basic.test.js - Gallery browsing functionality
  - gallery-browsing.test.js - Gallery performance & API integration
  - mobile-registration-experience.test.js - Mobile-optimized registration flow
  - network-resilience.test.js - Network failure handling
  - payment-flow.test.js - Payment processing workflow
  - performance-load.test.js - Performance under load
  - registration-flow.test.js - Registration process
  - stripe-webhook-security.test.js - Webhook security validation
  - ticket-validation.test.js - QR code validation
  - user-engagement.test.js - User engagement metrics and tracking
  - wallet-pass-apple.test.js - Apple Wallet pass generation
  - wallet-pass-google.test.js - Google Wallet pass generation
- **Database Strategy**:
  - **Unit/Integration tests**: SQLite for fast, isolated testing
  - **E2E tests**: Production database via **Vercel Preview Deployments**
- **Simple execution**: No complex test builders, managers, or abstractions
- **Real API testing**: Tests interact with actual endpoints via Vercel preview deployments

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
- **Unit test execution**: Fast completion with essential coverage
- **E2E test execution**: 2-5 minutes with parallel execution (4-8x faster than legacy)
- **E2E parallel workers**: 2 (CI) / 4 (local) for optimal resource usage
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

// Theme debugging
import { getPerformanceMetrics, getCurrentTheme } from '/js/theme-manager.js';
console.log("Current theme:", getCurrentTheme());
console.log("Theme performance:", getPerformanceMetrics());
```

## Project Structure

```text
/
├── api/                 # Serverless functions
│   ├── admin/          # Admin endpoints
│   ├── email/          # Email endpoints
│   ├── payments/       # Payment processing
│   ├── tickets/        # Ticket management
│   ├── registration/   # Registration endpoints
│   └── health/         # Health check endpoints
├── lib/                # Shared services (async singletons)
├── pages/              # HTML pages
├── js/                 # Frontend JavaScript
│   ├── theme-manager.js    # Core theme management system
│   └── theme-toggle.js     # Theme toggle component
├── css/                # Stylesheets
│   └── base.css           # CSS variable system with theme support
├── docs/               # Documentation
│   ├── THEME_SYSTEM.md    # Complete theme system documentation
│   └── api/               # API documentation
├── tests/
│   ├── unit/           # Unit test files
│   ├── integration/    # Integration test structure
│   ├── e2e/            # Comprehensive E2E test structure
│   │   └── flows/      # 12 focused E2E tests (use Vercel Preview Deployments)
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
│   ├── config/         # Test configuration files
│   └── vitest.config.js # Vitest configuration
├── migrations/         # Database migrations
├── scripts/            # Build and utility scripts
└── config/             # ESLint, HTMLHint configs
```

## Streamlined Script System

### Current Essential Scripts

The project uses a streamlined set of commands for all development needs:

```bash
# Core Development
npm run vercel:dev              # Development server with ngrok tunnel
npm start                       # Alias for npm run vercel:dev
npm run build                   # Production build (Vercel)
npm run vercel:preview          # Vercel preview deployment

# Testing Suite
npm test                        # Unit tests (fast execution)
npm run test:integration        # Integration tests
npm run test:e2e                # E2E tests with Vercel Preview Deployments
npm run test:coverage           # Coverage reports

# Quality & Build Verification
npm run lint                    # Complete code quality (ESLint + HTMLHint + Markdown)
npm run verify-structure        # Verify project structure (via build)

# Database Management
npm run migrate:up              # Run database migrations
npm run migrate:status          # Check migration status
```

**Benefits:**

- **Clear purpose**: Each script has a single, well-defined responsibility
- **Simplified workflow**: Focus on Vercel Preview Deployments for E2E testing
- **Predictable naming**: Standard command naming conventions
- **Essential only**: Only the commands needed for development

## Contact & Resources

**Email**: alocubanoboulderfest@gmail.com
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

**Documentation**:

- [Installation Guide](INSTALLATION.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Theme System Guide](docs/THEME_SYSTEM.md)
- [API Documentation](/docs/api/README.md)

## Important Instruction Reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.