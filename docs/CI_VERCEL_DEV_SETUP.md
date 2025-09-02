# Vercel Dev CI Server Setup

This document explains how to use the `vercel-dev-ci.js` script for dynamic port allocation in CI environments.

## Overview

The `scripts/vercel-dev-ci.js` script provides a robust CI pipeline solution for starting Vercel Dev servers with dynamic port allocation. This enables parallel test execution across multiple CI jobs without port conflicts.

## Features

- **Dynamic Port Allocation**: Supports ports 3000-3005 via `DYNAMIC_PORT` or `PORT` environment variables
- **Port Conflict Resolution**: Automatically clears conflicting processes
- **Health Check Verification**: Comprehensive health checking with retry logic
- **Graceful Shutdown**: Proper cleanup with signal handling
- **CI Optimization**: Non-interactive mode with CI-specific settings
- **Database Isolation**: Port-specific database configuration for test safety

## Port Allocation Matrix

| Test Suite | Port | Environment Variable |
|------------|------|---------------------|
| Standard | 3000 | `DYNAMIC_PORT=3000` |
| Advanced | 3001 | `DYNAMIC_PORT=3001` |
| Firefox | 3002 | `DYNAMIC_PORT=3002` |
| Performance | 3003 | `DYNAMIC_PORT=3003` |
| Accessibility | 3004 | `DYNAMIC_PORT=3004` |
| Security | 3005 | `DYNAMIC_PORT=3005` |

## Usage

### Basic Usage

```bash
# Start server on default port (3000)
node scripts/vercel-dev-ci.js

# Start server on specific port via environment variable
DYNAMIC_PORT=3001 node scripts/vercel-dev-ci.js
```

### NPM Scripts

```bash
# Start CI server (uses DYNAMIC_PORT or defaults to 3000)
npm run start:ci

# Start CI server with explicit port
npm run start:ci:port

# Start Vercel dev in CI mode
npm run vercel:dev:ci
```

### Environment Variables

#### Required for E2E Testing
- `TURSO_DATABASE_URL`: Production database URL
- `TURSO_AUTH_TOKEN`: Database authentication token

#### Port Configuration (in priority order)
1. `DYNAMIC_PORT`: Primary port variable for CI matrix
2. `PORT`: Fallback port variable
3. Default: `3000`

#### Optional Configuration
- `TEST_ADMIN_PASSWORD`: Admin password for testing (defaults to 'test-password')
- `NODE_ENV`: Environment mode (defaults to 'test')

## CI Integration

### GitHub Actions Example

```yaml
name: E2E Tests - Parallel Execution

jobs:
  e2e-standard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Start Vercel Dev Server
        run: DYNAMIC_PORT=3000 node scripts/vercel-dev-ci.js &
      - name: Run Standard E2E Tests
        run: DYNAMIC_PORT=3000 npm run test:e2e:ci:standard

  e2e-advanced:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Start Vercel Dev Server
        run: DYNAMIC_PORT=3001 node scripts/vercel-dev-ci.js &
      - name: Run Advanced E2E Tests
        run: DYNAMIC_PORT=3001 npm run test:e2e:ci:advanced
```

### Parallel Test Execution

```bash
# Run all test suites in parallel (different terminals/CI jobs)
DYNAMIC_PORT=3000 npm run test:e2e:ci:standard &
DYNAMIC_PORT=3001 npm run test:e2e:ci:advanced &
DYNAMIC_PORT=3002 npm run test:e2e:ci:firefox &
DYNAMIC_PORT=3003 npm run test:e2e:ci:performance &
DYNAMIC_PORT=3004 npm run test:e2e:ci:accessibility &
DYNAMIC_PORT=3005 npm run test:e2e:ci:security &
wait
```

## Health Checking

### Built-in Health Checks

The script automatically performs health checks on startup:

1. **Environment validation**: Node.js version, Vercel CLI, environment variables
2. **Port conflict resolution**: Clears any processes using the target port
3. **Server startup verification**: Waits for server to respond
4. **Endpoint health check**: Validates `/api/health/check` endpoint

### Manual Health Check

```bash
# Check if server on port 3001 is healthy
node scripts/vercel-dev-ci.js --health-check --port 3001
```

### Health Check via API

```javascript
import { healthCheck } from './scripts/vercel-dev-ci.js';

const result = await healthCheck(3001);
console.log('Server healthy:', result.healthy);
```

## Database Configuration

### Port-Specific Database Isolation

Each port gets its own database configuration to prevent test interference:

```bash
# Port 3000 uses default Turso database
# Port 3001 uses port-specific database configuration
# Port 3002-3005 each have isolated database settings
```

### Environment Files

The script creates port-specific environment files:

```
.tmp/port-3000/ci.env
.tmp/port-3001/ci.env
.tmp/port-3002/ci.env
...etc
```

## Troubleshooting

### Port Conflicts

If you encounter port conflicts:

```bash
# Check what's using the port
lsof -ti:3001

# Kill process manually if needed
kill -9 $(lsof -ti:3001)

# The script handles this automatically, but manual intervention may be needed
```

### Server Won't Start

1. **Verify Vercel CLI**: `vercel --version`
2. **Check Node.js version**: Requires Node.js 18+
3. **Validate environment variables**: Ensure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set
4. **Check port availability**: Use `lsof -ti:PORT_NUMBER`

### Health Check Failures

1. **Wait longer**: Server startup can take 30-90 seconds
2. **Check logs**: Look for error messages in server output
3. **Verify database connection**: Ensure Turso credentials are correct
4. **Test manually**: Try `curl http://localhost:PORT/api/health/check`

## Testing the Script

Run the test suite to verify functionality:

```bash
node scripts/test-vercel-ci-port-allocation.js
```

This validates:
- Port allocation logic
- Environment variable priority
- Health check functionality
- Port availability checking

## Graceful Shutdown

The server handles shutdown signals properly:

- `SIGINT` (Ctrl+C): Graceful shutdown with cleanup
- `SIGTERM`: Graceful shutdown with 10-second timeout
- Process cleanup: Kills Vercel dev process and releases port

## Performance Considerations

- **Startup Time**: 30-90 seconds depending on environment
- **Memory Usage**: Optimized with `--max-old-space-size=3072`
- **Port Range**: Limited to 3000-3005 for CI matrix compatibility
- **Health Check Retries**: 3 attempts with exponential backoff

## Best Practices

1. **Always use DYNAMIC_PORT**: Set explicit port for CI jobs
2. **Wait for health check**: Don't run tests until server is healthy
3. **Cleanup on exit**: Ensure proper shutdown in CI scripts
4. **Monitor logs**: Check server output for startup issues
5. **Isolate databases**: Use port-specific database configurations

## Integration with Existing Scripts

This script works alongside existing scripts:

- `vercel-dev-start.js`: Local development optimized
- `vercel-dev-wrapper.js`: General wrapper with cleanup
- `vercel-dev-e2e.js`: E2E specific optimizations
- `ci-setup.js`: Comprehensive CI environment setup

Choose the appropriate script based on your needs:
- **Local development**: `vercel-dev-start.js`
- **CI with dynamic ports**: `vercel-dev-ci.js`
- **E2E testing**: `vercel-dev-e2e.js`
- **Full CI setup**: `ci-setup.js`