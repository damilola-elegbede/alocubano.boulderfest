#!/bin/bash

# Simple test script for A Lo Cubano Boulder Fest website
# This checks that all main pages load correctly

echo "Testing A Lo Cubano Boulder Fest Website"
echo "========================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Python3 is required to run the test server"
    exit 1
fi

# Start server in background
echo "Starting test server on port 8000..."
npx http-server -p 8000 > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Test pages
PAGES=("home" "about" "artists" "schedule" "gallery" "tickets" "donations")
BASE_URL="http://localhost:8000/pages/typographic"

echo "Testing pages..."
echo ""

for page in "${PAGES[@]}"; do
    URL="$BASE_URL/$page.html"
    if curl -s -o /dev/null -w "%{http_code}" "$URL" | grep -q "200"; then
        echo "✓ $page.html - OK"
    else
        echo "✗ $page.html - FAILED"
    fi
done

echo ""
echo "Testing CSS files..."
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/css/typography-simplified.css" | grep -q "200"; then
    echo "✓ typography-simplified.css - OK"
else
    echo "✗ typography-simplified.css - FAILED"
fi

echo ""
echo "Testing logo..."
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/images/logo.png" | grep -q "200"; then
    echo "✓ logo.png - OK"
else
    echo "✗ logo.png - FAILED"
fi

# Kill the server
echo ""
echo "Stopping test server..."
kill $SERVER_PID

echo ""
echo "Test complete!"
echo ""
echo "For Vercel deployment:"
echo "1. Push to GitHub"
echo "2. Import project in Vercel"
echo "3. No build settings needed (static site)"
echo "4. Deploy!"