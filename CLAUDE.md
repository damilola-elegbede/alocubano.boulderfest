# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## A Lo Cubano Boulder Fest - Development Guide

Cuban salsa festival website for Boulder, Colorado with workshops, social dancing, and community celebration.

**Festival Dates**: May 15-17, 2026  
**Location**: Avalon Ballroom, Boulder, CO

## Critical Development Rules

**NEVER use --no-verify** - Test failures are always real problems that need investigation.

```bash
# ❌ FORBIDDEN - Fix test failures first
git commit --no-verify  # NEVER
git push --no-verify    # NEVER

# ✅ REQUIRED - Fix all failures
npm test && git commit
npm test && git push
```

## Common Commands

### Development
```bash
# Start development server with ngrok (default)
npm start
# Starts at https://alocubanoboulderfest.ngrok.io

# Local development without ngrok
npm run start:local
# Starts at http://localhost:3000

# Simple HTTP server (no API functions)
npm run serve:simple
```

### Testing
```bash
# Run unit tests (configured with 2 concurrent threads to prevent memory issues)
npm test
npm run test:unit

# Run specific test file
npm run test:unit -- tests/unit/brevo-service.test.js

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:unit:watch

# Integration tests
npm run test:integration

# Database tests
npm run test:database

# Performance tests  
npm run test:performance

# Pre-push validation (full suite)
npm run test:pre-push
```

### Database Management
```bash
# Run migrations
npm run migrate:up

# Check migration status
npm run migrate:status

# Verify migrations
npm run migrate:verify

# Database shell
npm run db:shell

# Health checks
npm run health:database
```

### Deployment
```bash
# Pre-deployment validation
npm run deploy:check

# Deploy to staging (with quality gates)
npm run deploy:staging

# Production deployment (automatic on main branch)
git push origin main
```

### Monitoring & Health
```bash
# Health checks
npm run health:check      # Overall health
npm run health:database   # Database health
npm run health:stripe     # Stripe integration
npm run health:brevo      # Email service

# Monitoring
npm run monitoring:metrics
npm run monitoring:uptime
npm run monitoring:dashboard
```

## Architecture Overview

### Frontend Architecture
- **Vanilla JavaScript** with ES6 modules
- **Typography-forward design** using multiple font families
- **Virtual gallery** with lazy loading and Google Drive integration
- **Floating cart system** with intelligent page-specific visibility
- **Service worker** for offline support and caching
- **Mobile-first responsive** with slide-in navigation

### Backend Architecture  
- **Vercel serverless functions** for API endpoints
- **SQLite database** with automated migration system
- **Brevo (SendinBlue)** for email marketing integration
- **Stripe Checkout** for payment processing
- **Apple/Google Wallet** pass generation
- **JWT-based authentication** for admin and wallet passes

### Testing Architecture
- **Vitest** with jsdom for browser-based testing
- **2 concurrent threads max** to prevent memory exhaustion
- **Pre-commit hooks** with Husky
- **CI/CD via GitHub Actions** on main/develop branches
- **80% coverage target** on critical paths

## Key API Endpoints

### Email System
- `POST /api/email/subscribe` - Newsletter subscription
- `GET/POST /api/email/unsubscribe` - Unsubscribe with token
- `POST /api/email/brevo-webhook` - Webhook processing

### Payment System
- `POST /api/payments/create-checkout-session` - Stripe checkout
- `POST /api/payments/stripe-webhook` - Payment webhooks
- `GET /api/payments/checkout-success` - Success handler

### Ticket System
- `GET /api/tickets/[ticketId]` - Ticket details
- `POST /api/tickets/validate` - QR code validation
- `GET /api/tickets/apple-wallet/[ticketId]` - Apple pass
- `GET /api/tickets/google-wallet/[ticketId]` - Google pass

### Admin System
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/dashboard` - Dashboard data
- `GET /api/admin/registrations` - Registration data

## Environment Variables

Required variables in `.env.local`:

```bash
# Email Service
BREVO_API_KEY=
BREVO_NEWSLETTER_LIST_ID=
BREVO_WEBHOOK_SECRET=

# Payment Processing
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Database (Production)
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# Admin
ADMIN_PASSWORD=  # bcrypt hash
ADMIN_SECRET=     # min 32 chars

# Wallet Passes
APPLE_PASS_KEY=   # base64 private key
WALLET_AUTH_SECRET=  # JWT signing
```

## Database Migrations

Migrations are in `/migrations/*.sql` and run automatically on deployment.

Migration system features:
- Transactional execution with automatic rollback
- Checksum verification for integrity
- SQL statement parsing handles comments and strings
- Status tracking in migrations table

## Cart System Visibility Rules

The floating cart has intelligent page-specific behavior:

- **Always visible**: `/tickets`, `/donations`
- **Visible with items**: `/about`, `/artists`, `/schedule`, `/gallery`
- **Never visible**: `/404`, `/index.html`

Managed by `determineCartVisibility()` in `floating-cart.js`.

## Performance Guidelines

- **Gallery**: Virtual scrolling for 1000+ images
- **Images**: Progressive loading (AVIF → WebP → JPEG)
- **API**: <100ms response target
- **Caching**: 24-hour browser cache for static assets
- **Memory**: Tests limited to 2 concurrent threads

## Security Practices

- **Input validation** on all user inputs
- **HTML escaping** for XSS prevention
- **Environment variables** for secrets (never hardcode)
- **JWT authentication** with HMAC-SHA256
- **Rate limiting** on API endpoints
- **CORS configuration** for API security

## Debugging

```javascript
// Browser console commands

// Gallery debugging
window.enableGalleryDebug();
window.galleryDebugAPI.getCacheStats();
window.galleryDebugAPI.clearCache();

// Cart debugging  
console.log("Cart visibility:", determineCartVisibility(true));
console.log("Cart contents:", JSON.parse(localStorage.getItem("cart") || "[]"));

// Force cart visibility
document.querySelector(".floating-cart").style.display = "block";
```

## CI/CD Pipeline

GitHub Actions workflow triggers:
- **Push to main/develop**: Full test suite
- **Pull requests**: Linting + tests + build verification
- **Deployment**: Automatic to Vercel on main branch

Pipeline includes:
- ESLint + HTMLHint validation
- Unit tests with Vitest
- Link validation
- Security scanning
- Multi-node version testing (18, 20)

## Project Structure

```
/
├── api/               # Serverless functions
│   ├── lib/          # Shared services
│   ├── admin/        # Admin endpoints
│   ├── payments/     # Payment processing
│   └── tickets/      # Ticket management
├── css/              # Stylesheets
├── js/               # Frontend JavaScript
├── pages/            # HTML pages (multi-event support)
├── tests/            # Test suites
│   ├── unit/         # Unit tests
│   └── integration/  # Integration tests
├── migrations/       # Database migrations
├── scripts/          # Build and utility scripts
└── config/           # Configuration files
```

## Apple Wallet Security (Phase 3 Completed)

Recent security fixes applied:
- Separated `APPLE_PASS_KEY` from `APPLE_PASS_PASSWORD`
- Implemented proper JWT authentication with `WALLET_AUTH_SECRET`
- Full UUID serial numbers for uniqueness
- Comprehensive certificate validation

## Contact & Resources

**Email**: alocubanoboulderfest@gmail.com  
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

**Documentation**:
- [Vercel Deployment](https://vercel.com/docs)
- [Brevo API](https://developers.brevo.com)
- [Vitest](https://vitest.dev)