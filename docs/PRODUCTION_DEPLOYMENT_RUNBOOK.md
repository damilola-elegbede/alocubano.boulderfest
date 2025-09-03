# Production Deployment Runbook - Phase 3

**A Lo Cubano Boulder Fest** - Complete production deployment procedures with three-layer test architecture safeguards.

## Deployment Overview

### Deployment Types

| Type | Trigger | Duration | Safeguards | Rollback |
|------|---------|----------|------------|----------|
| **Automatic** | Push to `main` | 5-10 min | Full gates | Automatic |
| **Manual** | Workflow dispatch | 5-15 min | Configurable | Manual |
| **Emergency** | Force deployment | 3-8 min | Minimal | Manual |
| **Rollback** | Previous commit | 2-5 min | Health checks | N/A |

### Pre-Deployment Checklist

- [ ] All unit tests passing (806+ tests in <2s)
- [ ] Performance gates satisfied
- [ ] Security audit clean
- [ ] Build verification successful
- [ ] Integration tests ready (if enabled)
- [ ] Preview deployment validated (for PRs)

## Standard Deployment Process

### 1. Pre-Deployment Validation

```bash
# Verify local environment
npm test                    # Unit tests must pass
npm run lint               # Code quality check
npm run build              # Build verification

# Check deployment readiness
npm run deploy:check       # Pre-deployment validation
```

#### Automated Validation
- **Environment Configuration**: CI setup verified
- **Test File Structure**: Layer architecture validated
- **Dependencies**: All required packages available
- **Database**: Migrations ready and tested

### 2. Deployment Gate Execution

#### Critical Gates (MANDATORY - Cannot be bypassed)

##### Unit Test Gate
```yaml
Requirements:
  - All 806+ unit tests must pass (zero tolerance)
  - Execution time < 2000ms (performance gate)
  - Pass rate ≥ 94%
  - Coverage ≥ 75%

Failure Action: BLOCK DEPLOYMENT
Bypass: Not allowed
```

##### Performance Gate
```yaml
Requirements:
  - Unit test execution < 2 seconds
  - No performance degradation > 20%
  - Memory usage within limits

Failure Action: BLOCK DEPLOYMENT  
Bypass: Emergency only (requires justification)
```

##### Environment Validation Gate
```yaml
Requirements:
  - CI environment properly configured
  - Test layers correctly set up
  - Required environment variables present

Failure Action: BLOCK DEPLOYMENT
Bypass: Not allowed
```

#### Quality Gates (WARNING - Can be bypassed)

##### Security Gate
```yaml
Requirements:
  - Zero high-severity vulnerabilities
  - Security audit passes
  - No exposed secrets

Failure Action: WARNING
Bypass: With justification
```

##### Code Quality Gate
```yaml
Requirements:
  - ESLint passes without errors
  - HTML validation successful
  - Code formatting consistent

Failure Action: WARNING
Bypass: With justification  
```

##### Build Gate
```yaml
Requirements:
  - Production build successful
  - All assets generated correctly
  - No build-time errors

Failure Action: WARNING
Bypass: Degraded mode allowed
```

### 3. Deployment Execution

#### Automatic Deployment (Standard)
```bash
# Triggered by push to main
git push origin main

# Monitor deployment
gh workflow view main-ci-phase3.yml --web
```

#### Manual Deployment (Controlled)
```bash
# Via GitHub Actions workflow_dispatch
gh workflow run main-ci-phase3.yml
```

#### Emergency Deployment (Force)
```bash
# Use with extreme caution
gh workflow run production-deployment-safeguards.yml \
  --field force_deployment=true \
  --field skip_performance_gate=false  # Only in extreme emergencies
```

### 4. Post-Deployment Verification

```bash
# Verify deployment health
curl -f https://alocubano-boulderfest.vercel.app/api/health/check

# Check critical endpoints
curl -f https://alocubano-boulderfest.vercel.app/api/tickets/health
curl -f https://alocubano-boulderfest.vercel.app/api/registration/health

# Monitor application metrics
# (Check Vercel dashboard for performance and error rates)
```

## Emergency Procedures

### Emergency Deployment

**Use Case**: Critical security fixes, production incidents

#### Prerequisites
1. **Incident Documentation**: Clear justification required
2. **Risk Assessment**: Impact analysis completed
3. **Rollback Plan**: Previous working version identified
4. **Team Notification**: Stakeholders informed

#### Execution
```bash
# Emergency deployment with bypass
gh workflow run production-deployment-safeguards.yml \
  --field force_deployment=true \
  --field skip_performance_gate=true  # ONLY if absolutely necessary
```

#### Emergency Gate Overrides
- **Performance Gate**: Can be bypassed in extreme emergencies
- **Security Gate**: Can be bypassed with documented justification
- **Build Gate**: Can use degraded mode
- **Unit Test Gate**: **NEVER BYPASSED** - Critical for stability

### Rollback Procedures

#### Automatic Rollback
- Triggered by health check failures
- Reverts to previous known-good deployment
- Maintains data integrity

#### Manual Rollback
```bash
# Identify last working commit
git log --oneline -10

# Deploy previous version
git revert <commit-hash>
git push origin main

# Or direct commit rollback
git reset --hard <previous-commit>
git push --force origin main  # Use with extreme caution
```

#### Database Rollback Considerations
- **Migration Rollbacks**: Use migration down scripts
- **Data Backup**: Ensure data backup before deployment
- **Consistency Checks**: Verify database state after rollback

## Monitoring & Alerting

### Deployment Monitoring

#### Real-Time Monitoring
```bash
# Monitor deployment progress
gh run list --workflow=main-ci-phase3.yml --limit=1

# Watch deployment logs
gh run watch <run-id>

# Check deployment status
gh run view <run-id>
```

#### Health Monitoring
- **Application Health**: `/api/health/check`
- **Database Health**: `/api/health/database`  
- **Performance Metrics**: Vercel Analytics
- **Error Rates**: Application logs

### Alert Conditions

#### Critical Alerts (Immediate Action)
- Deployment failure with blocking gates
- Application health check failures
- Database connection issues
- Error rate > 5% for 5 minutes

#### Warning Alerts (Monitor)
- Performance degradation > 20%
- Quality gate warnings
- Integration test failures
- Memory usage alerts

### Alert Response

#### Critical Alert Response
1. **Immediate Assessment**: Check application status
2. **Rollback Decision**: If stability threatened
3. **Incident Communication**: Notify stakeholders
4. **Root Cause Analysis**: Investigate and document

#### Warning Alert Response
1. **Monitor Trends**: Track metrics over time
2. **Schedule Investigation**: Plan detailed analysis
3. **Preventive Measures**: Address underlying issues
4. **Documentation**: Update runbook if needed

## Troubleshooting Guide

### Common Deployment Issues

#### Unit Test Failures
**Symptoms**: Tests pass locally but fail in CI
**Diagnosis**:
```bash
# Check test environment differences
npm test 2>&1 | grep -i "error\|fail"

# Verify memory allocation
NODE_OPTIONS="--max-old-space-size=6144" npm test

# Check database setup
ls -la data/
```
**Resolution**:
- Verify environment variables
- Check database initialization
- Review memory allocation
- Validate test dependencies

#### Performance Gate Failures  
**Symptoms**: Tests take >2 seconds to execute
**Diagnosis**:
```bash
# Analyze test performance
npm run test:phase2:performance

# Check memory usage
NODE_OPTIONS="--max-old-space-size=6144 --inspect" npm test
```
**Resolution**:
- Increase memory allocation
- Optimize slow tests
- Check for memory leaks
- Review test parallelization

#### Build Failures
**Symptoms**: Build process errors
**Diagnosis**:
```bash
# Local build test
npm run build

# Check build logs
npm run build 2>&1 | tee build.log
```
**Resolution**:
- Fix syntax errors
- Resolve dependency issues
- Update build configuration
- Check asset paths

#### Security Gate Failures
**Symptoms**: High-severity vulnerabilities detected
**Diagnosis**:
```bash
# Detailed security audit
npm audit --audit-level=high

# Check specific vulnerabilities
npm audit --json | jq '.vulnerabilities'
```
**Resolution**:
- Update vulnerable dependencies
- Apply security patches
- Consider dependency alternatives
- Document accepted risks (if justified)

### Recovery Procedures

#### Failed Deployment Recovery
1. **Stop Current Deployment**: Cancel in-progress runs
2. **Assess Damage**: Check application status
3. **Immediate Rollback**: If application affected
4. **Root Cause Analysis**: Investigate failure
5. **Fix and Redeploy**: Address issues and retry

#### Database Recovery
1. **Check Database Status**: Verify connectivity and integrity
2. **Migration Recovery**: Rollback problematic migrations
3. **Data Restoration**: Restore from backup if necessary
4. **Consistency Validation**: Verify data integrity

#### Performance Recovery
1. **Identify Bottleneck**: Locate performance issue
2. **Resource Scaling**: Increase memory/CPU if needed
3. **Code Optimization**: Fix performance regressions
4. **Monitoring**: Continuous performance tracking

## Configuration Management

### Environment Variables

#### Required for Deployment
```bash
# Production essentials
TURSO_DATABASE_URL=         # Production database
TURSO_AUTH_TOKEN=          # Database authentication
ADMIN_SECRET=              # Admin panel security
STRIPE_SECRET_KEY=         # Payment processing
BREVO_API_KEY=            # Email services
```

#### CI/CD Configuration
```bash
# GitHub Actions
GITHUB_TOKEN=              # Repository access
NODE_VERSION=20            # Node.js version
CI=true                   # CI environment flag

# Test configuration  
UNIT_TEST_MEMORY=6144      # Memory allocation for unit tests
INTEGRATION_TEST_MEMORY=4096  # Memory allocation for integration tests
E2E_TEST_MEMORY=3072       # Memory allocation for E2E tests
```

### Deployment Configuration Files

#### Workflow Configuration
- `.github/workflows/main-ci-phase3.yml` - Main CI/CD pipeline
- `.github/workflows/production-deployment-safeguards.yml` - Production gates
- `.github/workflows/test-monitoring-observability.yml` - Monitoring

#### Environment Configuration
- `.github/environment-config-phase3.yml` - Environment-specific settings
- `.env.local` - Local development variables
- `vercel.json` - Vercel deployment configuration

### Version Management

#### Release Tagging
```bash
# Create release tag
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0

# List releases
git tag -l
```

#### Branch Management
- `main` - Production branch (protected)
- `develop` - Development branch
- `feature/*` - Feature branches
- `hotfix/*` - Emergency fixes

## Security Considerations

### Deployment Security

#### Access Control
- **GitHub Repository**: Protected branches enabled
- **Deployment Secrets**: Stored in GitHub Secrets
- **Environment Variables**: Never exposed in logs
- **API Keys**: Rotated regularly

#### Security Gates
- **Vulnerability Scanning**: Automated security audits
- **Dependency Monitoring**: Regular dependency updates  
- **Secret Detection**: Scan for exposed credentials
- **Access Logging**: All deployment actions logged

### Production Security

#### Runtime Security
- **HTTPS Enforcement**: All traffic encrypted
- **API Security**: Rate limiting and authentication
- **Data Protection**: Sensitive data encrypted
- **Access Control**: Role-based permissions

#### Monitoring Security
- **Intrusion Detection**: Monitor for suspicious activity
- **Audit Logging**: Comprehensive access logs
- **Incident Response**: Security incident procedures
- **Regular Reviews**: Security posture assessments

## Performance Optimization

### Deployment Performance

#### Build Optimization
- **Dependency Caching**: NPM cache optimization
- **Parallel Execution**: Independent job parallelization  
- **Resource Allocation**: Appropriate memory limits
- **Timeout Management**: Realistic but strict timeouts

#### Test Performance
- **Unit Test Speed**: Target <2 seconds for 806+ tests
- **Integration Efficiency**: Optimized database operations
- **E2E Optimization**: Smart browser resource management
- **Memory Management**: Layer-specific allocation

### Application Performance

#### Production Monitoring
- **Response Times**: API endpoint monitoring
- **Error Rates**: Application error tracking
- **Resource Usage**: Memory and CPU monitoring
- **User Experience**: Performance metrics tracking

#### Performance Alerts
- **Degradation Detection**: Automated performance monitoring
- **Threshold Alerts**: Configurable performance thresholds
- **Trend Analysis**: Performance trend tracking
- **Optimization Recommendations**: Automated suggestions

## Compliance & Documentation

### Audit Requirements

#### Deployment Audit Trail
- All deployment actions logged
- Change approvals documented  
- Gate decisions recorded
- Failure analysis documented

#### Security Compliance
- Vulnerability assessments completed
- Security gate decisions justified
- Access control verified
- Incident response documented

### Documentation Updates

#### Post-Deployment Tasks
1. **Update Documentation**: Reflect any configuration changes
2. **Record Lessons Learned**: Document issues and resolutions
3. **Update Monitoring**: Adjust alerts and thresholds as needed
4. **Team Communication**: Share deployment results and insights

---

**Deployment Status Dashboard**: Monitor all deployments and health metrics through the GitHub Actions interface and Vercel dashboard.

**Emergency Contact**: Maintain emergency contact procedures for critical production issues.