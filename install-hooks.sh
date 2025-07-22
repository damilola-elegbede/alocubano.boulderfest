#!/bin/bash
#
# Git Hooks Installation Script for A Lo Cubano Boulder Fest
# Installs pre-commit, pre-push, and post-merge hooks
#

set -e

echo "🚀 Installing Git Hooks for A Lo Cubano Boulder Fest"
echo "=================================================="

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo "❌ Error: This script must be run from the root of a git repository"
    exit 1
fi

# Check if .githooks directory exists
if [ ! -d .githooks ]; then
    echo "❌ Error: .githooks directory not found"
    echo "💡 Make sure you're in the project root and .githooks directory exists"
    exit 1
fi

# Create .git/hooks directory if it doesn't exist
mkdir -p .git/hooks

echo "📁 Installing hooks..."

# Install pre-commit hook
if [ -f .githooks/pre-commit ]; then
    cp .githooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    echo "✅ pre-commit hook installed"
else
    echo "⚠️  Warning: .githooks/pre-commit not found"
fi

# Install pre-push hook
if [ -f .githooks/pre-push ]; then
    cp .githooks/pre-push .git/hooks/pre-push
    chmod +x .git/hooks/pre-push
    echo "✅ pre-push hook installed"
else
    echo "⚠️  Warning: .githooks/pre-push not found"
fi

# Install post-merge hook
if [ -f .githooks/post-merge ]; then
    cp .githooks/post-merge .git/hooks/post-merge
    chmod +x .git/hooks/post-merge
    echo "✅ post-merge hook installed"
else
    echo "⚠️  Warning: .githooks/post-merge not found"
fi

echo ""
echo "🎉 Git hooks installation completed!"
echo ""
echo "📋 Installed hooks:"
echo "   • pre-commit:  Runs linting and unit tests before commits"
echo "   • pre-push:    Runs comprehensive test suite before pushes"
echo "   • post-merge:  Validates and cleans up after merges"
echo ""
echo "💡 Hook workflow:"
echo "   1. Before commit: lint + unit tests"
echo "   2. Before push:   lint + unit tests + link validation + security checks"
echo "   3. After merge:   validation + dependency updates + cleanup"
echo ""
echo "🔧 To bypass hooks (emergency use only):"
echo "   • git commit --no-verify"
echo "   • git push --no-verify"
echo ""
echo "🧪 Test your setup:"
echo "   • Make a small change and try committing"
echo "   • Try pushing to see the full validation suite"
echo ""
echo "✅ Setup complete! Your local development workflow is now protected."