#!/bin/bash

# Quality Gates Test Runner
# 
# Convenience script to run all quality gates validation tests
# 
# Usage:
#   ./scripts/run-quality-gates-tests.sh [--comprehensive] [--verbose]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPREHENSIVE=false
VERBOSE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --comprehensive|-c)
      COMPREHENSIVE=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Run quality gates validation tests"
      echo ""
      echo "Options:"
      echo "  --comprehensive, -c  Run comprehensive test suite (takes longer)"
      echo "  --verbose, -v        Show detailed output"
      echo "  --help, -h           Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo "🚦 Quality Gates Test Runner"
echo "============================"
echo ""

cd "$PROJECT_ROOT"

if [ "$COMPREHENSIVE" = true ]; then
  echo "🔍 Running Comprehensive Test Suite..."
  echo ""
  
  if [ "$VERBOSE" = true ]; then
    node "$SCRIPT_DIR/test-quality-gates.js" --verbose --mode=all
  else
    node "$SCRIPT_DIR/test-quality-gates.js" --mode=all
  fi
  
  echo ""
  echo "📋 Running Validation Script..."
  echo ""
  
  if [ "$VERBOSE" = true ]; then
    bash "$SCRIPT_DIR/validate-quality-gates.sh" --verbose
  else
    bash "$SCRIPT_DIR/validate-quality-gates.sh"
  fi
else
  echo "⚡ Running Quick Validation..."
  echo ""
  
  if [ "$VERBOSE" = true ]; then
    bash "$SCRIPT_DIR/validate-quality-gates.sh" --verbose
  else
    bash "$SCRIPT_DIR/validate-quality-gates.sh"
  fi
fi

echo ""
echo "✅ Quality Gates Testing Complete!"
echo ""
echo "Next steps:"
echo "  • Review generated reports in .tmp/quality-gates/"
echo "  • Run 'npm run quality:gates' to use in development"
echo "  • Check CI/CD integration with 'npm run quality:gates:ci'"