# CI/CD Setup Guide

## Overview
This project uses GitHub Actions for continuous integration and deployment. All pull requests to the main branch must pass automated tests before merging.

## Branch Protection Rules

To enable branch protection on GitHub:

1. Go to Settings → Branches
2. Click "Add rule" for the `main` branch
3. Enable these settings:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - Select these required status checks:
     - `lint`
     - `build-test`
     - `security-scan`
   - ✅ Include administrators
   - ✅ Restrict who can push to matching branches

## Test Suites

### 1. Code Quality (`lint`)
- **JavaScript linting (ESLint)**: Ensures code follows style guidelines, catches common errors
- **HTML linting (HTMLHint)**: Validates HTML structure, attributes, and accessibility basics

### 2. Build Testing (`build-test`)
- **File structure validation**: Ensures all required files exist
- **Static server testing**: Verifies all pages load with HTTP 200
- **CSS loading**: Confirms stylesheets are accessible

### 3. Security Scan (`security-scan`)
- **Security headers check**: Verifies security headers in vercel.json
- **Sensitive data scan**: Checks for exposed secrets or API keys
- **Configuration validation**: Ensures JSON files are valid

## Running Tests Locally

### Quick Test
```bash
./tests/run-all-tests.sh
```

### Individual Test Suites
```bash
# Install dependencies first
npm install

# Run linting tests
npm run lint           # JavaScript and HTML linting
npm run lint:js        # JavaScript only
npm run lint:html      # HTML only
```

### Manual Testing
```bash
# Start local server
npm run serve

# Run linting
npm run lint

# Test site manually
# Visit http://localhost:8000/ (serves index.html as home page)
```

## GitHub Actions Workflow

The CI pipeline (`.github/workflows/ci.yml`) runs on:
- Every push to `main` or `develop`
- Every pull request to `main`

### Workflow Jobs

1. **lint**: JavaScript and HTML linting
2. **build-test**: Site functionality and file structure verification
3. **security-scan**: Security and configuration validation
4. **deploy-preview**: Creates Vercel preview (PRs only)

## Vercel Integration

### Setup Required
1. Create Vercel account and project
2. Add GitHub secrets:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`

### Getting Vercel Credentials
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Get credentials
vercel project ls
```

## Pre-commit Hooks (Optional)

To run tests before every commit:

```bash
# Install husky
npm install --save-dev husky

# Enable Git hooks
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run pre-commit"
```

## Troubleshooting

### Tests Failing Locally
1. Ensure Python 3 is installed
2. Check if port 8000 is available
3. Install all npm dependencies
4. Clear npm cache: `npm cache clean --force`

### CI Pipeline Issues
1. Check GitHub Actions logs
2. Verify all secrets are set
3. Ensure branch protection is configured
4. Check file permissions (especially for .sh files)

### Common Fixes
- **HTML validation errors**: Check for unclosed tags or invalid attributes
- **Accessibility failures**: Add missing alt text or ARIA labels
- **Performance issues**: Optimize images, minimize CSS/JS
- **Link errors**: Update broken links or add error handling
- **Linting errors**: Run `npm run lint -- --fix` for auto-fixes

## Best Practices

1. **Always run tests locally** before pushing
2. **Fix linting errors** immediately
3. **Keep tests updated** when adding features
4. **Monitor test performance** - slow tests slow down development
5. **Document test failures** in pull requests

## Adding New Tests

1. Create test file in `/tests` directory
2. Follow naming convention: `feature-name.test.js`
3. Update `package.json` scripts if needed
4. Add to CI workflow if new test category

## Monitoring

- Check GitHub Actions tab for build status
- Enable notifications for failed builds
- Review test coverage reports
- Monitor Vercel deployment status

## Support

For CI/CD issues:
1. Check this documentation
2. Review GitHub Actions logs
3. Consult test output
4. Check project Discord/Slack channel