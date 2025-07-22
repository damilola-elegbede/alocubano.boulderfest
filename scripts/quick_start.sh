#!/bin/bash

echo "🎵 A Lo Cubano Boulder Fest - Quick Start"
echo "========================================="

cd "$(dirname "$0")"

# Try different methods to start the server
echo "🚀 Starting server..."

# Method 1: Simple Python HTTP server
echo "📁 Serving from: $(pwd)"
echo "🌐 Open: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python3 -m http.server 8000