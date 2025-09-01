# Mock Drift Detection System

## Overview

The Mock Drift Detection system ensures that mock server responses stay synchronized with real API responses, preventing test failures and maintaining test accuracy. It automatically compares mock responses against real Vercel dev responses and generates comprehensive reports.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mock Server   │    │ Drift Detector   │    │  Real API       │
│ (ci-mock-server)│◄───┤                  ├───►│ (vercel dev)    │
│ Port 3001       │    │                  │    │ Port 3000       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Mock Response   │    │  Drift Report    │    │ Real Response   │
│   Structure     │    │   Analysis       │    │   Structure     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Components

### 1. Mock Drift Detector (`scripts/mock-drift-detector.js`)
- Core detection engine that compares responses
- Supports structural, status code, and content comparison
- Generates detailed drift reports with severity levels
- Automated server management and cleanup

### 2. Drift Helper (`scripts/drift-helper.js`)
- Development utilities for drift detection
- Quick checks and selective endpoint testing
- Mock response generation from real APIs
- Bulk synchronization capabilities

### 3. GitHub Actions Workflow (`.github/workflows/drift-detection.yml`)
- Weekly automated drift detection
- PR-triggered validation for mock changes
- Automated issue creation for critical drift
- Artifact storage for drift reports

## Features

### Automated Detection
- **Status Code Comparison**: Detects HTTP status mismatches
- **Structural Analysis**: Compares JSON structure and field types
- **Content Validation**: Identifies value differences and missing fields
- **Severity Classification**: High/Medium/Low severity levels
- **Performance Monitoring**: Response time tracking

### Comprehensive Reporting
- **Health Score**: Overall drift health percentage (0-100)
- **Category Breakdown**: Results grouped by API category
- **Severity Analysis**: Issues prioritized by impact level
- **Actionable Recommendations**: Specific guidance for fixes
- **Trend Analysis**: Historical drift patterns (via artifacts)

### Developer Experience
- **Quick Checks**: Fast development-time validation
- **Selective Testing**: Test specific endpoints or categories
- **Mock Generation**: Auto-generate mocks from real responses
- **Bulk Sync**: Synchronize all mocks with real APIs
- **Detailed Logging**: Comprehensive debugging information

## Usage

### Basic Commands

```bash
# Run full drift detection
npm run drift:detect

# Verbose output with detailed logging
npm run drift:detect:verbose

# Quick development check
npm run drift:quick

# List all monitored endpoints
npm run drift:list
```

### Development Workflow

```bash
# 1. Check for drift in specific area
npm run drift:specific health tickets

# 2. Generate mock response from real API
npm run drift:generate /api/health/check

# 3. Quick validation after changes
npm run drift:quick health

# 4. Full validation before commit
npm run drift:detect
```

### Advanced Operations

```bash
# Generate mock from real API response
npm run drift:generate /api/tickets/validate

# Sync all mocks with real APIs (dangerous!)
npm run drift:sync

# Check only payment-related endpoints
npm run drift:specific payments
```

## Monitored Endpoints

### Health Endpoints
- `GET /api/health/check` - Application health status
- `GET /api/health/database` - Database connectivity

### Email Endpoints
- `POST /api/email/subscribe` - Newsletter subscription

### Payment Endpoints
- `POST /api/payments/create-checkout-session` - Stripe checkout creation

### Ticket Endpoints
- `POST /api/tickets/validate` - QR code validation
- `POST /api/tickets/register` - Ticket registration

### Registration Endpoints
- `GET /api/registration/[token]` - Registration status
- `GET /api/registration/health` - Registration system health
- `POST /api/registration/batch` - Batch registration

### Gallery Endpoints
- `GET /api/gallery` - Photo/video listing
- `GET /api/featured-photos` - Featured content

### Admin Endpoints
- `GET /api/admin/dashboard` - Admin dashboard (auth required)
- `POST /api/admin/login` - Admin authentication

## Report Structure

```json
{
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "1.0.0",
    "detector": "MockDriftDetector",
    "endpoints_tested": 12,
    "total_differences": 0
  },
  "summary": {
    "overall": {
      "total_endpoints": 12,
      "matched": 12,
      "drifted": 0,
      "match_rate": "100.0%"
    },
    "by_category": {
      "health": { "total": 2, "matched": 2, "drifted": 0 },
      "payments": { "total": 1, "matched": 1, "drifted": 0 }
    },
    "by_severity": {
      "none": 12,
      "low": 0,
      "medium": 0,
      "high": 0
    },
    "health_score": 100
  },
  "results": [...],
  "recommendations": [...]
}
```

## Severity Levels

### 🔴 High Severity
- **Status code mismatches**: Different HTTP response codes
- **Type mismatches**: String vs Number, Object vs Array
- **Missing required fields**: Fields present in real API but missing in mock

**Impact**: Can cause test failures and incorrect assertions

### 🟡 Medium Severity  
- **Value differences**: Same structure, different values
- **Extra mock fields**: Fields in mock not present in real API

**Impact**: May lead to false test results or missed edge cases

### 🟢 Low Severity
- **Array length differences**: Different number of items
- **Minor structural variations**: Non-critical field differences

**Impact**: Generally safe but may indicate API evolution

## CI/CD Integration

### Weekly Checks
- Runs every Monday at 9 AM UTC
- Creates GitHub issues for critical drift
- Uploads drift reports as artifacts
- Sends notifications for status changes

### PR Validation
- Triggered when mock server or API files change
- Comments on PRs with drift status
- Prevents merging if high-severity drift detected

### Manual Triggers
- Manual workflow dispatch available
- Supports verbose logging option
- Immediate feedback for debugging

## Configuration

### Environment Variables

```bash
# API URLs
REAL_API_URL=http://localhost:3000    # Real API base URL
MOCK_API_URL=http://localhost:3001    # Mock server base URL

# Output configuration
DRIFT_REPORTS_DIR=.tmp/drift-reports  # Report storage directory

# Testing configuration  
TEST_TIMEOUT=120000                   # Request timeout (ms)
VERBOSE=true                          # Enable verbose logging
```

### Endpoint Configuration

Add new endpoints to monitor in `scripts/mock-drift-detector.js`:

```javascript
this.endpoints = [
  {
    method: 'GET',
    path: '/api/new-endpoint',
    category: 'new_category',
    testPayload: { /* optional POST data */ }
  }
];
```

## Best Practices

### Development
1. **Run drift checks before committing** mock server changes
2. **Use specific endpoint testing** during development
3. **Generate mocks from real APIs** for new endpoints
4. **Review drift reports** to understand API evolution

### Maintenance
1. **Address high-severity drift immediately** to prevent CI failures
2. **Review weekly drift reports** for trends and patterns
3. **Update test payloads** as API requirements evolve
4. **Backup mock server** before bulk synchronization

### Testing
1. **Test drift detection system** after API changes
2. **Validate mock updates** before deployment
3. **Monitor health scores** for overall system quality
4. **Use artifacts** for historical analysis

## Troubleshooting

### Common Issues

#### Drift Detector Fails to Start
```bash
# Check for port conflicts
lsof -i :3000
lsof -i :3001

# Kill conflicting processes
kill -9 <PID>
```

#### Mock Server Not Responding
```bash
# Verify mock server is running
curl http://localhost:3001/api/health/check

# Check mock server logs
npm run start:ci
```

#### Real API Connection Issues
```bash
# Test real API connectivity
curl http://localhost:3000/api/health/check

# Start Vercel dev server
npm run start:local
```

#### False Positives
- Review test payloads for dynamic values (timestamps, IDs)
- Check for environment-specific responses
- Verify request headers and authentication

### Debugging

```bash
# Enable verbose logging
VERBOSE=true npm run drift:detect

# Test specific problematic endpoint
npm run drift:generate /api/problematic/endpoint

# Check mock server configuration
node -e "console.log(require('./tests/ci-mock-server.js'))"
```

## Contributing

### Adding New Endpoints
1. Add endpoint configuration to detector
2. Add corresponding mock response
3. Test drift detection works
4. Update documentation

### Improving Detection
1. Enhance comparison algorithms
2. Add new severity classifications
3. Improve reporting format
4. Add performance optimizations

### CI/CD Enhancements
1. Add notification integrations
2. Improve artifact management
3. Add trend analysis
4. Enhance scheduling options

## Future Enhancements

- **Schema-based validation**: JSON Schema comparison
- **Dynamic mock generation**: Auto-update mocks from real responses
- **Performance benchmarking**: Response time drift tracking
- **Integration testing**: E2E test integration
- **Dashboard interface**: Web UI for drift monitoring
- **Slack/Teams integration**: Real-time notifications
- **Historical analysis**: Trend tracking and reporting