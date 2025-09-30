#!/bin/bash

# Simple API Endpoint Test for Bootstrap-Driven Ticket Architecture
# Tests the /api/tickets/types endpoint with various parameters

set -e

# Configuration
BASE_URL="${1:-http://localhost:3000}"
echo "🌐 Testing API endpoints against: $BASE_URL"
echo

# Test basic functionality without starting server
echo "🧪 Quick API Tests"
echo "=================="

# Function to test endpoint
test_endpoint() {
    local url="$1"
    local description="$2"
    local expected_status="${3:-200}"

    echo "🔗 $description"
    echo "   URL: $url"

    # Use timeout to prevent hanging
    local response=$(curl -s -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")

    if [ "$response" = "000" ]; then
        echo "   ❌ Connection failed (server not running)"
    else
        local http_code="${response: -3}"
        local body="${response%???}"

        echo "   Status: $http_code"

        if [ "$http_code" = "$expected_status" ]; then
            echo "   ✅ Expected status code"

            # Try to parse JSON and extract key info
            if echo "$body" | jq empty 2>/dev/null; then
                local success=$(echo "$body" | jq -r '.success' 2>/dev/null || echo "null")
                local ticket_count=$(echo "$body" | jq '.tickets | length' 2>/dev/null || echo "N/A")
                local cached=$(echo "$body" | jq -r '.cached' 2>/dev/null || echo "N/A")

                echo "   📊 Success: $success, Tickets: $ticket_count, Cached: $cached"
            else
                echo "   ⚠️  Non-JSON response"
            fi
        else
            echo "   ❌ Unexpected status (expected $expected_status)"
        fi
    fi
    echo
}

# Test endpoints
test_endpoint "$BASE_URL/api/tickets/types" "All ticket types"
test_endpoint "$BASE_URL/api/tickets/types?event_id=1" "Filter by event ID"
test_endpoint "$BASE_URL/api/tickets/types?status=available" "Filter by status"
test_endpoint "$BASE_URL/api/tickets/types?include_test=true" "Include test tickets"
test_endpoint "$BASE_URL/api/tickets/types" "OPTIONS request" "200"

# Test error cases
test_endpoint "$BASE_URL/api/tickets/types/invalid" "Invalid endpoint" "404"

echo "📋 Test Summary"
echo "==============="
echo "If you see connection failures, start the development server first:"
echo "   npm start"
echo "Then re-run this script."
echo

# Check if server is running
if curl -s --connect-timeout 2 --max-time 5 "$BASE_URL/api/health/check" >/dev/null 2>&1; then
    echo "✅ Server appears to be running at $BASE_URL"
else
    echo "❌ Server not running at $BASE_URL"
    echo
    echo "To start the server:"
    echo "   npm start"
    echo
    echo "Then test with:"
    echo "   ./scripts/api-endpoint-test.sh"
fi