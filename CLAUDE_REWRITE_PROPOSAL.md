# A Lo Cubano Boulder Fest - Project Assistant Configuration

## 🎯 Project Overview

**A Lo Cubano Boulder Fest** is a Cuban salsa festival website celebrating authentic Cuban culture through workshops, social dancing, and community connection in Boulder, Colorado.

### Festival Details
- **Dates**: May 15-17, 2026 (Friday-Sunday)
- **Venue**: Avalon Ballroom, 6185 Arapahoe Rd, Boulder, CO
- **Contact**: alocubanoboulderfest@gmail.com
- **Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)
- **Founded**: 2023 by Marcela Lay
- **Growth**: 500 attendees (2023) → 5,000+ expected (2026)

### Design Philosophy
- **Typography-forward**: Text is treated as art
- **Cultural authenticity**: Celebrates Cuban heritage
- **Community focus**: Emphasizes connection and belonging

## 🏗️ Technical Architecture

### Frontend Stack
- **Core**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Build**: Node.js prebuild scripts, ES modules
- **Deployment**: Vercel static hosting
- **Assets**: Google Drive integration for media

### Backend Services
- **Email**: Brevo (SendinBlue) integration
- **Database**: SQLite for email subscribers
- **APIs**: Serverless functions on Vercel
- **Authentication**: Token-based for unsubscribe

### Key Features
1. **Virtual Gallery**: Performance-optimized photo viewer
2. **Multi-year Support**: Infrastructure for future festivals
3. **Newsletter System**: Double opt-in with GDPR compliance
4. **Responsive Design**: Mobile-first approach

## 🛠️ Development Workflow

### Code Quality Standards
```yaml
Testing:
  - Target: 80% coverage on critical paths
  - Framework: Vitest with jsdom
  - Types: Unit, Integration, E2E (Playwright)
  
Linting:
  - JavaScript: ESLint with custom config
  - HTML: HTMLHint for markup validation
  - Pre-commit: Husky hooks enforce standards

Performance:
  - Core Web Vitals: All green metrics
  - API Response: <100ms for critical operations
  - Image Loading: Progressive with lazy loading
```

### Git Workflow
```bash
# Feature branches
feature/description-of-change

# Commit format
type: brief description

- Detailed bullet points
- Explain why, not just what

Co-Authored-By: Claude <noreply@anthropic.com>
```

### CI/CD Pipeline
1. **Pre-push**: Lint + Fast tests
2. **GitHub Actions**: Full test suite + coverage
3. **Vercel**: Automatic preview deployments
4. **Production**: Merge to main triggers deploy

## 📋 Quick Commands

### Development
```bash
npm start          # Start local server
npm run test       # Run test suite
npm run lint       # Check code quality
npm run build      # Generate static assets
```

### Testing
```bash
npm run test:unit       # Unit tests only
npm run test:coverage   # With coverage report
npm run test:watch      # Watch mode
```

### Deployment
```bash
npm run deploy:check    # Pre-deployment validation
npm run deploy:staging  # Deploy to preview
```

## 🔍 Project-Specific Guidelines

### API Development
- All endpoints require CORS headers
- Rate limiting: 100 requests/minute
- Response format: JSON with consistent structure
- Error handling: Never expose internal details

### Email Integration
- Use environment variables for API keys
- Test mode: Set BREVO_API_KEY=test-key
- Webhook validation: Verify signatures
- GDPR: Include unsubscribe in all emails

### Performance Optimization
- Gallery: Virtual scrolling for 1000+ images
- Caching: 24-hour browser cache for assets
- API: Cache-first strategy with fallback
- Images: AVIF → WebP → JPEG fallback chain

### Security Practices
- Input validation: Sanitize all user data
- XSS prevention: Escape HTML in dynamic content
- CSRF: Token validation for state changes
- Secrets: Never commit API keys

## 🚨 Critical Warnings

### Never Do This
```bash
# ❌ NEVER use --no-verify
git push --no-verify

# ❌ NEVER commit without tests
git commit -m "quick fix"

# ❌ NEVER expose API keys
const API_KEY = "actual-key-here"
```

### Always Do This
```bash
# ✅ Fix test failures before pushing
npm test && git push

# ✅ Use environment variables
const API_KEY = process.env.BREVO_API_KEY

# ✅ Validate and sanitize input
const email = validateEmail(req.body.email)
```

## 📊 Monitoring & Debugging

### Performance Monitoring
- Browser: Performance Observer API
- Server: Response time logging
- Errors: Structured error tracking
- Analytics: Core Web Vitals reporting

### Debug Helpers
```javascript
// Enable gallery debug mode
window.enableGalleryDebug()

// Check cache status
window.galleryDebugAPI.getCacheStats()

// Force cache refresh
window.galleryDebugAPI.clearCache()
```

### Common Issues
1. **Tests failing**: Check memory usage (2 threads max)
2. **Deploy preview skipped**: Create PR for preview
3. **API rate limited**: Check request patterns
4. **Image loading slow**: Verify CDN configuration

## 🤝 Collaboration Notes

### For Claude Code
- Prefer multi-agent orchestration for complex tasks
- Use TodoWrite for task tracking
- Run tests before every push
- Document why, not just what

### For Human Developers
- PR reviews use CodeRabbit (rate limited)
- Documentation in /docs directory
- Questions? Check existing tests first
- Breaking changes need migration plan

## 📚 Resources

### Documentation
- [API Reference](/docs/api.md)
- [Component Guide](/docs/components.md)
- [Deployment Guide](/docs/deployment.md)
- [Testing Strategy](/docs/testing.md)

### External
- [Vercel Docs](https://vercel.com/docs)
- [Brevo API](https://developers.brevo.com)
- [Vitest Guide](https://vitest.dev/guide)

---

*Last Updated: January 2025*
*Maintained by: Development Team*