#!/bin/bash

# Test the new test framework in CI mode (with mock server)
echo "🧪 Testing CI Mode with Mock Server"
echo "================================="
echo ""

# Set CI environment variables
export CI=true
export NODE_ENV=test

echo "Environment:"
echo "  CI=$CI"
echo "  NODE_ENV=$NODE_ENV"
echo "  VERCEL_TOKEN=${VERCEL_TOKEN:-'(not set)'}"
echo ""

# Run a single test to verify mock server works
echo "Running single test file to verify mock server..."
npx vitest run --config tests-new/vitest.config.js tests-new/integration/api-health.test.js

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Mock server test passed!"
  echo ""
  echo "Now running full test suite..."
  npm run test:new
else
  echo ""
  echo "❌ Mock server test failed!"
  exit 1
fi