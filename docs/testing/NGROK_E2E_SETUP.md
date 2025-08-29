# ngrok E2E Testing Setup

This document describes the automated E2E testing environment that uses ngrok tunnels for external access during testing.

## Quick Start

```bash
# Run all E2E tests with automated ngrok setup
npm run test:e2e:ngrok

# Run with UI mode
npm run test:e2e:ngrok:ui

# Run specific tests
npm run test:e2e:ngrok -- --grep "admin"

# Run with headed browser (visible)
npm run test:e2e:ngrok:headed
```

## What It Does

The `scripts/e2e-with-ngrok.js` wrapper script orchestrates the complete testing environment:

1. **Checks ngrok installation** - Verifies ngrok is available and configured
2. **Starts ngrok tunnel** - Creates tunnel to localhost:3000 with subdomain `alocubanoboulderfest` (if auth token available)
3. **Verifies tunnel accessibility** - Tests that the tunnel is reachable from external networks
4. **Starts Vercel dev server** - Launches the application on port 3000
5. **Waits for application readiness** - Polls health endpoint until app is ready
6. **Runs Playwright tests** - Executes E2E tests against the ngrok URL
7. **Cleans up processes** - Properly terminates all processes on completion or error

## Prerequisites

### ngrok Installation

```bash
# macOS
brew install ngrok/ngrok/ngrok

# Or download from https://ngrok.com/download
```

### Authentication Token (Optional but Recommended)

For consistent subdomain support, set up an ngrok auth token:

```bash
# Get token from https://dashboard.ngrok.com/get-started/your-authtoken
export NGROK_AUTHTOKEN=your_token_here

# Or add to your shell profile (.bashrc, .zshrc, etc.)
echo "export NGROK_AUTHTOKEN=your_token_here" >> ~/.zshrc
```

**Without auth token**: Random ngrok URLs will be used  
**With auth token**: Consistent `alocubanoboulderfest.ngrok.io` subdomain

## Environment Variables

The script requires these environment variables for proper testing:

```bash
# Required for E2E tests
TURSO_DATABASE_URL=your_turso_database_url
TURSO_AUTH_TOKEN=your_turso_auth_token

# Optional for ngrok subdomain
NGROK_AUTHTOKEN=your_ngrok_auth_token

# Test configuration
TEST_ADMIN_PASSWORD=your_test_password
```

## Script Features

### Process Management
- Proper cleanup of all spawned processes
- Graceful shutdown handling (SIGINT, SIGTERM)
- Process isolation and error handling

### Health Monitoring
- ngrok tunnel accessibility verification
- Vercel dev server readiness detection
- Application health endpoint validation

### Test Integration
- Passes through Playwright command-line arguments
- Supports all Playwright modes (UI, debug, headed, etc.)
- Maintains test isolation and database state

### Error Handling
- Comprehensive error messages
- Automatic cleanup on failure
- Timeout handling for all operations

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run test:e2e:ngrok` | Run all E2E tests with ngrok |
| `npm run test:e2e:ngrok:ui` | Interactive Playwright UI |
| `npm run test:e2e:ngrok:headed` | Visible browser testing |
| `npm run test:e2e:ngrok:debug` | Debug mode with breakpoints |
| `npm run test:e2e:ngrok:fast` | Chromium-only for faster execution |

## Troubleshooting

### ngrok Not Installed
```
❌ ngrok is not installed. Please install it first:
   brew install ngrok/ngrok/ngrok  (macOS)
   or visit: https://ngrok.com/download
```

### Tunnel Not Accessible
- Check your internet connection
- Verify ngrok service is running
- Try restarting the script

### Vercel Dev Server Issues
- Check port 3000 is available
- Verify environment variables are set
- Review Vercel dev server logs

### Database Connection Issues
- Ensure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set
- Check Turso database is accessible
- Verify E2E database setup

## Security Considerations

⚠️ **IMPORTANT**: This is for local development only!

- ngrok tunnels expose your local server to the public internet
- No authentication is enforced by default on the tunnel
- Only use for local development and testing
- Never use in production or CI environments
- Be mindful of sensitive data in your development environment

## Integration with CI/CD

This ngrok setup is designed for **local development only**. For CI/CD environments, use the standard E2E test configurations that don't require external tunnels:

```bash
# For CI/CD environments
npm run test:e2e:ci
```

## Monitoring and Debugging

### ngrok Inspector
Access the ngrok web interface at: http://localhost:4040

### Process Status
The script provides detailed status output:
- ✅ Success indicators
- ⚠️ Warnings 
- ❌ Error messages
- 🔍 Progress indicators

### Test Artifacts
- Playwright reports: `playwright-report/index.html`
- Screenshots and videos on test failures
- Console logs for all processes