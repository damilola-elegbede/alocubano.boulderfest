# Documentation Hub

Complete documentation for A Lo Cubano Boulder Fest website and festival management system.

## Quick Links

- [Installation Guide](../INSTALLATION.md) - Get started with development
- [API Documentation](api/README.md) - Complete API reference
- [CLAUDE.md](../CLAUDE.md) - AI agent guidance for this project

## 📚 Documentation Categories

### Getting Started

Essential documentation for new developers:

- **[Installation Guide](../INSTALLATION.md)** - Complete setup instructions with environment configuration
- **[Security Policy](../SECURITY.md)** - Security practices and vulnerability reporting
- **[Changelog](../CHANGELOG.md)** - Version history and release notes

### Core Systems

Documentation for main system components:

#### Donations System (NEW)
- **[Donations System](DONATIONS_SYSTEM.md)** ⭐ - Complete donations architecture, cart integration, and admin dashboard

#### Payment & Ticketing
- **[Order Numbers](ORDER_NUMBERS.md)** - Sequential order tracking (ALO-YYYY-NNNN format)
- **[Wallet Setup](WALLET_SETUP.md)** - Apple Wallet and Google Wallet pass configuration
- **[QR Validation](QR_VALIDATION_ENHANCEMENTS.md)** - Enhanced QR code validation with JWT
- **[Registration Confirmation Flow](REGISTRATION_CONFIRMATION_FLOW.md)** - Ticket registration system

#### Email & Communications
- **Email System** - Brevo integration (see [API Docs](api/README.md#email-services))
- **Registration Reminders** - Automated follow-up system

#### Data & Content
- **[Google Drive Integration](GOOGLE_DRIVE_INTEGRATION.md)** - Dynamic gallery with API setup
- **[Bootstrap System](BOOTSTRAP_SYSTEM.md)** - Production data initialization
- **[Bootstrap Configuration Examples](BOOTSTRAP_CONFIGURATION_EXAMPLES.md)** - Configuration templates
- **[Events Service](EVENTS_SERVICE.md)** - Event data management singleton

#### Design & User Experience
- **[Theme System](THEME_SYSTEM.md)** - Hybrid theme architecture (user-controlled + fixed dark admin)
- **[Admin Design System](ADMIN_DESIGN_SYSTEM.md)** - Admin panel design guidelines

### API Documentation

Complete API reference and specifications:

- **[API Overview](api/README.md)** - Complete API documentation with all endpoints
- **[QR Code Endpoint](api/QR_ENDPOINT.md)** - QR code generation API specification
- **[Registration API](api/REGISTRATION_API.md)** - Ticket registration endpoints
- **[Cache Management API](api/CACHE_MANAGEMENT_API.md)** - Cache operations and statistics
- **[Google Drive Setup](api/GOOGLE_DRIVE_SETUP.md)** - Google Drive API configuration

### Architecture & Technical Design

System architecture and design documentation:

#### Database
- **[Database Migrations](DATABASE_MIGRATIONS.md)** - Migration system and procedures
- **[Database Optimization](DATABASE_OPTIMIZATION_SUMMARY.md)** - Performance improvements for Turso
- **[Connection Manager](CONNECTION_MANAGER.md)** - Enterprise-grade connection pooling

#### System Architecture
- **[Bootstrap Ticket Architecture](architecture/BOOTSTRAP_TICKET_ARCHITECTURE.md)** - Ticket system design
- **[Multi-Event Architecture](architecture/MULTI_EVENT_ARCHITECTURE.md)** - Multi-event support design
- **[Multi-Event Implementation Plan](architecture/MULTI_EVENT_IMPLEMENTATION_PLAN.md)** - Implementation roadmap
- **[Test Isolation Architecture](architecture/TEST_ISOLATION_ARCHITECTURE.md)** - Test database isolation
- **[Test Boundaries Architecture](architecture/test-boundaries-architecture.md)** - Testing separation strategy

#### Performance & Optimization
- **[Performance Optimization](PERFORMANCE_OPTIMIZATION.md)** - Caching strategies and optimization
- **[Caching Strategy](CACHING_STRATEGY.md)** - Detailed caching architecture
- **[QR Wallet Performance Guide](QR_WALLET_PERFORMANCE_GUIDE.md)** - QR and wallet optimization
- **[E2E Optimizations](E2E_OPTIMIZATIONS.md)** - 4-8x performance improvement (10-20min → 2-5min)

#### Mobile & Platform-Specific
- **[Mobile PayPal Optimization](MOBILE_PAYPAL_OPTIMIZATION.md)** - Mobile PayPal integration
- **[PayPal SDK Integration](PAYPAL_SDK_INTEGRATION.md)** - PayPal SDK implementation

### Security

Security policies, best practices, and implementation:

- **[Security Policy](../SECURITY.md)** - Security practices and vulnerability reporting
- **[Security Secrets](SECURITY_SECRETS.md)** - Secret management guidelines
- **[Security Audit](SECURITY_AUDIT.md)** - Security audit procedures
- **[Secret Validation](SECRET_VALIDATION.md)** - Environment variable validation
- **Audit Service** - Comprehensive logging (see [Audit Service Integration](audit-service-integration.md))
- **[HTTP Status Codes](HTTP_STATUS_CODES.md)** - Semantic status code usage

### Testing & Quality Assurance

Testing documentation and strategies:

#### Test Architecture
- **[Integration Test Architecture](INTEGRATION_TEST_DATABASE_ARCHITECTURE.md)** - Database isolation for tests
- **[Integration Test Solution](architecture/integration-test-solution-architecture.md)** - Test infrastructure design
- **[E2E Optimizations](E2E_OPTIMIZATIONS.md)** - Performance improvements and best practices
- **[Unified Timeout Strategy](UNIFIED_TIMEOUT_STRATEGY.md)** - Consistent timeout configuration

#### Test Suites
- **[Audit Testing Suite](AUDIT_TESTING_SUITE.md)** - Comprehensive audit trail verification
- **[Financial Audit Tests](FINANCIAL_AUDIT_TESTS.md)** - Financial operation validation
- **Test Mode** - See [Audit Service Integration](audit-service-integration.md)

### Deployment & Operations

Deployment processes and operational procedures:

- **[Deployment Guide](DEPLOYMENT.md)** - Deployment procedures and best practices
- **[Deployment Checklist](DEPLOYMENT_CHECKLIST.md)** - Pre-deployment verification
- **[Enterprise Database Deployment](ENTERPRISE_DATABASE_DEPLOYMENT.md)** - Production database setup
- **[Deployment Pipeline Integration](DEPLOYMENT_PIPELINE_INTEGRATION.md)** - CI/CD configuration

### Financial & Compliance

Financial systems and reconciliation:

- **[Financial Reconciliation System](FINANCIAL_RECONCILIATION_SYSTEM.md)** - Financial monitoring and compliance
- **[Financial Audit Tests](FINANCIAL_AUDIT_TESTS.md)** - Financial operation validation
- **Donations Analytics** - See [Donations System](DONATIONS_SYSTEM.md)

### Implementation Guides

Guides for implementing specific features or fixes:

- **[Audit Service Integration](audit-service-integration.md)** - Adding audit logging to endpoints
- **[SQL Fixes Implementation](IMPLEMENTATION_GUIDE_SQL_FIXES.md)** - SQL compatibility fixes

## 🎯 Common Tasks

### For New Developers

1. Start with [Installation Guide](../INSTALLATION.md)
2. Read [CLAUDE.md](../CLAUDE.md) for project overview
3. Review [API Documentation](api/README.md)
4. Check [Bootstrap System](BOOTSTRAP_SYSTEM.md) for data initialization

### For API Development

1. Review [API Overview](api/README.md)
2. Follow [Async Service Pattern](api/README.md#async-service-pattern)
3. Check [HTTP Status Codes](HTTP_STATUS_CODES.md) for semantic usage
4. Add [Audit Logging](audit-service-integration.md) to new endpoints

### For Testing

1. Review [E2E Optimizations](E2E_OPTIMIZATIONS.md)
2. Check [Unified Timeout Strategy](UNIFIED_TIMEOUT_STRATEGY.md)
3. Use [Integration Test Architecture](INTEGRATION_TEST_DATABASE_ARCHITECTURE.md)
4. Follow [Test Boundaries](architecture/test-boundaries-architecture.md)

### For Deployment

1. Complete [Deployment Checklist](DEPLOYMENT_CHECKLIST.md)
2. Review [Deployment Guide](DEPLOYMENT.md)
3. Check [Database Migrations](DATABASE_MIGRATIONS.md)
4. Verify [Bootstrap Configuration](BOOTSTRAP_SYSTEM.md)

## 📖 Documentation by Feature

### Donations
- [Donations System](DONATIONS_SYSTEM.md) - Main documentation
- [API Endpoints](api/README.md#donations-services) - Donations API
- [Admin Dashboard](api/README.md#admin-donations-dashboard) - Analytics endpoint

### Tickets & Registration
- [Order Numbers](ORDER_NUMBERS.md) - Order ID system
- [Wallet Setup](WALLET_SETUP.md) - Mobile wallet passes
- [QR Validation](QR_VALIDATION_ENHANCEMENTS.md) - QR code validation
- [Registration API](api/REGISTRATION_API.md) - Registration endpoints
- [Registration Flow](REGISTRATION_CONFIRMATION_FLOW.md) - Complete flow

### Payments
- [Payment API](api/README.md#payment-services) - Stripe integration
- [PayPal SDK](PAYPAL_SDK_INTEGRATION.md) - PayPal implementation
- [Mobile PayPal](MOBILE_PAYPAL_OPTIMIZATION.md) - Mobile optimization

### Gallery & Media
- [Google Drive Integration](GOOGLE_DRIVE_INTEGRATION.md) - Gallery system
- [Google Drive Setup](api/GOOGLE_DRIVE_SETUP.md) - API configuration

### Admin Panel
- [Admin Design System](ADMIN_DESIGN_SYSTEM.md) - Design guidelines
- [Admin API](api/README.md#admin-services) - Admin endpoints
- [Donations Dashboard](api/README.md#admin-donations-dashboard) - Donations analytics

### Database
- [Database Migrations](DATABASE_MIGRATIONS.md) - Migration system
- [Database Optimization](DATABASE_OPTIMIZATION_SUMMARY.md) - Performance tuning
- [Connection Manager](CONNECTION_MANAGER.md) - Connection pooling
- [Bootstrap System](BOOTSTRAP_SYSTEM.md) - Data initialization

### Performance
- [Performance Optimization](PERFORMANCE_OPTIMIZATION.md) - Caching & optimization
- [Caching Strategy](CACHING_STRATEGY.md) - Cache architecture
- [QR Wallet Performance](QR_WALLET_PERFORMANCE_GUIDE.md) - QR/wallet optimization
- [E2E Optimizations](E2E_OPTIMIZATIONS.md) - Test performance

## 🔍 Finding Documentation

### By Topic
- Use the categories above to browse by system area
- Check "Documentation by Feature" for feature-specific docs

### By File Type
- **Guides**: Step-by-step implementation instructions
- **Architecture**: System design and technical decisions
- **API**: Endpoint specifications and usage
- **Reference**: Configuration examples and templates

### Search Tips
- Use your IDE's file search for keywords
- Check CLAUDE.md for quick references
- Review CHANGELOG.md for recent feature additions

## 📝 Documentation Standards

### Writing Guidelines

When creating or updating documentation:

1. **Clear Structure**: Use headings, bullets, and code blocks
2. **Code Examples**: Include working code samples
3. **API Specs**: Document request/response formats
4. **Error Handling**: Document error codes and messages
5. **Links**: Cross-reference related documentation

### Documentation Template

```markdown
# Feature Name

## Overview
Brief description of the feature or system

## Architecture
High-level design and components

## Usage
How to use the feature with examples

## API Reference
Endpoint specifications (if applicable)

## Configuration
Required setup and environment variables

## Testing
How to test the feature

## Troubleshooting
Common issues and solutions

## Related Documentation
Links to related docs
```

## 🆘 Getting Help

### Documentation Issues

If you find documentation that is:
- **Outdated**: Create an issue or PR with updates
- **Missing**: Request new documentation via GitHub issue
- **Unclear**: Ask for clarification in discussions

### Contact

- **Email**: alocubanoboulderfest@gmail.com
- **Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)
- **Issues**: GitHub repository issues

## 🔄 Recent Updates

**Latest Documentation Additions**:
- ⭐ **Donations System** - Complete donations documentation (NEW)
- Updated API docs with donations endpoints
- Enhanced admin dashboard documentation
- Updated payment flow with donations support

See [CHANGELOG.md](../CHANGELOG.md) for complete update history.

---

**Last Updated**: October 2025
**Documentation Version**: 2.0
