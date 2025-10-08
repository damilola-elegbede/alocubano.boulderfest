#!/bin/bash

# Comprehensive Test Script for Bootstrap-Driven Ticket Architecture
# Tests database state, API endpoints, and performance

set -e  # Exit on any error

echo "🧪 Bootstrap-Driven Ticket Architecture Test Suite"
echo "=================================================="
echo

# Configuration
BASE_URL="${1:-http://localhost:3000}"
TEST_OUTPUT_DIR="test-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create output directory
mkdir -p "$TEST_OUTPUT_DIR"

echo "📍 Testing against: $BASE_URL"
echo "📂 Results will be saved to: $TEST_OUTPUT_DIR/"
echo

# Function to make HTTP requests and measure performance
make_request() {
    local url="$1"
    local method="${2:-GET}"
    local description="$3"

    echo "🔗 Testing: $description"
    echo "   URL: $url"

    # Use curl with timing information
    local output_file="$TEST_OUTPUT_DIR/curl_${TIMESTAMP}_$(echo "$description" | tr ' ' '_' | tr -cd '[:alnum:]_').json"

    local start_time=$(date +%s%3N)
    local http_code=$(curl -s -w "%{http_code}" -X "$method" "$url" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -o "$output_file")
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))

    echo "   Status: $http_code"
    echo "   Duration: ${duration}ms"
    echo "   Output: $output_file"

    # Validate JSON if successful
    if [ "$http_code" = "200" ]; then
        if jq empty "$output_file" 2>/dev/null; then
            echo "   ✅ Valid JSON response"

            # Extract key metrics
            local ticket_count=$(jq '.tickets | length' "$output_file" 2>/dev/null || echo "N/A")
            local cached=$(jq '.cached' "$output_file" 2>/dev/null || echo "N/A")
            local response_time=$(jq '.metadata.response_time_ms' "$output_file" 2>/dev/null || echo "N/A")

            echo "   📊 Tickets: $ticket_count, Cached: $cached, API Response Time: ${response_time}ms"
        else
            echo "   ❌ Invalid JSON response"
        fi
    else
        echo "   ❌ HTTP Error: $http_code"
        cat "$output_file"
    fi
    echo

    return $http_code
}

# Function to test database directly (if sqlite3 is available)
test_database() {
    echo "🗄️  Testing Database State"
    echo "========================"

    # Try to find database file
    local db_file=""
    if [ -f "data/festival.db" ]; then
        db_file="data/festival.db"
    elif [ -f "festival.db" ]; then
        db_file="festival.db"
    else
        echo "❌ Database file not found (looking for data/festival.db or festival.db)"
        echo "   This is normal for production deployments using Turso"
        echo
        return 1
    fi

    echo "📂 Database file: $db_file"

    # Check if sqlite3 is available
    if ! command -v sqlite3 &> /dev/null; then
        echo "❌ sqlite3 command not available"
        echo
        return 1
    fi

    # Test queries
    echo "📋 Running database verification queries..."

    echo "1. Bootstrap versions:"
    sqlite3 "$db_file" "SELECT version, checksum, status, applied_at FROM bootstrap_versions ORDER BY applied_at DESC LIMIT 3;" || echo "   No bootstrap versions table"

    echo "2. Events count:"
    sqlite3 "$db_file" "SELECT COUNT(*) as total_events FROM events;" || echo "   No events table"

    echo "3. Ticket types count:"
    sqlite3 "$db_file" "SELECT COUNT(*) as total_ticket_types FROM ticket_types;" || echo "   No ticket_types table"

    echo "4. Events by status:"
    sqlite3 "$db_file" "SELECT status, COUNT(*) as count FROM events GROUP BY status;" || echo "   Query failed"

    echo "5. Ticket types by status:"
    sqlite3 "$db_file" "SELECT status, COUNT(*) as count FROM ticket_types GROUP BY status;" || echo "   Query failed"

    echo "6. Sample ticket data:"
    sqlite3 "$db_file" "SELECT id, name, price_cents, status, max_quantity, sold_count FROM ticket_types LIMIT 3;" || echo "   Query failed"

    echo
}

# Main test execution
main() {
    echo "🚀 Starting comprehensive tests..."
    echo

    # Test 1: Basic API Health
    make_request "$BASE_URL/api/tickets/types" "GET" "Basic API Health Check"

    # Test 2: All ticket types
    make_request "$BASE_URL/api/tickets/types" "GET" "All Ticket Types"

    # Test 3: Filter by event
    make_request "$BASE_URL/api/tickets/types?event_id=boulder-fest-2026" "GET" "Filter by Event ID"

    # Test 4: Filter by status
    make_request "$BASE_URL/api/tickets/types?status=available,coming-soon" "GET" "Filter by Status"

    # Test 5: Test tickets visibility (environment-based)
    # Note: Test tickets are automatically visible in non-production environments
    make_request "$BASE_URL/api/tickets/types" "GET" "Test Tickets Visibility (environment-based)"

    # Test 6: Combined filters
    make_request "$BASE_URL/api/tickets/types?event_id=boulder-fest-2026&status=available" "GET" "Combined Filters"

    # Test 7: Test CORS preflight
    make_request "$BASE_URL/api/tickets/types" "OPTIONS" "CORS Preflight"

    # Test 8: Test invalid method
    make_request "$BASE_URL/api/tickets/types" "POST" "Invalid Method (should fail)"

    # Test 9: Cache performance test
    echo "🚄 Cache Performance Test"
    echo "========================"
    echo "Making 5 consecutive requests to test cache performance..."
    for i in {1..5}; do
        echo "Request $i:"
        make_request "$BASE_URL/api/tickets/types" "GET" "Cache Test Request $i"
    done

    # Test 10: Concurrent requests test
    echo "⚡ Concurrent Requests Test"
    echo "=========================="
    echo "Making 10 concurrent requests..."

    local pids=()
    for i in {1..10}; do
        (make_request "$BASE_URL/api/tickets/types" "GET" "Concurrent Request $i") &
        pids+=($!)
    done

    # Wait for all background jobs to complete
    for pid in "${pids[@]}"; do
        wait $pid
    done

    echo "✅ All concurrent requests completed"
    echo

    # Test database directly
    test_database

    # Summary
    echo "📈 Test Summary"
    echo "==============="
    echo "Test files generated in: $TEST_OUTPUT_DIR/"
    echo "Timestamp: $TIMESTAMP"
    echo

    # List generated files
    echo "Generated files:"
    ls -la "$TEST_OUTPUT_DIR/" | grep "$TIMESTAMP" || echo "No files generated"
    echo

    # Basic file analysis
    if ls "$TEST_OUTPUT_DIR"/*"$TIMESTAMP"*.json &> /dev/null; then
        echo "📊 Response Analysis:"
        for file in "$TEST_OUTPUT_DIR"/*"$TIMESTAMP"*.json; do
            if [ -f "$file" ]; then
                local filename=$(basename "$file")
                local size=$(wc -c < "$file")
                echo "   $filename: ${size} bytes"

                # Try to extract key metrics
                if jq empty "$file" 2>/dev/null; then
                    local success=$(jq '.success' "$file" 2>/dev/null || echo "null")
                    local ticket_count=$(jq '.tickets | length' "$file" 2>/dev/null || echo "null")
                    echo "     Success: $success, Tickets: $ticket_count"
                fi
            fi
        done
    fi

    echo
    echo "✅ Bootstrap-driven ticket architecture test suite completed!"
}

# Run main function
main "$@"