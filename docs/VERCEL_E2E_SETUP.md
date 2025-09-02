# Vercel E2E Testing Setup Guide

This guide explains the Vercel configuration and setup for E2E testing with the A Lo Cubano Boulder Fest project.

## Overview

The project uses Vercel Dev for local development and E2E testing, providing a production-like serverless environment while maintaining fast development iteration.

## Configuration Files

### 1. vercel.json
Primary Vercel configuration with:
- **buildCommand**: Custom build script (`node vercel-build.cjs`)
- **devCommand**: Development server command (`npm run start:local`)
- **functions**: Serverless function timeouts and memory settings
- **rewrites**: URL routing for SPA behavior
- **headers**: Security headers and caching policies

### 2. .vercel/project.json
Project linking configuration:
```json
{
  "projectId": "prj_21q4owX4mON2O7GSXiYwNu8Z4Wyr",
  "orgId": "team_4WXOqRVzoaqs3lYO5tFNsau0",
  "settings": {
    "framework": null,
    "devCommand": "npm run start:local",
    "buildCommand": "node vercel-build.cjs"
  },
  "dev": {
    "port": 3000,
    "listen": "0.0.0.0:3000",
    "auto": true
  }
}
```

### 3. Environment Variables (.env.local)
Critical variables for E2E testing:
- `E2E_TEST_MODE=true`: Enables E2E testing mode
- `TEST_ADMIN_PASSWORD=test-password`: Plain text admin password for testing
- `NODE_ENV=development`: Development environment
- All Stripe, Brevo, and database configuration

## Database Configuration

### Development Database
- **Local**: SQLite database (`data/development.db`)
- **E2E Tests**: Isolated SQLite database for testing
- **Production**: Turso (libSQL) for production workloads

### Migration System
- Automatic migrations on startup via `npm run migrate:up`
- Version-controlled SQL files in `/migrations`
- Checksum verification and rollback support

## API Routes Configuration

### Function Timeouts
```json
{
  "api/admin/**/*.js": { "maxDuration": 15 },
  "api/email/**/*.js": { "maxDuration": 20 },
  "api/registration/**/*.js": { "maxDuration": 15 },
  "api/health/**/*.js": { "maxDuration": 5 },
  "api/**/*.js": { "maxDuration": 30 }
}
```

### Critical API Endpoints
- `/api/health/check` - Health monitoring
- `/api/admin/login` - Admin authentication
- `/api/admin/dashboard` - Admin panel data
- `/api/payments/create-checkout-session` - Stripe payments
- `/api/email/subscribe` - Newsletter subscriptions
- `/api/tickets/validate` - QR code validation
- `/api/registration/batch` - Ticket registration

## Setup and Validation Scripts

### 1. Configuration Validator
```bash
npm run vercel:validate
```
Validates:
- vercel.json structure and required properties
- .vercel/project.json linking
- Environment variables presence
- API routes existence
- Database setup

### 2. E2E Setup Script
```bash
npm run test:e2e:setup
```
Performs:
- Database migration and setup
- Vercel dev server startup
- Server readiness verification
- API endpoint validation

### 3. Interactive Setup
```bash
npm run test:e2e:setup:interactive
```
Same as setup but keeps server running for manual testing.

## Development Workflow

### 1. Initial Setup
```bash
# Validate configuration
npm run vercel:validate

# Setup E2E environment
npm run test:e2e:setup
```

### 2. Running E2E Tests
```bash
# Quick E2E tests (local Vercel dev)
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui

# E2E tests with ngrok (external access)
npm run test:e2e:ngrok
```

### 3. Development Server
```bash
# Local development
npm run start:local

# Development with ngrok
npm start
```

## Troubleshooting

### Port Conflicts
If port 3000 is in use:
```bash
# Kill processes on port 3000
lsof -ti:3000 | xargs kill -9

# Use different port
PORT=3001 npm run start:local
```

### Database Issues
```bash
# Reset database
npm run db:e2e:reset

# Check database health
npm run health:database

# Manual migration
npm run migrate:up
```

### Vercel Dev Issues
```bash
# Clean Vercel cache
npm run start:clean

# Relink project
rm -rf .vercel
vercel link --yes
```

### Configuration Validation Failures
```bash
# Run detailed validation
npm run vercel:validate

# Check environment variables
grep -E "(TEST_ADMIN_PASSWORD|E2E_TEST_MODE)" .env.local
```

## Performance Considerations

### Memory Settings
- Function memory: 1024MB for API functions
- Node.js: `--max-old-space-size=3072` for E2E tests
- Timeout: 30s max for API functions

### Caching Strategy
- API responses: `s-maxage=3600` (1 hour)
- Static assets: `max-age=31536000` (1 year)
- Images: `max-age=31536000, immutable`

### Database Optimization
- SQLite for fast local development
- Connection pooling for production
- Lazy initialization with retry logic

## Security Features

### Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` for HTTPS
- `Content-Security-Policy` for XSS protection

### Authentication
- bcrypt password hashing
- JWT session management
- Admin panel protection
- Rate limiting

## Monitoring and Health Checks

### Health Endpoint
```javascript
GET /api/health/check
{
  "status": "healthy",
  "health_score": 0.987,
  "services": {
    "database": { "status": "healthy", "uptime": 99.9 },
    "stripe": { "status": "healthy", "latency": "45ms" },
    "brevo": { "status": "healthy", "delivery_rate": 98.7 }
  }
}
```

### Error Handling
- Graceful degradation for service failures
- Automatic retry logic for database connections
- Timeout protection for API calls
- Comprehensive error logging

## Best Practices

1. **Always validate configuration** before running tests
2. **Use environment-specific variables** for different stages
3. **Run database migrations** before starting development
4. **Monitor health endpoints** during development
5. **Clean up resources** after testing sessions

## Common Commands

```bash
# Setup and validation
npm run vercel:validate          # Validate Vercel config
npm run test:e2e:setup          # Setup E2E environment
npm run test:e2e:validate       # Validate E2E prerequisites

# Development
npm run start:local             # Local Vercel dev
npm start                       # Vercel dev with ngrok
npm run serve:simple            # Simple HTTP server

# Testing
npm run test:e2e               # E2E tests (local)
npm run test:e2e:ngrok         # E2E tests with ngrok
npm run test:e2e:ui            # Interactive E2E testing

# Database
npm run migrate:up             # Run migrations
npm run health:database        # Check database health
npm run db:e2e:reset          # Reset E2E database

# Maintenance
npm run start:clean            # Clean Vercel startup
vercel link --yes              # Relink project
```