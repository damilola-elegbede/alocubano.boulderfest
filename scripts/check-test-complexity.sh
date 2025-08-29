#!/bin/bash

# Test Infrastructure Complexity Check
# Ensures tests remain simple and maintainable

echo "🔍 Checking test infrastructure complexity..."

COMPLEXITY_ISSUES=0

# Check 1: Vitest config should be minimal (< 15 lines)
VITEST_LINES=$(wc -l < tests/vitest.config.js 2>/dev/null || echo "0")
if [ "$VITEST_LINES" -gt 15 ]; then
  echo "❌ vitest.config.js is too complex ($VITEST_LINES lines, max 15)"
  COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
else
  echo "✅ vitest.config.js is simple ($VITEST_LINES lines)"
fi

# Check 2: Setup file should be minimal (< 30 lines)
SETUP_LINES=$(wc -l < tests/setup.js 2>/dev/null || echo "0")
if [ "$SETUP_LINES" -gt 30 ]; then
  echo "❌ setup.js is too complex ($SETUP_LINES lines, max 30)"
  COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
else
  echo "✅ setup.js is simple ($SETUP_LINES lines)"
fi

# Check 3: Helpers should be minimal (< 35 lines)
HELPERS_LINES=$(wc -l < tests/helpers.js 2>/dev/null || echo "0")
if [ "$HELPERS_LINES" -gt 35 ]; then
  echo "❌ helpers.js is too complex ($HELPERS_LINES lines, max 35)"
  COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
else
  echo "✅ helpers.js is simple ($HELPERS_LINES lines)"
fi

# Check 4: No complex global setup
if [ -f "tests/global-setup.js" ]; then
  GLOBAL_LINES=$(wc -l < tests/global-setup.js)
  if [ "$GLOBAL_LINES" -gt 10 ]; then
    echo "❌ global-setup.js should be removed or minimal (currently $GLOBAL_LINES lines)"
    COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
  else
    echo "✅ global-setup.js is minimal"
  fi
fi

# Check 5: No complex abstractions in test files
ABSTRACT_COUNT=$(grep -r "class.*Test\|extends.*Test\|abstract.*test" tests/*.test.js 2>/dev/null | wc -l || echo "0")
if [ "$ABSTRACT_COUNT" -gt 0 ]; then
  echo "❌ Found test abstractions/classes ($ABSTRACT_COUNT occurrences)"
  COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
else
  echo "✅ No complex test abstractions found"
fi

# Check 6: No complex mocking frameworks
MOCK_COUNT=$(grep -r "jest\.mock\|sinon\|proxyquire\|mockery" tests/ 2>/dev/null | wc -l || echo "0")
if [ "$MOCK_COUNT" -gt 0 ]; then
  echo "❌ Found complex mocking frameworks ($MOCK_COUNT occurrences)"
  COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
else
  echo "✅ No complex mocking frameworks"
fi

# Check 7: No test builders or factories
BUILDER_COUNT=$(grep -r "Builder\|Factory\|fixture" tests/ 2>/dev/null | grep -v "// " | wc -l || echo "0")
if [ "$BUILDER_COUNT" -gt 5 ]; then
  echo "❌ Too many test builders/factories ($BUILDER_COUNT occurrences, max 5)"
  COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
else
  echo "✅ Minimal test data helpers ($BUILDER_COUNT occurrences)"
fi

# Check 8: No complex database reset logic
RESET_COUNT=$(grep -r "resetDatabase\|truncate\|DROP TABLE" tests/ 2>/dev/null | wc -l || echo "0")
if [ "$RESET_COUNT" -gt 2 ]; then
  echo "❌ Complex database reset logic found ($RESET_COUNT occurrences)"
  COMPLEXITY_ISSUES=$((COMPLEXITY_ISSUES + 1))
else
  echo "✅ Simple test database strategy"
fi

echo ""
if [ "$COMPLEXITY_ISSUES" -eq 0 ]; then
  echo "✨ Test infrastructure is simple and maintainable!"
  exit 0
else
  echo "⚠️  Found $COMPLEXITY_ISSUES complexity issues"
  echo ""
  echo "Guidelines for simple tests:"
  echo "• Keep configuration minimal"
  echo "• Avoid complex abstractions"
  echo "• Use in-memory databases for unit tests"
  echo "• No complex mocking frameworks"
  echo "• Direct API testing preferred"
  exit 1
fi