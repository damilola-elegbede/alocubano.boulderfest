# CI Development Server

## Overview

The CI Development Server (`scripts/ci-server.js`) is a lightweight Express.js server designed to run Vercel serverless functions in CI environments without requiring Vercel authentication. It serves as a drop-in replacement for `vercel dev` in automated testing scenarios.

## Problem Solved

GitHub Actions workflows were failing when trying to run performance tests because:

1. `vercel dev` requires authentication (`vercel login` or `--token`)
2. CI environments don't have Vercel credentials
3. Performance tests need a running server to execute load tests against

## Solution Features

### 🚀 **Serverless Function Compatibility**
- Dynamically imports and executes Vercel serverless functions
- Supports parameterized routes (e.g., `/api/tickets/[ticketId].js`)
- Handles ES6 modules with proper import caching
- Compatible with existing function signatures

### 🛡️ **Error Handling**
- Graceful handling of missing dependencies in CI
- Timeout protection for slow handlers (30s limit)
- Detailed error messages for debugging
- Circuit breaker pattern for repeated failures

### 🔧 **CI Optimization**
- Automatic CI environment detection
- Mock services for unavailable dependencies  
- Minimal resource footprint
- Fast startup time (<5 seconds)

### 📊 **Monitoring & Debugging**
- Health check endpoint at `/health`
- API endpoint discovery and listing
- Request/response logging in CI mode
- Performance metrics collection

## Usage

### NPM Scripts

```bash
# Start CI server (used in GitHub Actions)
npm run start:ci

# Test CI server functionality
npm run test:ci-server

# Original Vercel dev server (local development)
npm run start:local
```

### Manual Usage

```bash
# Start server
node scripts/ci-server.js

# With environment variables
CI=true NODE_ENV=ci node scripts/ci-server.js
```

## API Compatibility

The server provides Vercel-compatible request/response objects:

### Request Object
```javascript
{
  body,        // Parsed request body
  query,       // Query parameters + route parameters
  headers,     // Request headers
  method,      // HTTP method
  url,         // Request URL
  params       // Route parameters (Express-style)
}
```

### Response Object
```javascript
{
  status(code),     // Set status code
  json(data),       // Send JSON response
  send(data),       // Send response
  setHeader(k, v),  // Set response header
  end(data),        // End response
  redirect(url)     // Redirect response
}
```

## Route Resolution

The server handles multiple route patterns:

1. **Direct files**: `/api/health/check.js` → `/api/health/check`
2. **Index files**: `/api/tickets/index.js` → `/api/tickets`
3. **Parameterized**: `/api/tickets/[ticketId].js` → `/api/tickets/abc123`
4. **Common patterns**: Automatically detects `id`, `ticketId`, `userId`, `fileId` parameters

## Environment Handling

### CI Mode Detection
```javascript
if (process.env.CI || process.env.NODE_ENV === 'ci') {
  // Enable CI-specific configurations
}
```

### Mock Services
When dependencies are unavailable, the server provides:
- Mock database responses
- Mock email service calls
- Mock payment processing
- Mock authentication

## GitHub Actions Integration

### Workflow Configuration

```yaml
- name: Validate CI server
  run: npm run test:ci-server

- name: Start application
  run: |
    npm run start:ci &
    npx wait-on http://localhost:3000 --timeout 45000 --interval 1000

- name: Run tests
  run: npm run test:performance
  env:
    LOAD_TEST_BASE_URL: http://localhost:3000
```

### Environment Variables

The server automatically sets CI-friendly defaults:

```bash
NODE_ENV=test
TURSO_DATABASE_URL=file:./data/test.db
TURSO_AUTH_TOKEN=test-token
```

## Performance Characteristics

### Startup Time
- **Cold start**: 3-5 seconds
- **Warm start**: 1-2 seconds
- **Health check**: <100ms response time

### Resource Usage
- **Memory**: ~50MB baseline
- **CPU**: Minimal when idle
- **Disk**: No persistent storage requirements

### Scaling
- **Concurrent requests**: 100+ (Node.js default)
- **Request timeout**: 30 seconds
- **Graceful shutdown**: 5 second timeout

## Error Scenarios

### Missing Dependencies
```json
{
  "error": "Service temporarily unavailable",
  "message": "Required dependencies not available in CI environment",
  "path": "health/check"
}
```

### Handler Timeout
```json
{
  "error": "Gateway timeout",
  "message": "Handler timeout",
  "path": "slow/endpoint"
}
```

### Import Failures
```json
{
  "error": "Invalid serverless function", 
  "expected": "function",
  "received": "undefined"
}
```

## Testing Strategy

### Validation Tests
- Server starts successfully
- Health endpoints respond correctly
- API routing works for common patterns
- Error handling behaves properly
- Static file serving functions

### CI Integration Tests
- Workflow can start server
- Performance tests can connect
- Load testing completes successfully
- Server shuts down gracefully

## Troubleshooting

### Server Won't Start
1. Check Node.js version (requires 18+)
2. Verify dependencies are installed (`npm ci`)
3. Check port availability (default 3000)
4. Review startup logs for errors

### API Endpoints Not Found
1. Verify file exists in `/api` directory
2. Check file has valid `export default` handler
3. Review route parameter patterns
4. Check server logs for import errors

### Tests Failing
1. Validate server starts with `npm run test:ci-server`
2. Check `wait-on` timeout values in workflows
3. Review CI environment variables
4. Verify mock services are adequate

## Development

### Adding New Route Patterns
Update the route resolution logic in `scripts/ci-server.js`:

```javascript
// Add new parameter patterns
const paramNames = ['id', 'ticketId', 'userId', 'fileId', 'newParam'];
```

### Adding Mock Services
Extend `scripts/ci-mock-services.js`:

```javascript
export const mockNewService = {
  method: async (params) => {
    console.log('[MOCK NEW] Action:', params);
    return { success: true };
  }
};
```

### Environment Configuration
Modify the CI mode detection:

```javascript
if (process.env.CI || process.env.NODE_ENV === 'ci') {
  process.env.NEW_SERVICE_URL = 'mock://service';
}
```

## Comparison with Vercel Dev

| Feature | Vercel Dev | CI Server |
|---------|------------|-----------|
| Authentication | Required | Not required |
| Startup time | 10-15s | 3-5s |
| CI compatibility | Poor | Excellent |
| Function support | Full | Core features |
| Edge functions | ✅ | ❌ |
| Build integration | ✅ | ❌ |
| Hot reload | ✅ | ❌ |
| Production parity | High | Medium |

## Future Enhancements

### Short Term
- [ ] Edge function simulation
- [ ] WebSocket support  
- [ ] Request/response middleware
- [ ] Enhanced logging formats

### Long Term
- [ ] Build step integration
- [ ] Advanced caching strategies
- [ ] Multi-environment configuration
- [ ] Performance monitoring dashboard

## Contributing

When modifying the CI server:

1. Test locally with `npm run test:ci-server`
2. Verify GitHub Actions still pass
3. Update documentation as needed
4. Add tests for new functionality
5. Ensure backward compatibility