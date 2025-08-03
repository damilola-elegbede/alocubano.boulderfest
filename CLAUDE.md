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

# Start development server
npm start

# Run tests
npm test

# Run specific test file
npm run test:unit -- tests/unit/brevo-service.test.js
```

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

## Performance Guidelines

### Gallery Optimization
- Virtual scrolling for 1000+ images
- Progressive image loading (AVIF → WebP → JPEG)
- 24-hour browser cache for static assets
- Lazy loading with Intersection Observer

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

// Validate emails
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
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
```

## Project Structure

```
/
├── api/               # Serverless functions
├── css/              # Stylesheets
├── js/               # Frontend JavaScript
├── pages/            # HTML pages
├── tests/            # Test suites
│   ├── unit/        # Unit tests
│   └── integration/ # Integration tests
├── scripts/          # Build scripts
├── config/           # Configuration files
└── migrations/       # Database migrations
```

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