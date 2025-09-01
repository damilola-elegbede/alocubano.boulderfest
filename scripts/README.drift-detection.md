# Mock Drift Detection System

## Quick Start

```bash
# Run full drift detection
npm run drift:detect

# Quick development check
npm run drift:quick

# List monitored endpoints
npm run drift:list

# Test system functionality
npm run drift:test
```

## System Components

### 1. Core Detector (`scripts/mock-drift-detector.js`)
Production-ready drift detection engine that compares mock server responses with real API responses.

**Features:**
- Automated server management (starts/stops mock and real servers)
- Comprehensive response comparison (structure, status, content)
- Detailed drift reports with severity classification
- CI/CD integration ready

### 2. Development Helper (`scripts/drift-helper.js`)
Developer utilities for working with mock drift during development.

**Features:**
- Quick drift checks for specific endpoints
- Mock response generation from real APIs
- Bulk synchronization capabilities
- Selective endpoint testing

### 3. GitHub Actions Workflow (`.github/workflows/drift-detection.yml`)
Automated CI/CD integration for drift monitoring.

**Features:**
- Weekly scheduled drift checks
- PR validation for mock changes
- Automatic issue creation for critical drift
- Artifact storage and notifications

### 4. Test Suite (`scripts/test-drift-detection.js`)
Comprehensive validation of the drift detection system itself.

**Features:**
- System functionality validation
- Error handling verification
- Report generation testing
- Structure comparison validation

## Available Commands

### Detection Commands
```bash
npm run drift:detect           # Full drift detection with report
npm run drift:detect:verbose   # With detailed logging
npm run drift:detect:weekly    # CI-optimized weekly check
```

### Development Commands
```bash
npm run drift:quick            # Fast development check
npm run drift:list             # List all monitored endpoints
npm run drift:specific health  # Check specific category
npm run drift:generate /api/... # Generate mock from real API
npm run drift:sync             # Sync all mocks (dangerous!)
```

### Validation Commands
```bash
npm run drift:test             # Test system functionality
```

## Monitored Endpoints (12 total)

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Health** | 2 | Application and database health checks |
| **Email** | 1 | Newsletter subscription |
| **Payments** | 1 | Stripe checkout session creation |
| **Tickets** | 2 | QR validation and ticket registration |
| **Registration** | 3 | Registration system and batch operations |
| **Gallery** | 2 | Photo/video listing and featured content |
| **Admin** | 1 | Admin authentication and dashboard |

## Severity Levels

- **🔴 High**: Status mismatches, type differences, missing required fields → Can cause test failures
- **🟡 Medium**: Value differences, extra mock fields → May lead to false test results  
- **🟢 Low**: Array length differences, minor variations → Generally safe

## Reports & Artifacts

- **Local Reports**: `.tmp/drift-reports/drift-report-[timestamp].json`
- **CI Artifacts**: Available in GitHub Actions for 30 days
- **Health Score**: 0-100 based on drift severity and frequency
- **Recommendations**: Actionable guidance for fixing detected drift

## CI/CD Integration

### Weekly Monitoring
- Runs every Monday at 9 AM UTC
- Creates GitHub issues for critical drift (high severity)
- Uploads comprehensive reports as artifacts

### PR Validation  
- Triggered when mock server or API files change
- Comments on PRs with drift detection results
- Helps prevent introduction of drift

### Manual Execution
- Available via GitHub Actions manual dispatch
- Supports verbose logging for debugging

## Best Practices

### During Development
1. Run `npm run drift:quick` before committing mock changes
2. Use `npm run drift:specific <category>` for targeted testing
3. Generate new mocks with `npm run drift:generate <endpoint>`

### For Maintenance
1. Address high-severity drift immediately
2. Review weekly drift reports for API evolution patterns
3. Keep mock test payloads updated as APIs change

### For CI/CD
1. Monitor GitHub Actions for drift detection failures
2. Review and close drift-related issues promptly
3. Use drift reports to understand API stability trends

## Troubleshooting

### Common Issues
- **Port conflicts**: Check if ports 3000/3001 are in use
- **Server startup failures**: Verify Vercel dev can start normally
- **False positives**: Review dynamic values in responses (timestamps, IDs)

### Debugging
```bash
VERBOSE=true npm run drift:detect     # Enable detailed logging
npm run drift:test                    # Validate system functionality
npm run drift:generate /api/endpoint  # Check specific endpoint manually
```

## Architecture

```
Mock Server (3001) ←→ Drift Detector ←→ Real API (3000)
                            ↓
                     Drift Report
                       ↓     ↓
              GitHub Actions  Developer
```

The system automatically manages both servers, compares their responses, and generates actionable reports for maintaining test accuracy.

## Future Enhancements

- Schema-based validation using JSON schemas
- Performance benchmarking and drift tracking
- Integration with E2E test results
- Real-time notification integrations
- Historical trend analysis and dashboards

---

**Documentation**: See [docs/MOCK_DRIFT_DETECTION.md](../docs/MOCK_DRIFT_DETECTION.md) for comprehensive details.