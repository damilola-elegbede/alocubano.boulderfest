# Test Infrastructure Core Modules

## Overview

The test infrastructure supports dual-mode execution:
- **Local/Dev Mode**: Uses real Vercel server with actual API endpoints
- **CI Mock Mode**: Uses mock server with predefined responses (no Vercel token required)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   Test Suite    │────▶│   HTTP Client    │
└─────────────────┘     └──────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              CI Mode?                    │
                    │                     │
            ┌───────▼────────┐   ┌───────▼────────┐
            │  Mock Server   │   │  Real Server   │
            │  (mock-*.js)   │   │  (server.js)   │
            └────────────────┘   └────────────────┘
```

## Mode Detection

The system automatically detects the appropriate mode:

```javascript
const IS_CI = process.env.CI === 'true';
const HAS_VERCEL_TOKEN = Boolean(process.env.VERCEL_TOKEN);
const USE_MOCK = IS_CI && !HAS_VERCEL_TOKEN;
```

### Execution Modes

1. **Local Development** (`CI=false`)
   - Uses real Vercel dev server
   - Full integration testing
   - Requires local environment setup

2. **CI with Mock** (`CI=true`, no `VERCEL_TOKEN`)
   - Uses mock server
   - No external dependencies
   - Fast, deterministic responses
   - Default CI behavior

3. **CI with Real Server** (`CI=true`, `VERCEL_TOKEN` set)
   - Uses real Vercel server in CI
   - Requires GitHub secret configuration
   - Full integration testing in CI

## Mock Server

### Features

- Zero startup time (no process spawning)
- Predefined responses for all API endpoints
- Dynamic value generation (timestamps, IDs)
- Request logging for test verification
- Parameter substitution for dynamic routes

### Adding Mock Responses

Edit `mock-server.js` and add to `setupDefaultMocks()`:

```javascript
this.addMock('POST', '/api/custom/endpoint', {
  status: 200,
  data: {
    success: true,
    id: ':paramId',  // Will be replaced with actual value
    timestamp: new Date().toISOString()  // Dynamic
  }
});
```

### Mock Response Structure

```javascript
{
  status: 200,              // HTTP status code
  data: {...},             // Response body
  headers: {...}           // Optional response headers
}
```

## HTTP Client

The HTTP client automatically switches between mock and real implementations:

```javascript
import { httpClient } from '@core/http.js';

// Works in both modes
const response = await httpClient.get('/api/health/check');
```

### Client Methods

- `get(path, options)`
- `post(path, data, options)`
- `put(path, data, options)`
- `delete(path, options)`
- `patch(path, data, options)`
- `authenticatedRequest(method, path, data, token, options)`
- `webhookRequest(path, payload, signature, options)`

## Test Helpers

### Mode Detection

```javascript
import { isCI, isMockMode, isRealServerMode } from '@helpers/test-mode.js';

if (isMockMode()) {
  console.log('Using mock server');
}
```

### Conditional Test Execution

```javascript
import { skipInCI, onlyInCI } from '@helpers/test-mode.js';

// Skip test in CI without real server
skipInCI(it)('should test with real server', async () => {
  // Test requiring real server
});

// Only run in CI
onlyInCI(it)('should test CI behavior', async () => {
  // CI-specific test
});
```

## CI Configuration

### GitHub Actions

```yaml
- name: Run tests with mock server
  env:
    CI: "true"
    NODE_ENV: "test"
    # Optional: Add to use real server
    # VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
  run: npm run test:new
```

### Enabling Real Server in CI

1. Add `VERCEL_TOKEN` to GitHub repository secrets
2. Uncomment the token line in workflow
3. Tests will automatically use real server

## Debugging

### Check Current Mode

```bash
# Local testing in mock mode
CI=true npm run test:new

# Check mode in test
console.log(process.env.CI);  // 'true' or undefined
console.log(process.env.VERCEL_TOKEN);  // Token or undefined
```

### Mock Server Logs

The mock server logs all requests:

```javascript
const requestLog = mockServer.getRequestLog();
console.log('Requests made:', requestLog);
```

### Verify Mock Responses

```bash
# Test mock server directly
node scripts/test-mock-server.js

# Test in CI mode locally
bash scripts/test-ci-mode.sh
```

## Performance

### Mock Mode Benefits

- **Instant startup**: No server process to spawn
- **Deterministic**: Same responses every time
- **Fast execution**: No network latency
- **Parallel safe**: No port conflicts

### Typical Execution Times

- Mock mode: ~5-10 seconds for full suite
- Real server: ~30-60 seconds (includes startup)

## Troubleshooting

### Tests Failing in CI

1. Check if mock responses are defined:
   ```javascript
   // In mock-server.js
   this.addMock('METHOD', '/path', response);
   ```

2. Verify CI environment is detected:
   ```javascript
   console.log('CI mode:', process.env.CI === 'true');
   ```

3. Check request logs:
   ```javascript
   console.log(mockServer.getRequestLog());
   ```

### Mock vs Real Differences

If tests pass with mock but fail with real server:

1. Mock response doesn't match real API
2. Update mock response to match actual behavior
3. Consider adding validation tests that run with real server

### Port Conflicts

Mock server doesn't use real ports, so no conflicts possible.

## Best Practices

1. **Keep mocks up-to-date**: Regularly verify mock responses match real API
2. **Test both modes**: Run with real server before releases
3. **Log mode clearly**: Always show which mode is active
4. **Document differences**: Note any behavior differences between modes
5. **Use type checking**: Ensure mock responses match expected types

## Future Enhancements

- [ ] Generate mocks from OpenAPI spec
- [ ] Record/replay real responses
- [ ] Mock response validation
- [ ] Performance benchmarking
- [ ] Automatic mock drift detection