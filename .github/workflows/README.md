# GitHub Actions Workflows

This directory contains all GitHub Actions workflows for the A Lo Cubano Boulder Fest project. The workflows are designed to support a **unit-test-only** architecture following the project's streamlined testing strategy.

## Workflow Overview

### Core Workflows

#### 1. **CI Pipeline** (`ci-pipeline.yml`)
**Purpose**: Main continuous integration pipeline that orchestrates all quality checks and tests.
- **Triggers**: Push to any branch, pull requests, daily schedule
- **Jobs**:
  - Environment setup and configuration
  - Code quality checks (linting, structure validation)
  - Unit tests across multiple Node.js versions
  - Build verification
  - Integration readiness checks
  - Summary report generation
- **Key Features**: Parallel execution, comprehensive reporting, PR comments

#### 2. **Unit Tests** (`unit-tests.yml`)
**Purpose**: Dedicated workflow for running the streamlined unit test suite.
- **Triggers**: Push, pull requests, manual dispatch
- **Test Suite**: 26 essential unit tests covering critical functionality
- **Matrix Testing**: Runs on Node.js 18.x and 20.x
- **Features**: Fast execution (<5 minutes), coverage reports, PR status updates

#### 3. **Quality Gates** (`quality-gates.yml`)
**Purpose**: Enforces code quality standards across the codebase.
- **Checks**:
  - ESLint for JavaScript
  - HTMLHint for HTML files
  - Markdown quality validation
  - Project structure verification
  - Security vulnerability scanning
  - API contract validation
- **Artifacts**: Linting results and quality reports

#### 4. **Pull Request Validation** (`pr-validation.yml`)
**Purpose**: Comprehensive validation for all pull requests.
- **Triggers**: PR opened, synchronized, reopened, ready for review
- **Validations**:
  - Commit message format (conventional commits)
  - File size checks
  - Database migrations
  - All quality checks
  - Unit test execution
  - Merge conflict detection
- **Features**: Automated PR comments with detailed reports

### Deployment Workflows

#### 5. **Deploy to Production** (`deploy-production.yml`)
**Purpose**: Handles deployment to Vercel (production and staging).
- **Triggers**: Push to main branch, manual dispatch
- **Stages**:
  - Pre-deployment validation
  - Vercel deployment
  - Post-deployment verification
  - Deployment notifications
- **Environments**: Production (default) or staging (manual selection)

### Maintenance Workflows

#### 6. **Dependency Management** (`dependency-management.yml`)
**Purpose**: Automated dependency updates and security monitoring.
- **Triggers**: Weekly schedule (Mondays), PR with package changes
- **Features**:
  - Security vulnerability scanning
  - License compliance checking
  - Automated dependency updates (patch/minor)
  - Automatic PR creation for updates
  - Issue creation for critical vulnerabilities

## Workflow Status

All workflows are currently **ENABLED** and follow the project's unit-test-only architecture:
- ✅ Unit tests are fully operational (26 tests)
- ❌ Integration tests are disabled
- ❌ E2E tests are disabled

## Configuration

### Required Secrets

The following secrets must be configured in the repository settings:

```yaml
# Vercel Deployment
VERCEL_TOKEN        # Vercel authentication token
VERCEL_ORG_ID      # Vercel organization ID
VERCEL_PROJECT_ID  # Vercel project ID

# GitHub (usually automatic)
GITHUB_TOKEN       # Automatically provided by GitHub Actions
```

### Environment Variables

Key environment variables used in workflows:

```yaml
NODE_ENV: test                    # Test environment
NODE_OPTIONS: --max-old-space-size=4096  # Memory allocation for tests
```

## Workflow Triggers

| Workflow | Push | PR | Schedule | Manual |
|----------|------|-----|----------|--------|
| CI Pipeline | ✅ | ✅ | Daily | ✅ |
| Unit Tests | ✅ | ✅ | - | ✅ |
| Quality Gates | ✅ | ✅ | - | ✅ |
| PR Validation | - | ✅ | - | - |
| Deploy Production | main only | - | - | ✅ |
| Dependency Management | - | package.json | Weekly | ✅ |

## Concurrency Control

All workflows implement concurrency control to prevent resource conflicts:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true  # For CI workflows
  cancel-in-progress: false # For deployment workflows
```

## Best Practices

1. **Fast Feedback**: Unit tests complete in <5 minutes
2. **Comprehensive Coverage**: Quality gates run on all code changes
3. **Automated Reporting**: PR comments provide immediate feedback
4. **Resource Management**: Proper cleanup and artifact management
5. **Security First**: Regular vulnerability scanning and updates

## Naming Convention

Workflows follow a clear, consistent naming pattern:

- **Action-based**: `deploy-production.yml`, `pr-validation.yml`
- **Domain-based**: `unit-tests.yml`, `quality-gates.yml`
- **Pipeline-based**: `ci-pipeline.yml`
- **Function-based**: `dependency-management.yml`

## Troubleshooting

### Common Issues

1. **Test Failures**
   - Check Node.js version compatibility
   - Verify database migrations have run
   - Review test output in workflow logs

2. **Deployment Issues**
   - Verify Vercel secrets are configured
   - Check build output for errors
   - Ensure vercel.json is properly configured

3. **Quality Gate Failures**
   - Run `npm run lint:js` locally
   - Run `npm run lint:html` locally
   - Fix issues before pushing

## Maintenance

### Adding New Workflows

When adding new workflows:
1. Follow the existing naming convention
2. Include proper concurrency control
3. Add comprehensive job documentation
4. Update this README

### Disabling Workflows

To temporarily disable a workflow, add:
```yaml
if: false  # Temporarily disabled
```

## Performance Metrics

Target performance for workflows:

- **Unit Tests**: <5 minutes
- **Quality Gates**: <2 minutes
- **PR Validation**: <10 minutes
- **CI Pipeline**: <15 minutes
- **Deployment**: <10 minutes

## Future Considerations

Currently disabled but may be re-enabled:
- Integration testing workflows
- E2E testing with Playwright
- Performance benchmarking
- Cross-browser testing

To re-enable these features, update the respective test scripts in `package.json` and create corresponding workflow files.

---

Last updated: November 2024
Architecture: Unit-test-only (streamlined)
Total workflows: 6 (all enabled)