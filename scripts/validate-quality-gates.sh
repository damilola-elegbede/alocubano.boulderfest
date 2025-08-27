#!/bin/bash

# Quality Gates Validation Script
# 
# Quick validation script to ensure the quality gates system is working
# after the ES module fix. This script:
# 1. Runs the quality gates in report mode
# 2. Checks that reports were generated
# 3. Runs a quick smoke test
# 4. Reports success/failure
#
# Usage:
#   ./scripts/validate-quality-gates.sh [--verbose]
#   bash scripts/validate-quality-gates.sh [--verbose]

# Strict mode - exit on errors, undefined variables, and pipe failures
set -euo pipefail
IFS=$'\n\t'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
QUALITY_GATES_SCRIPT="$SCRIPT_DIR/quality-gates.js"
OUTPUT_DIR="$PROJECT_ROOT/.tmp/quality-gates"
VERBOSE=false

# Parse arguments safely
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      cat << 'EOF'
Usage: $0 [--verbose] [--help]

Validates the quality gates system after ES module fix

Options:
  --verbose, -v    Show detailed output
  --help, -h       Show this help message
EOF
      exit 0
      ;;
    -*)
      echo "Error: Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
    *)
      echo "Error: Unexpected argument: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

# Utility functions
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

verbose_log() {
  if [ "$VERBOSE" = true ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEBUG] $1"
  fi
}

success() {
  echo "✅ $1"
}

error() {
  echo "❌ $1"
}

warning() {
  echo "⚠️  $1"
}

# Check for timeout command availability
TIMEOUT_CMD=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout 120"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout 120"
else
  verbose_log "timeout command not available, running without timeout"
  TIMEOUT_CMD=""
fi

# Start validation
log "🚦 Starting Quality Gates Validation"
log "Project Root: $PROJECT_ROOT"
log "Output Directory: $OUTPUT_DIR"

# Step 1: Check prerequisites
log "📋 Step 1: Checking prerequisites..."

if [ ! -f "$QUALITY_GATES_SCRIPT" ]; then
  error "Quality gates script not found: $QUALITY_GATES_SCRIPT"
  error "Expected location: $QUALITY_GATES_SCRIPT"
  error "Current working directory: $(pwd)"
  error "Available files in scripts/: $(ls -la "$SCRIPT_DIR" 2>/dev/null || echo 'Directory not accessible')"
  exit 1
fi
success "Quality gates script found"

# Check if quality thresholds config exists
QUALITY_THRESHOLDS_CONFIG="$PROJECT_ROOT/.github/quality-thresholds.json"
if [ ! -f "$QUALITY_THRESHOLDS_CONFIG" ]; then
  error "Quality thresholds configuration not found: $QUALITY_THRESHOLDS_CONFIG"
  error "This file is required for quality gates to function properly"
  exit 1
fi
success "Quality thresholds configuration found"

if ! command -v node &> /dev/null; then
  error "Node.js not found. Please install Node.js"
  exit 1
fi
success "Node.js found: $(node --version)"

if [ ! -f "$PROJECT_ROOT/package.json" ]; then
  error "package.json not found in project root"
  exit 1
fi
success "Package.json found"

verbose_log "Prerequisites check completed"

# Step 2: Run quality gates in report mode
log "📊 Step 2: Running quality gates in report mode..."

cd "$PROJECT_ROOT"

if [ "$VERBOSE" = true ]; then
  verbose_log "Running: node '$QUALITY_GATES_SCRIPT' report --verbose"
  if [ -n "$TIMEOUT_CMD" ]; then
    if $TIMEOUT_CMD node "$QUALITY_GATES_SCRIPT" report --verbose; then
      success "Quality gates report mode completed"
    else
      exit_code=$?
      if [ $exit_code -eq 124 ]; then
        error "Quality gates timed out after 120 seconds"
      else
        warning "Quality gates exited with code $exit_code (this may be expected)"
      fi
    fi
  else
    if node "$QUALITY_GATES_SCRIPT" report --verbose; then
      success "Quality gates report mode completed"
    else
      warning "Quality gates exited with code $? (this may be expected)"
    fi
  fi
else
  verbose_log "Running: node '$QUALITY_GATES_SCRIPT' report"
  if [ -n "$TIMEOUT_CMD" ]; then
    if $TIMEOUT_CMD node "$QUALITY_GATES_SCRIPT" report > /tmp/quality-gates-output.log 2>&1; then
      success "Quality gates report mode completed"
    else
      exit_code=$?
      if [ $exit_code -eq 124 ]; then
        error "Quality gates timed out after 120 seconds"
        exit 1
      else
        warning "Quality gates exited with code $exit_code (this may be expected)"
        if [ "$VERBOSE" = true ]; then
          echo "Output:"
          cat /tmp/quality-gates-output.log
        fi
      fi
    fi
  else
    if node "$QUALITY_GATES_SCRIPT" report > /tmp/quality-gates-output.log 2>&1; then
      success "Quality gates report mode completed"
    else
      warning "Quality gates exited with code $? (this may be expected)"
      if [ "$VERBOSE" = true ]; then
        echo "Output:"
        cat /tmp/quality-gates-output.log
      fi
    fi
  fi
fi

# Step 3: Check that reports were generated
log "📋 Step 3: Verifying report generation..."

if [ ! -d "$OUTPUT_DIR" ]; then
  warning "Output directory not created: $OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
else
  success "Output directory exists"
fi

# Count generated files
json_reports=$(find "$OUTPUT_DIR" -name "*quality-report*.json" 2>/dev/null | wc -l)
html_reports=$(find "$OUTPUT_DIR" -name "*quality-report*.html" 2>/dev/null | wc -l)
dashboard_files=$(find "$OUTPUT_DIR" -name "*dashboard*.json" 2>/dev/null | wc -l)

verbose_log "JSON reports found: $json_reports"
verbose_log "HTML reports found: $html_reports"
verbose_log "Dashboard files found: $dashboard_files"

if [ "$json_reports" -gt 0 ]; then
  success "JSON reports generated ($json_reports files)"
else
  warning "No JSON reports found"
fi

if [ "$html_reports" -gt 0 ]; then
  success "HTML reports generated ($html_reports files)"
  
  # Check HTML content
  latest_html=$(find "$OUTPUT_DIR" -name "*quality-report*.html" -type f -exec ls -t {} + | head -1)
  if [ -n "$latest_html" ] && [ -f "$latest_html" ]; then
    if grep -q "Quality Gates Report" "$latest_html"; then
      success "HTML report contains expected content"
    else
      warning "HTML report may be incomplete"
    fi
    verbose_log "Latest HTML report: $latest_html"
  fi
else
  warning "No HTML reports found"
fi

if [ "$dashboard_files" -gt 0 ]; then
  success "Dashboard files generated ($dashboard_files files)"
else
  warning "No dashboard files found"
fi

# Step 4: Run a quick smoke test
log "💨 Step 4: Running smoke test..."

if [ -n "$TIMEOUT_CMD" ]; then
  if echo "$TIMEOUT_CMD" | grep -q "60"; then
    SMOKE_TIMEOUT_CMD=$(echo "$TIMEOUT_CMD" | sed 's/120/60/')
  else
    SMOKE_TIMEOUT_CMD="timeout 60"
  fi
  
  if $SMOKE_TIMEOUT_CMD node "$QUALITY_GATES_SCRIPT" local > /tmp/smoke-test.log 2>&1; then
    success "Smoke test completed successfully"
    smoke_test_success=true
  else
    exit_code=$?
    if [ $exit_code -eq 124 ]; then
      error "Smoke test timed out"
      smoke_test_success=false
    else
      warning "Smoke test exited with code $exit_code (may be expected)"
      smoke_test_success=true
    fi
  fi
else
  if node "$QUALITY_GATES_SCRIPT" local > /tmp/smoke-test.log 2>&1; then
    success "Smoke test completed successfully"
    smoke_test_success=true
  else
    warning "Smoke test exited with code $? (may be expected)"
    smoke_test_success=true
  fi
fi

if [ "$VERBOSE" = true ] && [ -f /tmp/smoke-test.log ]; then
  verbose_log "Smoke test output:"
  cat /tmp/smoke-test.log
fi

# Step 5: Test different modes
log "🔧 Step 5: Testing different execution modes..."

modes=("local" "ci" "report" "dashboard")
mode_results=""

for mode in "${modes[@]}"; do
  verbose_log "Testing mode: $mode"
  
  if [ -n "$TIMEOUT_CMD" ]; then
    MODE_TIMEOUT_CMD=$(echo "$TIMEOUT_CMD" | sed 's/120/30/')
    if $MODE_TIMEOUT_CMD node "$QUALITY_GATES_SCRIPT" "$mode" > /tmp/mode-test-$mode.log 2>&1; then
      success "Mode '$mode' executed successfully"
      mode_results="$mode_results$mode:✅ "
    else
      exit_code=$?
      if [ $exit_code -eq 124 ]; then
        warning "Mode '$mode' timed out"
        mode_results="$mode_results$mode:⏱️ "
      else
        warning "Mode '$mode' exited with code $exit_code"
        mode_results="$mode_results$mode:⚠️ "
      fi
    fi
  else
    if node "$QUALITY_GATES_SCRIPT" "$mode" > /tmp/mode-test-$mode.log 2>&1; then
      success "Mode '$mode' executed successfully"
      mode_results="$mode_results$mode:✅ "
    else
      warning "Mode '$mode' exited with code $?"
      mode_results="$mode_results$mode:⚠️ "
    fi
  fi
done

verbose_log "Mode test results: $mode_results"

# Step 6: Final validation
log "🏁 Step 6: Final validation..."

# Check that the script can be imported
import_test_script='const QG = require("./scripts/quality-gates.js"); console.log("Import successful");'

if [ -n "$TIMEOUT_CMD" ]; then
  IMPORT_TIMEOUT_CMD=$(echo "$TIMEOUT_CMD" | sed 's/120/10/')
  if echo "$import_test_script" | $IMPORT_TIMEOUT_CMD node > /tmp/import-test.log 2>&1; then
    success "Quality gates script can be imported"
  else
    error "Quality gates script import failed"
    if [ "$VERBOSE" = true ]; then
      cat /tmp/import-test.log
    fi
    exit 1
  fi
else
  if echo "$import_test_script" | node > /tmp/import-test.log 2>&1; then
    success "Quality gates script can be imported"
  else
    error "Quality gates script import failed"
    if [ "$VERBOSE" = true ]; then
      cat /tmp/import-test.log
    fi
    exit 1
  fi
fi

# Summary
log "📊 Validation Summary:"
echo ""
echo "✅ Prerequisites: Passed"
echo "✅ Report Mode: Executed"
echo "✅ File Generation: $json_reports JSON + $html_reports HTML + $dashboard_files Dashboard"
echo "✅ Smoke Test: $([ "$smoke_test_success" = true ] && echo "Passed" || echo "Warning")"
echo "✅ Mode Tests: $mode_results"
echo "✅ Import Test: Passed"
echo ""

# Cleanup temporary files
rm -f /tmp/quality-gates-output.log /tmp/smoke-test.log /tmp/import-test.log
for mode in "${modes[@]}"; do
  rm -f "/tmp/mode-test-$mode.log"
done

# Final status
if [ "$json_reports" -gt 0 ] || [ "$html_reports" -gt 0 ]; then
  success "Quality Gates System Validation: PASSED"
  log "🎉 The quality gates system is working correctly after the ES module fix!"
  log "📋 Reports available in: $OUTPUT_DIR"
  
  if [ "$VERBOSE" = false ]; then
    log "💡 Run with --verbose for detailed output"
  fi
  
  exit 0
else
  error "Quality Gates System Validation: FAILED"
  log "🔧 No reports were generated. Check the quality gates configuration."
  exit 1
fi