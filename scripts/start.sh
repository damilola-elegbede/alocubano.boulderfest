#!/bin/bash

# A Lo Cubano Boulder Fest - Start Development Server

echo "🎵 Starting A Lo Cubano Boulder Fest Development Server..."
echo "================================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed."
    echo "Please install npm with Node.js from https://nodejs.org/"
    exit 1
fi

# Check if Vercel CLI is installed globally
if ! command -v vercel &> /dev/null; then
    echo "📦 Vercel CLI not found. Installing globally..."
    npm install -g vercel
    
    # Check if installation succeeded
    if ! command -v vercel &> /dev/null; then
        echo "❌ Failed to install Vercel CLI."
        echo "Try running: npm install -g vercel"
        exit 1
    fi
    echo "✅ Vercel CLI installed successfully!"
fi

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Install project dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing project dependencies..."
    npm install
fi

# Start the server with Vercel CLI
echo "🚀 Starting Vercel development server on http://localhost:8000"
echo "📁 Serving from: $(pwd)"
echo ""
echo "✨ Features:"
echo "   • Typographic Design - Text-forward, artistic, expressive"
echo "   • Updated for May 15-17, 2026"
echo "   • Board of Directors information"
echo "   • Real artist lineup and schedule"
echo "   • Professional branding with logo and social media"
echo "   • Serverless API functions with Google Drive integration"
echo ""
echo "Press Ctrl+C to stop the server"
echo "================================================"
echo ""

# Run Vercel dev server on port 8000
vercel dev --listen 8000