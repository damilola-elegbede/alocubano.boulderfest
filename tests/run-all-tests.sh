#!/bin/bash

echo "==================================="
echo "A Lo Cubano Boulder Fest Test Suite"
echo "==================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is required but not installed${NC}"
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 is required but not installed${NC}"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing test dependencies..."
    npm install
fi

# Start test server
echo "Starting test server..."
python3 -m http.server 8000 > /dev/null 2>&1 &
SERVER_PID=$!
sleep 3

# Function to run tests
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -e "\n${YELLOW}Running ${test_name}...${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✓ ${test_name} passed${NC}"
        return 0
    else
        echo -e "${RED}✗ ${test_name} failed${NC}"
        return 1
    fi
}

# Track test results
FAILED_TESTS=0

# Run all test suites
run_test "Unit Tests" "npm run test:unit" || ((FAILED_TESTS++))
run_test "Link Validation" "npm run test:links" || ((FAILED_TESTS++))
run_test "JavaScript Linting" "npm run lint:js" || ((FAILED_TESTS++))
run_test "HTML Linting" "npm run lint:html" || ((FAILED_TESTS++))

# Kill test server
echo -e "\nStopping test server..."
kill $SERVER_PID

# Summary
echo ""
echo "==================================="
echo "Test Summary"
echo "==================================="

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}${FAILED_TESTS} test suite(s) failed ✗${NC}"
    exit 1
fi