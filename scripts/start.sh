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

# Check Node.js version (minimum 18.x required for Vercel)
NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "❌ Node.js 18.x or higher is required for Vercel compatibility."
    echo "Current version: v$NODE_VERSION"
    echo "Please upgrade Node.js from https://nodejs.org/"
    exit 1
else
    echo "✅ Node.js v$NODE_VERSION detected (>= 18.x)"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed."
    echo "Please install npm with Node.js from https://nodejs.org/"
    exit 1
fi

# Define Vercel CLI command (using npx for local execution)
VCMD="npx vercel"
echo "📦 Using Vercel CLI via npx (local execution)"

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Install project dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing project dependencies..."
    npm install
fi

# Start the server with npm start (delegates to Vercel CLI)
echo "🚀 Starting development server on http://localhost:3000"
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

# Use npm start which runs npx vercel dev on port 3000
npm start