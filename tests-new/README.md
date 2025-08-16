# Integration Test Suite

This directory contains the new integration testing infrastructure for the A Lo Cubano Boulder Fest application. These tests run against a real Vercel development server and interact with actual APIs and database connections.

## Architecture

### Core Infrastructure

- **`core/server.js`** - Manages Vercel dev server lifecycle
- **`core/http.js`** - HTTP client for making API requests
- **`core/auth.js`** - Authentication helpers for admin endpoints
- **`core/database.js`** - Database utilities with Turso connection
- **`core/stripe-helpers.js`** - Stripe webhook signature generation

### Test Configuration

- **`vitest.config.js`** - Vitest configuration for integration tests
- **`core/setup.js`** - Global test setup and teardown

### Test Structure

```
tests-new/
├── core/              # Core testing infrastructure
├── integration/       # Integration test files
├── helpers/           # Test utilities and data factories
├── fixtures/          # Test configuration and environment
└── README.md         # This file
```

## Features

### Real Server Testing
- Starts actual Vercel dev server on port 3001
- Uses real API endpoints and routes
- Tests complete request/response cycle

### Database Integration
- Connects to actual Turso database
- Supports both local SQLite and remote Turso
- Automatic schema setup and cleanup

### Authentication Testing
- Real JWT token generation and validation
- Admin login flow testing
- Protected route access verification

### Stripe Integration
- Webhook signature generation and validation
- Payment intent simulation
- Real payment flow testing

### HTTP Client
- Comprehensive request methods (GET, POST, PUT, DELETE, PATCH)
- Automatic response parsing (JSON, text, blob)
- Authentication header management
- Form data and file upload support

## Environment Configuration

Required environment variables:

```bash
# Database
TURSO_DATABASE_URL="file:./test-integration.db"  # or remote Turso URL
TURSO_AUTH_TOKEN="your-turso-token"              # if using remote

# Authentication
ADMIN_SECRET="your-32-character-secret-key"
ADMIN_PASSWORD="bcrypt-hashed-password"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Brevo (optional)
BREVO_API_KEY="xkeysib-..."
BREVO_WEBHOOK_SECRET="your-webhook-secret"

# QR Codes
QR_SECRET_KEY="your-qr-secret-key"
```

## Usage

### Running Tests

```bash
# Run all integration tests
npm run test:new

# Run with watch mode
npm run test:new:watch

# Run with coverage
npm run test:new:coverage

# Run specific test file
npx vitest tests-new/integration/api-health.test.js

# Run in shards (for CI)
npm run test:new:shard1
npm run test:new:shard2
```

### Writing Tests

1. Import required helpers:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { httpClient } from '@core/http.js';
import { databaseHelper } from '@core/database.js';
import { authHelper } from '@core/auth.js';
```

2. Setup test environment:
```javascript
beforeEach(async () => {
  await databaseHelper.initialize();
  await databaseHelper.cleanBetweenTests();
});
```

3. Make HTTP requests:
```javascript
const response = await httpClient.get('/api/health/check');
expect(response.ok).toBe(true);
```

4. Test authenticated endpoints:
```javascript
await authHelper.setupTestAuth();
const response = await authHelper.authenticatedRequest('GET', '/api/admin/dashboard');
```

### Test Data Factory

Use the test data factory for consistent test data:

```javascript
import { TestDataFactory } from '@helpers/test-data.js';

const ticketData = TestDataFactory.createTicketData({
  buyer_email: 'custom@test.com'
});

const ticket = await databaseHelper.createTestTicket(ticketData);
```

## Available Test Helpers

### HTTP Client (`httpClient`)

```javascript
// Basic requests
await httpClient.get('/api/endpoint');
await httpClient.post('/api/endpoint', data);
await httpClient.put('/api/endpoint', data);
await httpClient.delete('/api/endpoint');

// With options
await httpClient.get('/api/endpoint', {
  headers: { 'Custom-Header': 'value' },
  timeout: 5000
});

// Form uploads
await httpClient.postForm('/api/upload', formData);
await httpClient.uploadFile('/api/files', file);

// Webhook requests
await httpClient.webhookRequest('/api/webhook', payload, signature);
```

### Database Helper (`databaseHelper`)

```javascript
// Create test data
const ticket = await databaseHelper.createTestTicket(data);
const subscriber = await databaseHelper.createTestSubscriber(data);

// Query data
const ticket = await databaseHelper.getTicket(id);
const subscriber = await databaseHelper.getSubscriber(email);

// Raw queries
const result = await databaseHelper.query('SELECT * FROM tickets WHERE id = ?', [id]);

// Cleanup
await databaseHelper.cleanBetweenTests();
```

### Auth Helper (`authHelper`)

```javascript
// Setup authentication
await authHelper.setupTestAuth();
const token = authHelper.generateTestAdminToken();

// Make authenticated requests
const response = await authHelper.authenticatedRequest('GET', '/api/admin/dashboard');

// Generate tokens
const qrToken = authHelper.generateTestQrToken(ticketId);
const apiKey = authHelper.generateTestApiKey('service-name');
```

### Stripe Helpers (`stripeHelpers`)

```javascript
// Generate webhook signatures
const signature = stripeHelpers.generateWebhookSignature(payload);

// Simulate payments
const result = await stripeHelpers.simulateSuccessfulPayment(paymentData);
await stripeHelpers.simulateFailedPayment(paymentData);

// Create test events
const event = stripeHelpers.createPaymentIntentSucceededEvent(data);
const response = await stripeHelpers.sendWebhook(event);
```

## Test Categories

### API Health Tests
- Health check endpoints
- Database connectivity
- External service status
- Error handling

### Database Operations Tests
- CRUD operations
- Query execution
- Transaction support
- Data cleanup

### Authentication Tests
- Admin login flow
- JWT token validation
- Protected route access
- Session management

### Stripe Integration Tests
- Webhook signature validation
- Payment processing
- Event handling
- Error scenarios

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean test data between tests
3. **Real APIs**: Use actual API endpoints, not mocks
4. **Environment**: Ensure test environment is properly configured
5. **Assertions**: Test both success and error scenarios
6. **Performance**: Keep tests reasonably fast (< 30 seconds per test)

## Debugging

### Server Issues
Check server logs and ensure Vercel dev server starts properly:
```bash
# Check if server is running
curl http://localhost:3001/api/health/simple

# View server startup logs
npm run test:new:watch  # Will show detailed startup logs
```

### Database Issues
Verify database connection and schema:
```javascript
const stats = await databaseHelper.getStats();
console.log('Database stats:', stats);
```

### Authentication Issues
Validate environment configuration:
```javascript
const validation = authHelper.validateAdminConfig();
console.log('Auth config:', validation);
```

## Performance Considerations

- Tests use single fork for database stability
- Server starts once and reuses connection
- Database cleanup is optimized for speed
- HTTP requests have reasonable timeouts
- Retry logic for flaky external APIs

## CI/CD Integration

The test suite is designed to work in CI environments:

- Uses file-based SQLite by default
- Supports sharding for parallel execution
- Has proper cleanup and error handling
- Provides detailed logging for debugging

## Contributing

When adding new integration tests:

1. Follow the existing patterns and structure
2. Use the provided helpers and utilities
3. Include both success and error scenarios
4. Add proper cleanup in beforeEach/afterEach
5. Document any new environment requirements
6. Test locally before submitting PR