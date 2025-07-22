#!/bin/bash

echo "🎵 A Lo Cubano Boulder Fest - Quick Start"
echo "========================================="

# Navigate to project root (parent of scripts directory)
cd "$(dirname "$0")/.."

# Check for Vercel CLI installation
if command -v vercel &> /dev/null; then
    # Vercel CLI is installed, use it
    echo "🚀 Starting Vercel development server..."
    echo "📁 Serving from: $(pwd)"
    echo "🌐 Open: http://localhost:8000"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    
    # Quick dependency check
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies first..."
        npm install
    fi
    
    vercel dev --listen 8000
else
    # Fallback to Node.js http-server if Vercel CLI not installed
    echo "⚠️  Vercel CLI not found. Using Node.js http-server as fallback."
    echo "For full functionality, install Vercel CLI: npm install -g vercel"
    echo ""
    echo "🚀 Starting Node.js server..."
    echo "📁 Serving from: $(pwd)"
    echo "🌐 Open: http://localhost:8000"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    
    npm run serve
fi