# A Lo Cubano Boulder Fest 2026

## 🎵 Experience Cuban Culture in the Heart of the Rockies

The official website for **A Lo Cubano Boulder Fest**, Boulder's premier Cuban salsa festival featuring world-class instructors, authentic music, and vibrant dance workshops.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- **Vercel CLI** (for E2E testing): `npm i -g vercel`
- SQLite 3.9.0+ (for database migrations with JSON support)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/damilola/alocubano.boulderfest.git
   cd alocubano.boulderfest
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment setup**

   ```bash
   # Link to Vercel project (one-time setup)
   vercel link

   # Pull environment variables from Vercel Dashboard
   vercel env pull

   # This creates .env.local with all configured variables
   # See INSTALLATION.md for detailed setup instructions
   ```

4. **Start the development server**

   ```bash
   # Development server with full API support
   npm run vercel:dev
   ```

5. **Open in browser**: http://localhost:3000

## 📅 Festival Information

**Dates**: May 15-17, 2026 (Friday-Sunday)
**Location**: Avalon Ballroom, 6185 Arapahoe Rd, Boulder, CO
**Contact**: alocubanoboulderfest@gmail.com
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

## 🎨 Design Philosophy

The website features a **typographic-forward design** that treats text as art:

- Multiple font families (Bebas Neue, Playfair Display, Space Mono)
- Creative text animations and effects
- Experimental typography layouts
- Text-driven visual hierarchy

## 📁 Project Structure

```text
alocubano.boulderfest/
├── index.html (Main home page)
├── vercel.json (Deployment configuration)
├── scripts/
│   ├── start-with-ngrok.js (Development server with ngrok)
│   ├── migrate.js (Database migration system)
│   ├── upload-backup-to-blob.js (Backup upload to Vercel Blob)
│   ├── cleanup-old-backups.js (Cleanup old backups)
│   ├── cleanup-old-branches.js (Cleanup old snapshot branches)
│   └── verify-structure.js (Project structure validation)
├── css/
│   ├── base.css (Design system)
│   ├── components.css (Reusable components)
│   └── typography.css (Typographic design)
├── js/
│   ├── navigation.js (Menu & transitions)
│   ├── main.js (Core functionality)
│   ├── typography.js (Typography effects)
│   └── gallery.js (Google Drive media integration)
├── pages/ (All website pages)
│   ├── about.html
│   ├── artists.html
│   ├── schedule.html
│   ├── gallery.html
│   ├── tickets.html
│   └── donations.html
├── api/
│   └── gallery.js (Serverless function for Google Drive API)
├── tests/ (Comprehensive Testing - 92% Coverage)
│   ├── unit/ (52 files, 1,847+ tests)
│   │   ├── frontend/ (16 component tests)
│   │   ├── lib/ (Service and utility tests)
│   │   └── middleware/ (Security and error handling)
│   ├── integration/ (37 files, 1,128+ tests)
│   │   ├── api/ (API endpoint tests)
│   │   ├── cache/ (Multi-tier cache tests)
│   │   ├── database/ (Backup and recovery)
│   │   └── middleware/ (Security integration)
│   └── e2e/ (15 flows, 254+ tests)
│       └── flows/ (Complete user journeys)
├── docs/
│   ├── DISASTER_RECOVERY.md (Database recovery runbook)
│   └── api/ (API documentation)
├── .github/workflows/
│   ├── database-backup-daily.yml (Daily backup workflow)
│   └── database-snapshot-monthly.yml (Monthly snapshot workflow)
└── images/
    ├── logo.png (Main logo)
    ├── social/ (Social media icons folder)
    ├── instagram-type.svg (Custom IG icon)
    └── favicons/ (Multiple favicon sizes)
```

## ✅ Test Coverage Achievement (2025)

### Comprehensive Testing Initiative

In early 2025, we completed a **systematic test coverage initiative** that brought the codebase from **70% to 92% coverage**:

**Statistics:**
- **104 test files** created across 4 phases
- **3,229+ test cases** covering all major features
- **92% overall coverage** (exceeded 85% target)
- **93% pass rate** across all tests
- **Zero security vulnerabilities** found

**Methodology:**
- **Phase 1**: Critical Path Protection (cron jobs, monitoring, backups)
- **Phase 2**: UI & User Experience (middleware, cache, frontend)
- **Phase 3**: Polish & Completeness (admin, email, utilities, performance)
- **Final Push**: Remaining gaps (frontend components, gallery, monitoring completion)

**Parallel Agent Deployment:**
- Used **22 specialized test-engineer agents** deployed in parallel across phases
- Achieved **10x productivity** vs sequential execution
- Compressed **~44 developer-days** into **8-10 hours** of wall-clock time

**Coverage Highlights:**
- 🎯 **All 7 critical operational risks eliminated** (100%)
- ✅ **Cron jobs**: 0% → 95% coverage
- ✅ **Monitoring**: 0% → 93% coverage
- ✅ **Frontend**: 15% → 95% coverage
- ✅ **Middleware**: 30% → 93% coverage
- ✅ **Cache System**: 20% → 90% coverage

See `.tmp/reports/test-coverage-final-report.md` for comprehensive documentation.

## 🎯 Key Features

### Content

- **Home**: Festival overview with dates and highlights
- **About**: Festival story, board of directors, and growth timeline
- **Artists**: 2026 instructor lineup and workshops
- **Schedule**: 3-day workshop and social schedule
- **Gallery**: Dynamic media gallery with Google Drive integration, festival photos/videos
- **Tickets**: Pricing tiers and registration with floating cart system
- **Donations**: Support the festival with preset/custom amounts, cart integration, and admin tracking

### Technical Features

- ✅ Typographic design system
- ✅ Mobile-responsive layouts with slide-in navigation
- ✅ Touch-optimized interactions and 44px minimum touch targets
- ✅ Mobile-first CSS architecture with desktop protection
- ✅ Hamburger menu with smooth X transformation animation
- ✅ Circular favicon branding
- ✅ Custom Instagram icon
- ✅ Smooth animations and transitions
- ✅ Fast Node.js development server
- ✅ Google Drive API integration for dynamic gallery
- ✅ Lightbox viewer for photos and videos
- ✅ Serverless functions on Vercel
- ✅ Floating cart system with intelligent page-specific visibility
- ✅ Donations system with preset/custom amounts and admin analytics
- ✅ Multiple payment options: Stripe Checkout and PayPal (with Venmo support) for tickets + donations
- ✅ PCI-compliant payment processing with built-in fraud protection

## 🆕 New Ticket Payment Features (2024)

### QR Code System

- ✅ **Secure QR Generation**: JWT-based QR code endpoint (`/api/qr/generate`)
- ✅ **PNG Image Format**: 300x300px optimized for email compatibility
- ✅ **Dual Cache Architecture**: 24-hour HTTP cache (server) + 7-day localStorage cache (client)
- ✅ **Progressive Loading**: Skeleton UI with retry logic and exponential backoff
- ✅ **Email Integration**: Direct QR code embedding in confirmation emails

**Note**: QR codes use dual-layer caching for optimal performance. Server-side HTTP cache (24h) is independent of client-side localStorage/Service Worker cache (7d). See [Performance Optimization](/docs/PERFORMANCE_OPTIMIZATION.md) for details.

### Order Number System

- ✅ **Sequential Order IDs**: Format `ALO-YYYY-NNNN` for production
- ✅ **Test Order Support**: Format `TEST-YYYY-NNNN` starting at 9000
- ✅ **Thread-Safe Generation**: Database-backed atomic sequence increments
- ✅ **Year-Based Sequences**: Independent order numbering per year
- ✅ **Fallback Mechanism**: Timestamp-based IDs when database unavailable

### Mobile Wallet Integration

- ✅ **Apple Wallet Passes**: `.pkpass` files with certificate signing
- ✅ **Google Wallet Support**: Web-based pass URLs with JWT authentication
- ✅ **Dynamic Pass Generation**: Real-time ticket details in wallet passes
- ✅ **Branding Integration**: Festival colors, logos, and visual identity
- ✅ **QR Code Integration**: Seamless scanning for event entry

### Enhanced Ticket Display

- ✅ **My Ticket Page**: Comprehensive ticket viewing with QR codes
- ✅ **Wallet Download Buttons**: One-click wallet pass generation
- ✅ **Dark Mode Support**: Theme-aware ticket display
- ✅ **Print & Share Options**: Multiple ticket sharing methods
- ✅ **Lazy Loading**: Performance-optimized wallet button loading

### Email Service Updates

- ✅ **QR Code Emails**: Direct QR image embedding in transactional emails
- ✅ **Confirmation Summaries**: Enhanced email templates with order details
- ✅ **Registration Reminders**: Automated follow-up email sequences
- ✅ **Wallet Pass Links**: Direct links to add tickets to mobile wallets

### Performance Optimizations

- ✅ **Service Worker**: Background caching for offline QR code access
- ✅ **Intersection Observer**: Lazy loading for wallet components
- ✅ **Performance Dashboard**: Real-time monitoring of QR and wallet metrics
- ✅ **Cache Management**: Intelligent cache expiration and cleanup
- ✅ **Dual Cache Strategy**: Server HTTP cache (24h) + client localStorage/SW cache (7d)
- ✅ **Error Tracking**: Comprehensive error monitoring and recovery

**Cache Architecture**: The system implements two independent cache layers:

- **Server Cache**: 24-hour HTTP browser cache (controlled by API responses)
- **Client Cache**: 7-day localStorage + Service Worker cache (client-side management)

This dual approach provides optimal performance with fast server responses and extended offline capability.

### Enhanced Security

- ✅ **JWT Validation**: Enhanced ticket validation with JWT tokens
- ✅ **Wallet Authentication**: Secure pass generation with JWT signing
- ✅ **Token Expiration**: Configurable TTL for security tokens
- ✅ **Scan Prevention**: `validateOnly` flag to prevent accidental scans

## 👥 Board of Directors

- **President**: Marcela Lay (Founder)
- **Vice President & Treasurer**: Damilola Elegbede
- **Secretary**: Analis Ledesma
- **Board Members**: Donal Solick, Yolanda Meiler

## 🎟️ Ticket Information

- **Full Festival Pass**: $100 (early bird) / $125 (regular)
- **Day Passes**: Friday $50 | Saturday $85 | Sunday $50
- **Single Workshop**: $30
- **Single Social**: $20

## 🛠️ Development

### Streamlined npm Scripts

The project uses essential commands for all development needs:

```bash
# Core Development
npm run vercel:dev             # Development server with ngrok tunnel
npm run build                  # Production build
npm run vercel:preview         # Vercel preview deployment

# Testing (Comprehensive Coverage - 92%)
npm test                       # Unit tests (104 test files, fast execution)
npm run test:integration       # Integration tests (37 files)
npm run test:e2e               # E2E tests with Vercel Preview Deployments (15 flows)
npm run test:coverage          # Coverage reports (92% overall coverage)

# Quality & Build Verification
npm run lint                   # Code quality (ESLint + HTMLHint + Markdown)
npm run verify-structure       # Verify project structure (via build)

# Database Management
npm run migrate:up             # Run database migrations
npm run migrate:status         # Check migration status

# Utilities
npm start                      # Alias for npm run vercel:dev
```

## 🧪 Testing Strategy

### Comprehensive Test Coverage (92%)

We've achieved **92% test coverage** across the entire codebase with **3,229+ tests** in **104 test files**:

**Coverage by Area:**
- ✅ **Cron Jobs**: 95% coverage (7 files, 122+ tests)
- ✅ **Monitoring**: 93% coverage (10 files, 300+ tests)
- ✅ **Google Sheets**: 91% coverage (5 files, 139 tests)
- ✅ **Middleware**: 93% coverage (5 files, 200 tests)
- ✅ **Cache System**: 90% coverage (10 files, 268 tests)
- ✅ **Frontend Components**: 95% coverage (16 files, 477 tests)
- ✅ **Admin Dashboard**: 90% coverage (4 E2E flows, 143 tests)
- ✅ **Email Templates**: 95% coverage (5 files, 301 tests)
- ✅ **Performance**: 88% coverage (7 files, 194 tests)
- ✅ **Utilities**: 88% coverage (8 files, 469 tests)
- ✅ **Wallet Services**: 67% coverage (4 files, 226 tests)

**Test Distribution:**
- **Unit Tests**: 52 files, 1,847+ tests (94% pass rate)
- **Integration Tests**: 37 files, 1,128+ tests (91% pass rate)
- **E2E Tests**: 15 files, 254+ tests (92% pass rate)

### Testing Commands

```bash
# Unit Testing
npm test                       # Run all unit tests (104 files)
npm run test:coverage          # Generate coverage reports (92% coverage)

# Integration Testing
npm run test:integration       # Integration test suite (37 files)

# E2E Testing (Vercel Preview Deployments)
npm run test:e2e               # Full E2E test suite (15 flows)
```

### Database Strategy

- **Unit Tests**: Use SQLite development database
- **Integration Tests**: Service integration with mocked external dependencies
- **E2E Tests**: Use Vercel Preview Deployments with production database environment

### Test Philosophy

Focus on **feature-level coverage** with **production-ready quality**:

- **Feature Coverage**: Every major feature has comprehensive test coverage
- **Real API Testing**: Direct integration with Vercel Preview Deployments
- **Accessibility Testing**: ARIA attributes, keyboard navigation, screen reader support
- **Performance Testing**: Core Web Vitals (LCP, FID, CLS), resource timing
- **Security Testing**: XSS/SQL injection prevention, CSRF protection, rate limiting
- **Error Handling**: Comprehensive edge cases and failure scenarios
- **Pattern Consistency**: All tests follow established project patterns

## 🔄 CI/CD Pipeline

### GitHub Actions Integration

Our CI/CD pipeline provides comprehensive automation with streamlined execution:

#### Workflow Features

- **Unit Testing**: Fast execution with SQLite
- **E2E Testing**: Production validation with Vercel Preview Deployments
- **Quality Gates**: Automated linting and validation
- **Multi-browser Support**: Chrome, Firefox, Safari E2E testing

#### CI/CD Commands

```bash
# Quality Assurance
npm run lint                   # Complete code quality check
npm test                       # Unit test validation
npm run test:integration       # Integration test validation
npm run test:e2e               # E2E test validation

# Deployment Pipeline
npm run build                  # Production build
npm run vercel:preview         # Preview deployment
```

#### Performance Benchmarks

- **Unit Tests**: < 60 seconds for complete suite (104 files, 1,847+ tests)
- **Integration Tests**: < 90 seconds (37 files, 1,128+ tests)
- **E2E Tests**: 2-5 minutes via Vercel Preview Deployments (15 flows, 254+ tests)
- **Quality Gates**: < 30 seconds for linting and validation

## Database Management

### Development Database

```bash
# Migrations
npm run migrate:up             # Run pending migrations
npm run migrate:status         # Check migration status
```

### Database Backups & Disaster Recovery

The project implements a comprehensive three-tier backup strategy to protect against data loss:

#### Backup Strategy Overview

| Tier | Method | Retention | Recovery Time | Use Case |
|------|--------|-----------|---------------|----------|
| **Tier 1** | Turso PITR | 24 hours | < 5 minutes | Same-day mistakes, accidental deletions |
| **Tier 2** | Daily SQL Dumps | 30 days | 30-60 minutes | Recent data loss (1-30 days ago) |
| **Tier 3** | Monthly Snapshots | 12 months | Immediate (read-only) | Historical access, compliance, auditing |

#### Automated Workflows

**Daily Backups** (3 AM UTC / 8 PM Mountain Time):

- Workflow: `.github/workflows/database-backup-daily.yml`
- Storage: Vercel Blob Storage
- Format: Compressed SQL dumps (.sql.gz)
- Retention: 30 days with automatic cleanup

**Monthly Snapshots** (1st of each month, 3 AM UTC):

- Workflow: `.github/workflows/database-snapshot-monthly.yml`
- Storage: Turso Database Branches
- Format: Full database snapshots
- Retention: 12 months with automatic cleanup

#### Manual Backup Triggers

```bash
# Trigger daily backup for both databases
gh workflow run database-backup-daily.yml

# Trigger backup for specific database
gh workflow run database-backup-daily.yml -f database=prod
gh workflow run database-backup-daily.yml -f database=dev

# Trigger monthly snapshot
gh workflow run database-snapshot-monthly.yml

# Dry run (test without creating snapshot)
gh workflow run database-snapshot-monthly.yml -f dry_run=true
```

#### Recovery Scenarios

**Recent Data Loss (< 24 hours)**: Use Turso Point-in-Time Recovery (PITR)

```bash
# Restore to specific timestamp (e.g., 6 hours ago)
RECOVERY_TIME=$(date -u -d '6 hours ago' '+%Y-%m-%dT%H:%M:%S-00:00')
turso db create alocubano-recovered-prod \
  --from-db alocubano-boulderfest-prod \
  --timestamp "$RECOVERY_TIME"
```

**Data Loss (24 hours - 30 days)**: Use daily SQL dump from Vercel Blob

```bash
# Download and import SQL dump
# See DISASTER_RECOVERY.md for detailed steps
```

**Historical Access (1-12 months)**: Query monthly snapshot directly

```bash
# List available snapshots
turso db list | grep -E "alocubano.*-20[0-9]{2}-[0-9]{2}"

# Connect to historical snapshot
turso db shell alocubano-boulderfest-prod-2024-12
```

#### Complete Documentation

For detailed recovery procedures, troubleshooting, and quarterly testing schedule, see:

- **[Disaster Recovery Runbook](/docs/DISASTER_RECOVERY.md)** - Complete step-by-step recovery procedures
- **[Backup Scripts](/scripts/)** - Automation scripts for backup operations
- **[GitHub Workflows](/.github/workflows/)** - Automated backup workflow configurations

#### Required Environment Variables

Configure these in Vercel Dashboard and GitHub Secrets for backup automation:

- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage access (production environment)
- `TURSO_AUTH_TOKEN` - Turso CLI authentication for backup operations

GitHub Repository Variables (Settings → Secrets and variables → Actions → Variables):

- `TURSO_PROD_DB_NAME` - Production database name (e.g., `alocubano-boulderfest-prod`)
- `TURSO_DEV_DB_NAME` - Development database name (e.g., `alocubano-boulderfest-dev`)

## 📱 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome)

### Mobile Navigation Features

- **Slide-in menu**: Right-side navigation panel with backdrop blur
- **Touch optimization**: 44px minimum touch targets for accessibility
- **Gesture support**: Tap outside or ESC key to close menu
- **Smooth animations**: Hardware-accelerated transitions (0.3s ease-out)
- **Body scroll lock**: Prevents background scrolling when menu is open
- **Responsive breakpoint**: Activates at 768px and below

### Floating Cart System

- **Intelligent visibility**: Appears on all pages except 404 and index redirect
- **Purchase pages**: Always visible on tickets and donations pages
- **Content pages**: Visible only when cart contains items (about, artists, schedule, gallery)
- **Persistent state**: Cart contents maintained across page navigation
- **Touch-optimized**: Mobile-friendly design with smooth animations
- **Quick checkout**: Direct access to ticket purchasing flow

## 📚 Documentation

### API Documentation

- [Main API Documentation](/docs/api/README.md) - Complete API reference with new endpoints
- [QR Code Generation](/docs/api/QR_ENDPOINT.md) - QR code API specification
- [Registration API](/docs/api/REGISTRATION_API.md) - Ticket registration system endpoints

### New Features Documentation

- [Donations System](/docs/DONATIONS_SYSTEM.md) - Complete donations architecture and admin dashboard
- [Order Number System](/docs/ORDER_NUMBERS.md) - Order ID format and generation
- [Wallet Pass Setup](/docs/WALLET_SETUP.md) - Mobile wallet configuration guide
- [Performance Optimization](/docs/PERFORMANCE_OPTIMIZATION.md) - Caching and optimization features

### Setup Documentation

- [Installation Guide](INSTALLATION.md) - Complete setup instructions
- [Security Policy](SECURITY.md) - Security practices and vulnerability reporting
- [Changelog](CHANGELOG.md) - Version history and release notes

### Operations Documentation

- [Disaster Recovery Runbook](/docs/DISASTER_RECOVERY.md) - Database backup and recovery procedures

### Key Features Documentation

- **Donations System**: Preset/custom amounts, cart integration, admin tracking, and analytics
- **QR Code System**: JWT-based QR generation with dual cache architecture (24h HTTP + 7d client)
- **Order Number System**: Sequential order tracking with ALO-YYYY-NNNN format
- **Mobile Wallet Passes**: Apple Wallet and Google Wallet integration
- **Performance Optimization**: Advanced caching, lazy loading, and monitoring
- **Registration System**: JWT-based ticket registration with 72-hour window
- **Email Integration**: Brevo/SendinBlue for transactional emails with QR codes and donation acknowledgments
- **Payment Processing**: Stripe Checkout and PayPal (with Venmo) - webhook handling and payment source detection
- **Gallery System**: Google Drive integration with AVIF/WebP optimization
- **E2E Testing**: Comprehensive browser automation with Vercel Preview Deployments
- **Admin Panel**: Complete administration dashboard with donations tracking, registrations, and analytics
- **Database Backups**: Three-tier backup strategy with automated daily/monthly backups and disaster recovery

## Environment Variables

All environment variables are managed through the **Vercel Dashboard**. To configure:

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Settings → Environment Variables**
4. Add required variables (see INSTALLATION.md for complete list)
5. Pull variables locally: `vercel env pull`

### Key Required Variables

- `TURSO_DATABASE_URL` - Production database URL
- `TURSO_AUTH_TOKEN` - Database authentication
- `ADMIN_PASSWORD` - Admin panel access (bcrypt hashed)
- `ADMIN_SECRET` - Session secret (minimum 32 characters, 256-bit random recommended)
- `REGISTRATION_SECRET` - JWT signing for tickets (minimum 32 characters, 256-bit random recommended)
- `WALLET_AUTH_SECRET` - JWT signing for wallet passes (minimum 32 characters, 256-bit random recommended)

**Security Best Practices for JWT Secrets:**

Generate cryptographically secure random secrets with sufficient entropy:

```bash
# Generate 256-bit (32-byte) random secret (recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Or using OpenSSL
openssl rand -base64 32
```

**Minimum Requirements:**

- **Length**: At least 32 characters (256 bits recommended for production)
- **Entropy**: Use cryptographically secure random generation (not simple passwords)
- **Uniqueness**: Use different secrets for `REGISTRATION_SECRET`, `WALLET_AUTH_SECRET`, and `ADMIN_SECRET`
- **Storage**: Never commit secrets to version control; manage via Vercel Dashboard only

**Why 256-bit secrets?**

- Provides sufficient entropy to resist brute-force attacks
- Meets NIST SP 800-131A recommendations for key strength
- Compatible with HS256 JWT signing algorithm
- Industry standard for production JWT applications

### Optional Service Variables

- **Email**: `BREVO_API_KEY`, `BREVO_NEWSLETTER_LIST_ID`
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
- **Gallery**: `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- **Wallet Passes**: `APPLE_PASS_TYPE_ID`, `GOOGLE_WALLET_ISSUER_ID`
- **Backups**: `BLOB_READ_WRITE_TOKEN` (Vercel Blob storage for database backups)

See [INSTALLATION.md](INSTALLATION.md) for complete environment variable documentation.

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

## 🎪 About the Festival

Founded by Marcela Lay in 2023, A Lo Cubano Boulder Fest has grown from a single-day event with 500 attendees to a premier 3-day festival expecting over 5,000 participants in 2026. Nestled in the Rockies of Boulder, Colorado, the festival celebrates authentic Cuban salsa culture through workshops, social dancing, and community connection.

## License

This project is licensed under the **Apache License 2.0**. See the `LICENSE` file for details.

### Third-Party Assets

- The Instagram SVG icon is from [SVGRepo](https://www.svgrepo.com/svg/349410/instagram) and is used under the terms provided by SVGRepo. Please review their terms if you plan to redistribute or modify the icon.
- All other images and assets are property of their respective owners.
