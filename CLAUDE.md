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
- **Floating cart** with intelligent page-specific visibility rules and right-to-left slide animation
- **Donations system** with preset/custom amounts and cart integration
- **Mobile-first** with slide-in navigation, 44px touch targets, and WCAG AA contrast ratios
- **Hybrid theme system** with user-controlled themes on main site and fixed dark theme on admin pages
- **Error notifications** with user-friendly messages, retry functionality, and network error handling
- **Performance optimized** with conditional cart initialization and skeleton loading states

### Backend (Vercel Serverless)

- **SQLite database** with Turso for production
- **Async services** using Promise-Based Lazy Singleton pattern
- **Email** via Brevo (SendinBlue) with webhook processing and donation acknowledgments
- **Payments** via Stripe Checkout with webhook handling (tickets + donations)
- **Donations tracking** with database recording and admin analytics
- **Wallet passes** for Apple/Google with JWT authentication
- **Admin panel** with bcrypt auth, JWT sessions, and donations dashboard
- **Registration system** with adaptive reminder scheduling based on deadline length

### Registration Reminder System

**Adaptive Reminder Scheduling** - Automatically scales reminder frequency based on time until deadline:

- **Standard (24+ hours)**: 4 reminders - Initial (1hr), Mid (12hr), Urgent (12hr before), Final (6hr before)
- **Late purchase (6-24 hours)**: 3 reminders - Initial (10% into window), Midpoint (50%), Final (20% before)
- **Very late (1-6 hours)**: 2 reminders - Initial (10% into window), Urgent (halfway before)
- **Emergency (< 1 hour)**: 1 reminder - Initial (10% into window)

This ensures users always receive appropriate reminder frequency regardless of when they purchase tickets. Test transactions (small amounts like $0.50) are automatically excluded from reminder scheduling.

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

## Vercel Configuration

### Static Asset Routing (vercel.json)

**Identity Rewrite for Manifest Icons:**

The manifest file references static images like `/images/icon-144x144.png`, but Vercel's default SPA routing redirects `/images/` paths to `index.html`, causing browsers to receive HTML instead of the actual PNG files. This produces "Failed to fetch" console errors when browsers try to load manifest icons.

```json
{
  "source": "/images/:path*",
  "destination": "/images/:path*"
}
```

This identity rewrite forces Vercel to serve actual static files from the `/images/` directory instead of applying SPA routing rules. Required for any static assets that must bypass Vercel's default HTML fallback behavior.

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

- **Running the app**: `vercel dev` automatically pulls environment variables from Vercel Dashboard
- **Running tests/scripts locally**: `vercel link` creates `.env.vercel` file with all Dashboard variables
- **Production**: Vercel deployment uses Dashboard configuration directly
- **CI/CD**: GitHub Actions uses GitHub Secrets (synced from Vercel Dashboard)

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
CRON_SECRET=                                  # Bearer token for Vercel Cron job authentication (prevents unauthorized cron triggers)

# Testing (optional)
TEST_ADMIN_PASSWORD=                          # Plain text password for admin panel E2E testing (not bcrypt hashed)
E2E_TEST_MODE=                                # Enable E2E test mode (REQUIRED for Preview environment, set to 'true')

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

- **Initial Setup**:
  1. Configure variables in Vercel Dashboard (Settings → Environment Variables)
  2. Run `vercel link` to link your local project
  3. This creates `.env.vercel` with all Dashboard variables

- **Running the app**: `vercel dev` (no .env file needed - pulls directly from Dashboard)
- **Running tests/scripts**: Uses `.env.vercel` file (created by `vercel link`)
- **Updating variables**:
  - Change in Vercel Dashboard
  - Run `vercel env pull .env.vercel` to refresh local file
- **CI/CD**: GitHub Actions uses GitHub Secrets (no .env files)
- **Security**: `.env.vercel` is gitignored, sensitive values never committed

### E2E_TEST_MODE Configuration (CRITICAL for E2E Testing)

**Purpose**: Enables test-specific behavior for E2E tests running against Vercel preview deployments.

**CRITICAL REQUIREMENT**: This environment variable MUST be set in Vercel Dashboard for Preview environments to enable:
1. MFA bypass for admin authentication tests
2. Rate limiting bypass for test requests
3. Simple login mode for E2E test scenarios

**Configuration Steps**:

1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add new environment variable:
   - Name: `E2E_TEST_MODE`
   - Value: `true`
   - Environment: **Preview ONLY** (DO NOT set for Production)
3. Redeploy preview deployment to apply changes

**Security Notes**:
- MUST be set ONLY for Preview environments, NEVER for Production
- Required for admin authentication tests to pass
- Without this variable, E2E tests will fail with MFA prompts and rate limiting errors

**Why This is Required**:
- GitHub Actions sets `E2E_TEST_MODE=true` for the test runner environment
- However, Vercel preview deployments check their own environment variables
- When E2E tests make HTTP requests to preview APIs, those APIs need `E2E_TEST_MODE=true` in the Vercel deployment
- This enables test-specific code paths in `api/admin/login.js` and other endpoints

**Affected Tests**: All admin authentication E2E tests (admin-auth.test.js, admin-dashboard.test.js, etc.)

**Verification**: After setting, run `npm run test:e2e -- tests/e2e/flows/admin-auth.test.js` to confirm admin tests pass.

### CRON_SECRET Configuration

**Purpose**: Authenticates Vercel Cron jobs to prevent unauthorized execution of scheduled tasks.

**How Vercel Cron Authentication Works**:

1. **Automatic Generation**: When you configure a cron job in `vercel.json`, Vercel automatically generates a `CRON_SECRET` and adds it to your environment variables
2. **Authorization Header**: Vercel Cron jobs automatically send `Authorization: Bearer <CRON_SECRET>` header
3. **Validation**: Your cron handler validates the header matches the environment variable

**Configuration Steps**:

1. **Option A - Automatic (Recommended)**:
   - Add cron configuration to `vercel.json`
   - Deploy to Vercel
   - Vercel automatically generates and sets `CRON_SECRET`

2. **Option B - Manual**:
   - Generate a secure random token (min 32 chars)
   - Add to Vercel Dashboard: Settings → Environment Variables
   - Set for Production environment only

**Usage in Cron Handlers**:

```javascript
export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${process.env.CRON_SECRET || ''}`;

  if (authHeader !== expectedAuth && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Process cron job...
}
```

**Current Cron Jobs**:

- `api/cron/cleanup-expired-reservations.js` - Uses CRON_SECRET authentication
- `api/cron/process-reminders.js` - **Missing CRON_SECRET authentication** (security issue)

**Security Notes**:

- Only enforced in production (`NODE_ENV === 'production'`)
- Skipped in development to allow local testing
- Prevents external actors from triggering cron jobs via direct HTTP requests

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
- `GET /api/admin/dashboard` - Dashboard data including donation metrics
- `GET /api/admin/registrations` - Registration list
- `GET /api/admin/donations` - Donations dashboard with filtering and analytics

### Gallery

- `GET /api/gallery` - Google Drive photos/videos
- `GET /api/gallery/years` - Available years
- `GET /api/featured-photos` - Featured photos

### Cache Management

- `GET /api/cache` - Get cache statistics and metrics (supports `?type=google-drive`)
- `POST /api/cache` - Perform cache operations (warm/clear)
- `DELETE /api/cache` - Clear cache (shorthand for POST with action=clear)

### Google Drive Integration

- `GET /api/google-drive-health` - Google Drive service health and configuration status

### Performance & Media (Phase 3)

- `POST /api/performance-metrics` - Unified performance data collection endpoint
  - Supports multiple metric types via `?type=` query parameter:
    - `standard`: Core Web Vitals and standard metrics (default)
    - `analytics`: General analytics data
    - `critical`: Critical performance alerts
    - `final`: Final page unload metrics
- `GET /api/performance/monitoring-dashboard` - Unified performance monitoring and reporting
  - Supports multiple report types via `?type=` query parameter:
    - `summary`: Quick performance summary (default)
    - `detailed`: Comprehensive performance report
    - `health`: Service health status
    - `alerts`: Recent performance alerts
    - `recommendations`: Optimization recommendations
    - `slow-queries`: Slow query analysis
    - `categories`: Query category breakdown
    - `export`: Exportable metrics data (JSON or CSV via `?format=csv`)
    - `optimize`: Trigger manual optimization
    - `status`: System status
    - `dashboard`: Complete dashboard data
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

## Mobile UI Enhancements

### Cart System

**Floating Cart** (css/floating-cart.css, js/floating-cart.js):

- Right-to-left slide animation (more intuitive for shopping carts)
- 44px minimum touch targets for all interactive elements
- Smooth momentum scrolling on mobile with `-webkit-overflow-scrolling: touch`
- Conditional initialization: Full cart functionality only loads on cart-relevant pages

**Cart Visibility** - Managed by `determineCartVisibility()` in `floating-cart.js`:

- **Always visible**: `/tickets`, `/donations`
- **Visible with items**: `/about`, `/artists`, `/schedule`, `/gallery`
- **Never visible**: `/404`, `/index.html`

**Performance Optimization** (js/global-cart.js:14-42):

- **Cart-relevant pages**: Full CartManager with all features
- **Other pages**: Minimal badge-only mode (reads localStorage directly, no async overhead)
- Cross-tab synchronization via storage events
- Reduces initialization overhead by ~80% on non-cart pages

### Navigation

**Mobile Menu** (css/navigation.css:432-543):

- 280px width with 0.98 opacity and backdrop blur
- Cuban-themed gradient hover effects (blue-to-red gradient)
- Visual separation between menu items
- 4px Cuban flag accent on active items
- 48px minimum touch targets

### Form Elements

**Touch-Friendly Inputs** (css/forms.css:128-151, css/mobile-enhancements.css:124-170):

- 44px minimum height for all buttons and inputs
- 48px minimum for form inputs on mobile
- 16px font size prevents iOS zoom on focus
- Better tap feedback with `-webkit-tap-highlight-color`
- User-select disabled to prevent double-tap text selection

### Accessibility

**WCAG AA Compliance** (css/base.css:65-80):

- Secondary text: #4a4a4a (7.0:1 contrast ratio)
- Muted text: #707070 (4.6:1 contrast ratio)
- Placeholder text: #666666 (5.74:1 contrast ratio)
- 3px focus indicators with 2px offset
- 24px minimum size for checkboxes/radio buttons on mobile

### Error Handling

**Error Notifier System** (js/lib/error-notifier.js):

- User-friendly toast notifications with retry functionality
- Network error detection and retry callbacks
- Maximum 3 concurrent toasts to prevent spam
- Slide-in animation from right with proper ARIA labels
- Types: network, validation, system, success

**Usage Pattern**:

```javascript
import errorNotifier from './lib/error-notifier.js';

// Network error with retry
errorNotifier.showNetworkError('Connection lost', () => {
    // Retry logic
});

// Validation error (auto-dismiss after 5s)
errorNotifier.showValidationError('Invalid input');

// Success message (auto-dismiss after 3s)
errorNotifier.showSuccess('Item added to cart');
```

**Integration Points**:

- js/gallery-detail.js:1166-1199 - Gallery photo loading errors
- js/lib/cart-manager.js:76-83 - Storage quota exceeded errors

### Visual Feedback

**Loading States** (css/mobile-enhancements.css:282-336):

- Button loading spinner with color: transparent trick
- Form submission state with opacity reduction
- Hardware-accelerated animations

**Skeleton Screens** (css/mobile-enhancements.css:339-428):

- Pulsing gradient animation for loading states
- Gallery, card, text, heading, image, button variants
- Dark mode support with adjusted opacity
- Reduced motion support for accessibility

### Cuban-Inspired Design

**Visual Elements** (css/mobile-enhancements.css:431-479):

- Cuban flag gradient accents (blue-to-red)
- 4px vertical accent bars on cards
- Section dividers with gradient fading
- Navigation hover effects with gradient backgrounds

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

// Error notifier debugging
window.errorNotifier.show('Test notification', { type: 'network', duration: 0 });
window.errorNotifier.showNetworkError('Testing network error', () => console.log('Retry clicked'));
window.errorNotifier.dismissAll(); // Clear all notifications
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
│   ├── theme-manager.js       # Core theme management system
│   ├── theme-toggle.js        # Three-state toggle component
│   ├── global-cart.js         # Conditional cart initialization
│   ├── floating-cart.js       # Cart UI with slide animation
│   └── lib/
│       ├── cart-manager.js    # Cart state management
│       └── error-notifier.js  # User-friendly error notifications
├── css/                # Stylesheets
│   ├── base.css                  # CSS variable system with theme support
│   ├── floating-cart.css         # Cart UI styles with mobile optimization
│   ├── navigation.css            # Mobile navigation with Cuban accents
│   ├── forms.css                 # Form elements with 44px touch targets
│   └── mobile-enhancements.css   # Comprehensive mobile UI enhancements
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
- [Donations System](docs/DONATIONS_SYSTEM.md)
- [Bootstrap System](docs/BOOTSTRAP_SYSTEM.md)
- [API Documentation](/docs/api/README.md)

## Timezone Handling - Mountain Time (America/Denver)

**CRITICAL**: All user-facing times MUST be displayed in Mountain Time, not UTC or browser timezone.

### Architecture

- **Database**: Stores all timestamps in UTC (via SQLite's CURRENT_TIMESTAMP) ✅
- **Backend**: Uses `lib/time-utils.js` for Mountain Time formatting
- **Frontend**: Uses `js/time-manager.js` (mirrors backend functionality)
- **APIs**: Return both UTC timestamps AND `_mt` suffixed Mountain Time formatted fields

### Backend API Pattern

```javascript
import timeUtils from '../lib/time-utils.js';

export default async function handler(req, res) {
  const tickets = await getTicketsFromDatabase();

  // ✅ REQUIRED: Enhance with Mountain Time fields
  const enhanced = timeUtils.enhanceApiResponse(tickets,
    ['created_at', 'updated_at', 'event_date', 'registered_at', 'registration_deadline'],
    { includeDeadline: false }
  );

  res.json({ tickets: enhanced });
}
```

**Result**: Each timestamp field gets a corresponding `_mt` field:

```json
{
  "created_at": "2026-01-15T10:30:00Z",
  "created_at_mt": "Jan 15, 2026, 3:30 AM MST",
  "timezone": "America/Denver"
}
```

### Frontend Display Pattern

```javascript
// ✅ CORRECT: Use timeManager with fallback
const displayTime = timeManager
  ? timeManager.formatDateTime(ticket.created_at)
  : 'Loading...';

// ❌ INCORRECT: Browser timezone (varies by user location)
const displayTime = new Date(ticket.created_at).toLocaleString();
```

### Email Templates

```javascript
// In lib/ticket-email-service-brevo.js
import timeUtils from './time-utils.js';

formatEventDate(date) {
  return timeUtils.formatEventTime(date, {
    includeTime: false,
    includeTimezone: false,
    longFormat: true
  });
}
```

### Available Time Utilities

**Backend** (`lib/time-utils.js`):

- `toMountainTime(date)` - Full datetime with timezone
- `formatDate(date)` - Date only (e.g., "Jan 15, 2026")
- `formatDateTime(date)` - Date + time (e.g., "Jan 15, 2026, 3:30 PM MST")
- `formatEventTime(date, options)` - Flexible formatting
- `enhanceApiResponse(data, fields, options)` - Auto-add `_mt` fields

**Frontend** (`js/time-manager.js`):

- Same methods as backend for consistency
- Automatically handles DST transitions
- Falls back gracefully if module not loaded

### Testing Checklist

- [ ] All API responses include `_mt` fields for timestamps
- [ ] Frontend displays show "(MT)" or "(Mountain Time)" indicator
- [ ] Admin panels use `timeManager.formatDateTime()`
- [ ] Email templates format dates via `timeUtils`
- [ ] Countdown timers use `js/countdown.js` with proper timezone

### Common Mistakes to Avoid

❌ `new Date().toLocaleDateString()` - Uses browser timezone
❌ `new Date().toLocaleString()` - Uses browser timezone
✅ `timeManager.formatDate(date)` - Uses Mountain Time
✅ `timeUtils.formatDateTime(date)` - Uses Mountain Time

## Important Instruction Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
