#!/bin/bash

# Quick test script for Vercel deployment
echo "🚀 Starting Local Vercel Environment Test"
echo "========================================"

# Option 1: Try Vercel dev (requires authentication)
echo "📋 Option 1: Official Vercel Dev (requires auth)"
echo "   Run: vercel dev --listen 3000"
echo ""

# Option 2: Use our simulation
echo "📋 Option 2: Local Vercel Simulation (no auth required)"
echo "   Run: npm run vercel:dev"
echo ""

# Show current project status
echo "🔍 Project Status:"
echo "   Branch: $(git branch --show-current)"
echo "   Last commit: $(git log --oneline -1)"
echo "   Vercel config: $(ls -la vercel.json | awk '{print $5}') bytes"
echo ""

# Show test URLs that should work after setup
echo "🧪 Test URLs (once server is running):"
echo "   http://localhost:3000/              (index.html)"
echo "   http://localhost:3000/home          (should redirect to home page)"
echo "   http://localhost:3000/about         (should show about page)" 
echo "   http://localhost:3000/api/debug     (should show debug info)"
echo "   http://localhost:3000/nonexistent   (should show 404 page)"
echo ""

echo "✨ Choose your preferred option and run the corresponding command!"