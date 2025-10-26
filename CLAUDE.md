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

# ✅ REQUIRED
npm test && git commit
```

## File Organization

**ALL temporary files MUST go in `.tmp/` directory** with subdirectories: plans/, reports/, analysis/, scripts/, data/, drafts/, tests/, logs/, exports/

**Root directory rules:**
- Allowed: Config files, docs (README.md, CLAUDE.md, etc.), essential files (package.json, index.html)
- Forbidden: Temporary files, database files, cache files, test output, build artifacts, backups, logs

**If you see temp files in root:** Move to .tmp/, delete if regenerable, update .gitignore

## Common Commands

```bash
# Development
npm start                       # Development server with ngrok
npm run build                   # Production build
npm run vercel:preview          # Preview deployment

# Testing
npm test                        # Unit tests (fast)
npm run test:integration        # Integration tests
npm run test:e2e                # E2E tests (Vercel Preview, 2-5min)
npm run test:coverage           # Coverage reports

# Database
npm run migrate:up              # Run migrations
npm run migrate:status          # Check migration status

# Quality
npm run lint                    # ESLint + HTMLHint + Markdown
npm run verify-structure        # Verify project structure
```

## Architecture Overview

### Frontend
- Vanilla JavaScript ES6 modules - no frameworks
- Typography-forward design (Bebas Neue, Playfair Display, Space Mono)
- Virtual gallery with Google Drive integration and lazy loading
- Floating cart with intelligent page-specific visibility
- Donations system with preset/custom amounts
- Mobile-first: 44px touch targets, WCAG AA contrast, slide-in navigation
- Hybrid theme system: user-controlled (main) + fixed dark (admin)
- Error notifications with retry functionality

### Backend (Vercel Serverless)
- SQLite database with Turso for production
- Async services using Promise-Based Lazy Singleton pattern
- Email via Brevo with webhook processing
- Payments via Stripe Checkout (tickets + donations)
- Wallet passes for Apple/Google with JWT auth
- Admin panel with bcrypt auth and JWT sessions
- Registration system with adaptive reminder scheduling

### Registration Reminder System
Adaptive scheduling based on time until deadline:
- **24+ hours**: 4 reminders (1hr, 12hr, 12hr before, 6hr before)
- **6-24 hours**: 3 reminders (10%, 50%, 20% before)
- **1-6 hours**: 2 reminders (10%, halfway)
- **< 1 hour**: 1 reminder (10%)

Test transactions (e.g., $0.50) automatically excluded.

### Theme System
- **Admin pages**: Always dark theme
- **Main site**: User-controlled (System/Light/Dark)
- **Key files**: js/theme-manager.js, js/theme-toggle.js, css/base.css
- Use semantic CSS variables (`--color-text-primary`)
- Include theme-manager.js early to prevent FOUC

### Testing Strategy
- **Unit tests**: Fast, essential coverage with SQLite
- **Integration tests**: Service and API validation
- **E2E tests**: 12 flows using Vercel Preview Deployments
  - Smart preview detection: reuses existing or creates new (~4 min)
  - Powered by scripts/vercel-deployment-manager.js
  - No local server - always production-like environment

## Key API Patterns

### Database Service Pattern
```javascript
class AsyncService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized && this.instance) return this.instance;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._performInitialization();
    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }
}
```

### API Handler Pattern
```javascript
import { getDatabaseClient } from "../lib/database.js";

export default async function handler(req, res) {
  const client = await getDatabaseClient();
  const result = await client.execute("SELECT * FROM table");
  res.json(result.rows);
}
```

## Environment Variables

### Single Source of Truth: Vercel Dashboard

Configure in Vercel Dashboard → Settings → Environment Variables:

```bash
# Email
BREVO_API_KEY=
BREVO_NEWSLETTER_LIST_ID=
BREVO_WEBHOOK_SECRET=
BREVO_PURCHASER_CONFIRMATION_TEMPLATE_ID=
BREVO_ATTENDEE_CONFIRMATION_TEMPLATE_ID=
BREVO_BATCH_REGISTRATION_TEMPLATE_ID=

# Payments
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Database
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# Admin & Auth
ADMIN_PASSWORD=                # bcrypt hash
ADMIN_SECRET=                  # JWT secret (min 32 chars)
REGISTRATION_SECRET=           # JWT secret (min 32 chars)
WALLET_AUTH_SECRET=            # JWT secret for wallet auth

# Wallet Passes
APPLE_PASS_KEY=                # base64 encoded certificate

# Google Drive (optional)
GOOGLE_DRIVE_API_KEY=
GOOGLE_DRIVE_FOLDER_ID=

# Security
INTERNAL_API_KEY=              # For cache management
CRON_SECRET=                   # Vercel cron authentication

# Testing (optional)
TEST_ADMIN_PASSWORD=           # Plain text for E2E tests
E2E_TEST_MODE=                 # Set to 'true' for Preview env (REQUIRED)
```

### E2E_TEST_MODE (CRITICAL)
**MUST be set in Vercel Dashboard for Preview environments** to enable:
- MFA bypass for admin auth tests
- Rate limiting bypass
- Simple login mode

**Setup:**
1. Vercel Dashboard → Project Settings → Environment Variables
2. Add: Name: `E2E_TEST_MODE`, Value: `true`, Environment: **Preview ONLY**
3. Redeploy preview

Without this, E2E tests will fail with MFA prompts and rate limiting errors.

### CRON_SECRET
Vercel auto-generates when you add cron config to vercel.json. Used to authenticate scheduled tasks via `Authorization: Bearer <CRON_SECRET>` header.

## API Endpoints

**Email**: subscribe, unsubscribe, brevo-webhook
**Payments**: create-checkout-session, stripe-webhook, checkout-success
**Tickets**: [ticketId], validate, register, apple-wallet/[ticketId], google-wallet/[ticketId]
**Registration**: [token], batch, health
**Admin**: login, dashboard, registrations, donations
**Gallery**: gallery, gallery/years, featured-photos
**Cache**: cache (GET/POST/DELETE)
**Performance**: performance-metrics, performance/monitoring-dashboard, image-proxy/[fileId], hero-image/[pageId]
**Health**: health/check, health/database

## Database

### Migrations
Located in `/migrations/*.sql`, run automatically on deployment. Features: transactional execution, checksum verification, multi-line statement handling.

### Foreign Key Pattern - Dual-Key Design
```sql
-- transactions table
id              INTEGER PRIMARY KEY AUTOINCREMENT  -- Surrogate key for FKs
transaction_id  TEXT UNIQUE NOT NULL              -- Business identifier

-- Child tables reference transactions.id (INTEGER)
tickets.transaction_id         INTEGER REFERENCES transactions(id)
transaction_items.transaction_id  INTEGER REFERENCES transactions(id)
```

**Performance:** 2-3x faster JOINs, 10x smaller storage, better indexing

**Correct usage:**
```sql
SELECT t.*, tx.transaction_id
FROM tickets t
JOIN transactions tx ON t.transaction_id = tx.id;
```

See migrations: 004_transactions.sql, 005_tickets.sql, 008_transaction_items.sql, 044_critical_constraints.sql

## Mobile UI

**Cart System:**
- Right-to-left slide animation
- 44px touch targets
- Conditional initialization (cart-relevant pages only)
- Visibility: Always on /tickets, /donations; with items on /about, /artists, /schedule, /gallery

**Navigation:**
- 280px mobile menu with Cuban-themed gradient
- 48px touch targets
- Blue-to-red gradient accents

**Forms:**
- 44px minimum height for buttons/inputs
- 16px font size (prevents iOS zoom)
- Better tap feedback

**Accessibility:**
- WCAG AA contrast ratios
- 3px focus indicators
- 24px checkboxes/radios on mobile

**Error Handling:**
```javascript
import errorNotifier from './lib/error-notifier.js';

errorNotifier.showNetworkError('Connection lost', () => { /* retry */ });
errorNotifier.showValidationError('Invalid input');
errorNotifier.showSuccess('Item added to cart');
```

**Visual Feedback:**
- Loading spinners, skeleton screens
- Cuban flag gradient accents (blue-to-red)
- Dark mode support, reduced motion support

## Performance Targets
- Gallery: Virtual scrolling 1000+ images
- Images: Progressive loading (AVIF → WebP → JPEG)
- API response: <100ms
- Browser cache: 24 hours
- E2E tests: 2-5 minutes (parallel execution)
- Build time: 90-120 seconds (see docs/BUILD_OPTIMIZATION.md)

## Build Performance
Multi-layered caching in `node_modules/.cache/alocubano-build/`:
- Small files (<10KB): Full content hash
- Large files (>10KB): Size-based hash
- Saves 8-10s on cache hits

```bash
node scripts/vercel-cache.js stats     # View cache stats
node scripts/vercel-cache.js clear     # Clear cache
node scripts/vercel-cache.js validate  # Validate cache
```

See docs/BUILD_OPTIMIZATION.md for details.

## Debugging

```javascript
// Gallery
window.enableGalleryDebug();
window.galleryDebugAPI.getCacheStats();

// Cart
console.log("Cart:", JSON.parse(localStorage.getItem("cart") || "[]"));

// Theme
import { getCurrentTheme } from '/js/theme-manager.js';
console.log("Theme:", getCurrentTheme());

// Errors
window.errorNotifier.show('Test', { type: 'network', duration: 0 });
```

## Project Structure

```
/
├── api/                # Serverless functions (admin/, email/, payments/, tickets/, registration/, health/)
├── lib/                # Shared services (async singletons)
├── pages/              # HTML pages
├── js/                 # Frontend JavaScript (theme-manager.js, theme-toggle.js, global-cart.js, floating-cart.js)
│   └── lib/            # cart-manager.js, error-notifier.js
├── css/                # Stylesheets (base.css, floating-cart.css, navigation.css, forms.css, mobile-enhancements.css)
├── docs/               # Documentation
├── tests/              # unit/, integration/, e2e/flows/, config/
├── migrations/         # Database migrations
├── scripts/            # Build and utility scripts
└── config/             # ESLint, HTMLHint configs
```

## Timezone Handling - Mountain Time

**CRITICAL**: All user-facing times MUST be in Mountain Time (America/Denver).

**Architecture:**
- Database: UTC (SQLite CURRENT_TIMESTAMP)
- Backend: lib/time-utils.js
- Frontend: js/time-manager.js
- APIs: Return UTC + `_mt` suffixed Mountain Time fields

**Backend:**
```javascript
import timeUtils from '../lib/time-utils.js';

const enhanced = timeUtils.enhanceApiResponse(tickets,
  ['created_at', 'event_date'],
  { includeDeadline: false }
);
// Result: created_at_mt: "Jan 15, 2026, 3:30 AM MST"
```

**Frontend:**
```javascript
// ✅ CORRECT
const time = timeManager.formatDateTime(ticket.created_at);

// ❌ INCORRECT - uses browser timezone
const time = new Date(ticket.created_at).toLocaleString();
```

**Available utilities:** toMountainTime(), formatDate(), formatDateTime(), formatEventTime(), enhanceApiResponse()

## Resources

**Email**: alocubanoboulderfest@gmail.com
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

**Docs**: INSTALLATION.md, SECURITY.md, CHANGELOG.md, docs/THEME_SYSTEM.md, docs/DONATIONS_SYSTEM.md, docs/BOOTSTRAP_SYSTEM.md, docs/api/README.md

---

Do what has been asked; nothing more, nothing less.
NEVER create files unless absolutely necessary.
ALWAYS prefer editing existing files to creating new ones.
NEVER proactively create documentation files unless explicitly requested.
