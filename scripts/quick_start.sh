#!/bin/bash

echo "🎵 A Lo Cubano Boulder Fest - Quick Start"
echo "========================================="

# Navigate to project root (parent of scripts directory)
cd "$(dirname "$0")/.."

# Quick dependency check
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies first..."
    npm install
fi

# Use npm start for consistent development experience
echo "🚀 Starting development server..."
echo "📁 Serving from: $(pwd)"
echo "🌐 Open: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start