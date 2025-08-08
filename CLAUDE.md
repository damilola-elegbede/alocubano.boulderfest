# A Lo Cubano Boulder Fest - Development Guide

## Project Overview

A Cuban salsa festival website featuring workshops, social dancing, and community celebration in Boulder, Colorado.

**Festival Dates**: May 15-17, 2026  
**Location**: Avalon Ballroom, Boulder, CO  
**Website**: Typography-forward design celebrating Cuban culture

## Development Standards

### Critical Rules

**NEVER use --no-verify**

```bash
# ❌ FORBIDDEN - Test failures are ALWAYS real
git commit --no-verify  # NEVER DO THIS
git push --no-verify    # NEVER DO THIS

# ✅ REQUIRED - Fix all test failures first
npm test && git commit
npm test && git push
```

When tests fail, it means something is broken. Always investigate and fix the root cause.

### Code Quality

- **Tests**: Maintain 80%+ coverage on critical paths
- **Memory**: Vitest limited to 2 concurrent threads (prevents 40GB+ usage)
- **Performance**: <100ms API responses, Core Web Vitals green
- **Security**: Escape HTML, validate inputs, use environment variables

### Git Workflow

```bash
# Branch naming
feature/brevo-email-integration
fix/memory-leak-in-tests

# Commit messages (with Co-Authored-By)
fix: resolve memory leaks in test suite

- Reduce concurrency from 8 to 2 threads
- Add cleanup in afterEach hooks
- Tests now use <10GB memory total

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Technical Stack

### Frontend

- Vanilla JavaScript (ES6 modules)
- CSS3 with mobile-first responsive design
- Virtual gallery with lazy loading
- Service worker for offline support
- Floating cart system with intelligent visibility

### Backend

- Vercel serverless functions
- Brevo (SendinBlue) email integration
- SQLite database for subscribers
- Token-based authentication

### Testing

- Vitest with jsdom environment
- Unit, integration, and E2E tests
- Pre-commit hooks with Husky
- CI/CD via GitHub Actions

## Environment Setup

### Required Environment Variables

```bash
BREVO_API_KEY=your-api-key
BREVO_NEWSLETTER_LIST_ID=1
BREVO_WELCOME_TEMPLATE_ID=1
BREVO_VERIFICATION_TEMPLATE_ID=1
UNSUBSCRIBE_SECRET=your-secret
BREVO_WEBHOOK_SECRET=webhook-secret
```

### Local Development

```bash
# Install dependencies
npm install

# Start development server (with ngrok by default)
npm start
# or
npm run dev

# Start without ngrok (local only)
npm run start:local

# Run tests
npm test

# Run specific test file
npm run test:unit -- tests/unit/brevo-service.test.js
```

### Default Development Environment (ngrok)

The project uses ngrok as the default development environment:

1. **First time setup**:
   - Install ngrok: `brew install ngrok`
   - Configure auth token: `ngrok config add-authtoken YOUR_TOKEN`
   - Copy `.env.local.example` to `.env.local` and add credentials

2. **Start development**:
   ```bash
   npm start
   ```

3. **Access your site** at: `https://alocubanoboulderfest.ngrok.io`
4. **ngrok dashboard** at: `http://localhost:4040`
5. **Fallback**: If ngrok isn't installed, automatically starts local server

Benefits of ngrok as default:
- Test Apple Sign In and other OAuth flows
- Share development URL with team members
- Test webhooks from external services
- Mobile device testing on same network
- Consistent HTTPS environment

## Server Logging

When starting the server using `npm start`, pipe the output to a log file in `./.tmp/` directory:

```bash
# First run
npm start > ./.tmp/server.log 2>&1

# Subsequent runs (if file exists)
npm start > ./.tmp/server_1.log 2>&1
npm start > ./.tmp/server_2.log 2>&1
```

## Common Tasks

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# With coverage
npm run test:coverage

# Watch mode
npm run test:unit:watch
```

### Debugging Test Issues

```bash
# If tests hang or use too much memory
NODE_OPTIONS="--max-old-space-size=4096" npm test

# Check memory usage
npm run test:unit -- --reporter=verbose

# Run single test file
npm run test:unit -- --run path/to/test.js
```

### Deployment

```bash
# Check before deploy
npm run deploy:check

# Deploy to staging
vercel --target preview

# Production (automatic on merge to main)
git push origin main
```

## API Development

### Email Subscribe Endpoint

```javascript
// POST /api/email/subscribe
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "marketingConsent": true,
  "dataProcessingConsent": true
}
```

### Email Unsubscribe

```javascript
// GET/POST /api/email/unsubscribe
// Requires: email and token parameters
// Returns: HTML confirmation page
```

### Webhook Processing

```javascript
// POST /api/email/brevo-webhook
// Validates signature if BREVO_WEBHOOK_SECRET is set
// Processes: delivered, opened, clicked, bounced, etc.
```

## Cart System Architecture

### Floating Cart Implementation

The floating cart system provides a persistent shopping experience across all pages with intelligent visibility rules.

#### Core Components

- **floating-cart.js**: Main cart management and UI logic
- **cart-manager.js**: State management and data persistence
- **CSS components**: Responsive styling and animations

#### Visibility Logic (determineCartVisibility function)

```javascript
function determineCartVisibility(hasItems) {
  const currentPath = window.location.pathname;

  // Page behavior configuration
  const pageConfig = {
    // Always visible on purchase pages
    alwaysShow: ["/tickets", "/donations"],
    // Never visible on error/redirect pages
    neverShow: ["/404", "/index.html"],
    // Other pages: show only when cart has items
    showWhenHasItems: true,
  };
}
```

#### Page-Specific Behavior

- **Purchase Pages** (`/tickets`, `/donations`): Always visible to encourage purchases
- **Content Pages** (`/about`, `/artists`, `/schedule`, `/gallery`): Visible only when cart contains items
- **System Pages** (`/404`, `/index.html`): Never visible to avoid UI conflicts

#### State Management

- **LocalStorage persistence**: Cart contents survive page refreshes and navigation
- **Real-time updates**: Cart UI updates immediately when items are added/removed
- **Cross-page synchronization**: Cart state maintained across all pages

#### Performance Considerations

- **Lazy initialization**: Cart elements created only when needed
- **Event delegation**: Efficient event handling for dynamic content
- **CSS animations**: Hardware-accelerated transitions for smooth UX
- **Memory management**: Proper cleanup of event listeners and timers

## Performance Guidelines

### Gallery Optimization

- Virtual scrolling for 1000+ images
- Progressive image loading (AVIF → WebP → JPEG)
- 24-hour browser cache for static assets
- Lazy loading with Intersection Observer

### Cart System Performance

- **State persistence**: localStorage with JSON serialization
- **UI updates**: Debounced rendering for smooth interactions
- **Memory efficiency**: Event listener cleanup and DOM management
- **Animation performance**: CSS transforms and opacity changes only

### API Performance

- Cache-first strategy with fallback
- Rate limiting: 100 requests/minute
- Response compression enabled
- Error responses don't leak internal details

## Security Best Practices

### Input Validation

```javascript
// Always escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Note: For production use, consider using a well-maintained sanitization library
// like DOMPurify (https://github.com/cure53/DOMPurify) or the xss npm package
// (https://www.npmjs.com/package/xss). These libraries provide more robust and
// secure HTML sanitization than handcrafted helpers, handling edge cases and
// staying updated with emerging security threats.

// Validate emails
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return res.status(400).json({ error: "Invalid email" });
}
```

### Environment Variables

```javascript
// ✅ CORRECT
const apiKey = process.env.BREVO_API_KEY;

// ❌ NEVER hardcode secrets
const apiKey = "actual-key-here"; // FORBIDDEN
```

## Troubleshooting

### Common Issues

**Tests Failing with Memory Errors**

- Vitest is configured for max 2 concurrent threads
- Check for memory leaks in test cleanup
- Run `npm run test:unit -- --run` for single-threaded

**CI/CD Pipeline Not Triggering**

- Ensure branch matches pattern in `.github/workflows/ci.yml`
- Feature branches need `feature/**` pattern
- Check GitHub Actions logs for details

**Deploy Preview Not Created**

- Deploy previews only trigger on pull requests
- Direct pushes to feature branches skip preview
- Create PR to see preview deployment

**API Rate Limiting**

- Check request patterns in logs
- Implement exponential backoff
- Cache responses when possible

## Quick Debug Commands

```javascript
// In browser console

// Enable gallery debug mode
window.enableGalleryDebug();

// Check cache statistics
window.galleryDebugAPI.getCacheStats();

// Clear all caches
window.galleryDebugAPI.clearCache();

// View current gallery state
window.galleryDebugAPI.getState();

// Cart system debugging
// Check cart visibility logic
console.log("Cart should be visible:", determineCartVisibility(true));
console.log("Current page path:", window.location.pathname);

// View cart state
console.log("Cart contents:", JSON.parse(localStorage.getItem("cart") || "[]"));

// Force cart visibility (for testing)
document.querySelector(".floating-cart").style.display = "block";

// Check cart manager instance
if (window.cartManager) {
  console.log("Cart items:", window.cartManager.getItems());
  console.log("Cart total:", window.cartManager.getTotal());
}
```

## Project Structure

```
/
├── api/               # Serverless functions
├── css/              # Stylesheets
├── js/               # Frontend JavaScript
│   ├── floating-cart.js    # Cart UI and visibility logic
│   ├── cart-manager.js     # Cart state management
│   ├── navigation.js       # Menu & transitions
│   ├── main.js            # Core functionality
│   ├── typography.js      # Typography effects
│   └── gallery.js         # Google Drive media integration
├── pages/            # HTML pages
│   ├── tickets.html       # Cart always visible
│   ├── donations.html     # Cart always visible
│   ├── about.html         # Cart visible when has items
│   ├── artists.html       # Cart visible when has items
│   ├── schedule.html      # Cart visible when has items
│   └── gallery.html       # Cart visible when has items
├── tests/            # Test suites
│   ├── unit/        # Unit tests
│   └── integration/ # Integration tests
├── scripts/          # Build scripts
├── config/           # Configuration files
└── migrations/       # Database migrations
```

## Apple Wallet Security Updates

### Critical Security Fixes Applied (Phase 3)

**Certificate Handling Fix**:
- **Issue**: `signerKey` incorrectly contained password instead of private key certificate
- **Fix**: Separated `APPLE_PASS_KEY` (private key) from `APPLE_PASS_PASSWORD` (passphrase)
- **Impact**: Proper certificate validation and PKPass generation

**PKPass Constructor Fix**:
- **Issue**: Incorrect parameter mapping - `signerKey` used for `signerKeyPassphrase`
- **Fix**: Correct parameter mapping with dedicated `signerKeyPassphrase` property
- **Impact**: Proper certificate signing during pass generation

**JWT Authentication Implementation**:
- **Issue**: Weak base64 authentication token vulnerable to tampering
- **Fix**: Proper JWT implementation using `jsonwebtoken` library with HMAC-SHA256
- **Impact**: Cryptographically secure authentication for wallet pass updates

**Serial Number Security**:
- **Issue**: Collision-prone serial numbers using timestamp + partial UUID
- **Fix**: Full UUID implementation for cryptographically secure uniqueness
- **Impact**: Eliminates potential serial number collisions

**Configuration Validation**:
- **Issue**: Incomplete certificate validation in `isConfigured()` check
- **Fix**: Comprehensive validation including passphrase and auth secret verification
- **Impact**: Prevents runtime failures due to incomplete configuration

### Environment Variables Added

```bash
# New secure wallet configuration
APPLE_PASS_KEY=base64-encoded-private-key  # Separated from password
WALLET_AUTH_SECRET=secure-random-string    # For JWT signing
```

All environment template files updated with secure configuration examples.

## Contact & Resources

**Project**: A Lo Cubano Boulder Fest  
**Email**: alocubanoboulderfest@gmail.com  
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

**Documentation**:

- [Vercel Deployment](https://vercel.com/docs)
- [Brevo API Docs](https://developers.brevo.com)
- [Vitest Testing](https://vitest.dev)

---

Remember: **NEVER use --no-verify**. Test failures are real problems that need real solutions.
