#!/bin/bash

# Start ngrok and local server - Default development environment
# This script starts both the local server and ngrok tunnel

echo "🚀 Starting A Lo Cubano Boulder Fest with ngrok tunnel..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "⚠️  ngrok is not installed. Falling back to local development."
    echo ""
    echo "To install ngrok:"
    echo "   brew install ngrok"
    echo ""
    echo "Then configure your domain:"
    echo "   ngrok config add-authtoken YOUR_TOKEN"
    echo ""
    echo -e "${BLUE}Starting local server without ngrok...${NC}"
    npx vercel dev --listen 3000
    exit 0
fi

# Kill any existing ngrok processes
pkill -f ngrok > /dev/null 2>&1

# Start ngrok in background
echo "🌐 Starting ngrok tunnel on port 3000..."
ngrok http 3000 --domain=alocubanoboulderfest.ngrok.io > /dev/null 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
sleep 2

# Check if ngrok started successfully
if ! ps -p $NGROK_PID > /dev/null; then
    echo "❌ Failed to start ngrok. Make sure port 3000 is available."
    exit 1
fi

# Get ngrok URL (if using random URL instead of custom domain)
# NGROK_URL=$(curl -s localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)

# For custom domain
NGROK_URL="https://alocubanoboulderfest.ngrok.io"

echo ""
echo -e "${GREEN}✅ ngrok tunnel active!${NC}"
echo -e "${YELLOW}📍 Public URL: $NGROK_URL${NC}"
echo -e "${YELLOW}📊 ngrok dashboard: http://localhost:4040${NC}"
echo ""

# Export the URL for the server to use
export NGROK_URL=$NGROK_URL
export APPLE_REDIRECT_URI="${NGROK_URL}/api/auth/apple/callback"

echo "🔐 Apple Sign In redirect URI set to: $APPLE_REDIRECT_URI"
echo ""

# Create/update .env.local with ngrok URL
if [ -f .env.local ]; then
    # Backup existing .env.local
    cp .env.local .env.local.backup
    
    # Update APPLE_REDIRECT_URI in .env.local
    if grep -q "APPLE_REDIRECT_URI=" .env.local; then
        # On macOS, use -i '' for in-place editing
        sed -i '' "s|APPLE_REDIRECT_URI=.*|APPLE_REDIRECT_URI=${APPLE_REDIRECT_URI}|" .env.local
    else
        echo "APPLE_REDIRECT_URI=${APPLE_REDIRECT_URI}" >> .env.local
    fi
    echo "✅ Updated .env.local with ngrok URL"
else
    echo "⚠️  No .env.local found. Make sure to set your Apple credentials!"
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    
    # Kill ngrok
    if [ ! -z "$NGROK_PID" ]; then
        kill $NGROK_PID 2>/dev/null
        echo "✅ ngrok tunnel closed"
    fi
    
    # Restore original .env.local if it was backed up
    if [ -f .env.local.backup ]; then
        mv .env.local.backup .env.local
        echo "✅ Restored original .env.local"
    fi
    
    exit 0
}

# Set up trap to cleanup on script exit
trap cleanup EXIT INT TERM

echo "🎸 Starting local development server..."
echo "=========================================="
echo ""

# Start the development server (this will run in foreground)
npm run dev