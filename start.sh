#!/bin/bash

# A Lo Cubano Boulder Fest - Start Development Server

echo "🎵 Starting A Lo Cubano Boulder Fest Development Server..."
echo "================================================"
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "Please install Python 3 from https://www.python.org/"
    exit 1
fi

# Set up virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Setting up virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Start the server
echo "🚀 Starting server on http://localhost:8000"
echo "📁 Serving from: $(pwd)"
echo ""
echo "✨ Features:"
echo "   • Typographic Design - Text-forward, artistic, expressive"
echo "   • Updated for May 15-17, 2026"
echo "   • Board of Directors information"
echo "   • Real artist lineup and schedule"
echo "   • Professional branding with logo and social media"
echo ""
echo "Press Ctrl+C to stop the server"
echo "================================================"
echo ""

# Run the server
python3 server.py