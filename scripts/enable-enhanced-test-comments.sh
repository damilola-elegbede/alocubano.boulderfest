#!/bin/bash

# ======================================================================
# Enable Enhanced Test Status Comments
# ======================================================================
# This script enables the comprehensive PR test status comment system
# by replacing the main CI workflow and installing required dependencies.
# ======================================================================

set -e  # Exit on any error

echo "🚀 Enabling Enhanced Test Status Comments System..."
echo "========================================"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d ".github/workflows" ]; then
    echo "❌ Error: This script must be run from the project root directory"
    echo "   Make sure you're in the directory containing package.json and .github/workflows/"
    exit 1
fi

# Backup current main CI workflow
if [ -f ".github/workflows/main-ci.yml" ]; then
    echo "📁 Backing up current main CI workflow..."
    cp .github/workflows/main-ci.yml .github/workflows/main-ci-backup-$(date +%Y%m%d-%H%M%S).yml
    echo "✅ Backup created"
else
    echo "ℹ️ No existing main-ci.yml found, creating new workflow"
fi

# Replace main CI workflow with enhanced version
if [ -f ".github/workflows/main-ci-with-comments.yml" ]; then
    echo "🔄 Activating enhanced CI workflow..."
    cp .github/workflows/main-ci-with-comments.yml .github/workflows/main-ci.yml
    echo "✅ Enhanced CI workflow activated"
else
    echo "❌ Error: Enhanced CI workflow file not found"
    echo "   Expected: .github/workflows/main-ci-with-comments.yml"
    exit 1
fi

# Check if PR test status workflow exists
if [ -f ".github/workflows/pr-test-status.yml" ]; then
    echo "✅ PR test status workflow is already available"
else
    echo "❌ Error: PR test status workflow not found"
    echo "   Expected: .github/workflows/pr-test-status.yml"
    exit 1
fi

# Install required dependencies
echo "📦 Installing required dependencies..."
if command -v npm >/dev/null 2>&1; then
    # Check if glob is already installed
    if npm list glob >/dev/null 2>&1; then
        echo "✅ glob dependency already installed"
    else
        echo "📥 Installing glob dependency..."
        npm install --save-dev glob
        echo "✅ glob dependency installed"
    fi
else
    echo "⚠️ npm not found - please install glob manually:"
    echo "   npm install --save-dev glob"
fi

# Verify required files exist
echo "🔍 Verifying system components..."

REQUIRED_FILES=(
    ".github/workflows/main-ci.yml"
    ".github/workflows/pr-test-status.yml"
    ".github/actions/collect-test-results/action.yml"
    ".github/actions/post-test-comment/action.yml"
    "scripts/aggregate-test-results.js"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file (MISSING)"
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo ""
    echo "❌ Missing required files:"
    for file in "${MISSING_FILES[@]}"; do
        echo "   - $file"
    done
    echo ""
    echo "Please ensure all required files are present before enabling the system."
    exit 1
fi

# Verify GitHub token permissions
echo ""
echo "🔐 GitHub Token Permissions Required:"
echo "   - Contents: Read"
echo "   - Issues: Write" 
echo "   - Actions: Read"
echo ""
echo "Please ensure your repository has these permissions configured in:"
echo "Settings → Actions → General → Workflow permissions"

# Success message
echo ""
echo "========================================"
echo "🎉 Enhanced Test Status Comments System Enabled!"
echo "========================================"
echo ""
echo "✅ What's been activated:"
echo "   • Enhanced CI workflow with comprehensive artifact collection"
echo "   • Automatic PR comment generation and updates"
echo "   • Detailed test results, performance metrics, and failure analysis"
echo "   • Browser matrix results for E2E tests"
echo "   • Coverage reporting and flaky test detection"
echo ""
echo "📝 Next steps:"
echo "   1. Commit and push these workflow changes"
echo "   2. Create a PR to test the new comment system"
echo "   3. Verify GitHub token permissions (see above)"
echo "   4. Review the documentation in .github/README-TEST-COMMENTS.md"
echo ""
echo "🔧 Customization:"
echo "   • Modify .github/workflows/pr-test-status.yml to customize comment format"
echo "   • Adjust artifact collection in main-ci.yml for additional test types"
echo "   • Update scripts/aggregate-test-results.js for custom metrics"
echo ""
echo "📚 Documentation: .github/README-TEST-COMMENTS.md"
echo "🐛 Troubleshooting: Check workflow logs if comments don't appear"
echo ""
echo "Happy testing! 🧪✨"