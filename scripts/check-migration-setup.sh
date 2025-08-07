#!/bin/bash

# Migration Setup Checker
# Validates that all required secrets and environment variables are configured

set -e

echo "🔍 Checking Migration Setup..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track missing items
MISSING_COUNT=0

# Check local environment variables (for testing)
echo "📋 Local Environment Check:"

check_local_env() {
    if [ -z "${!1}" ]; then
        echo -e "  ❌ ${RED}$1${NC} - Not set locally"
        MISSING_COUNT=$((MISSING_COUNT + 1))
    else
        echo -e "  ✅ ${GREEN}$1${NC} - Set locally"
    fi
}

check_local_env "TURSO_DATABASE_URL"
check_local_env "TURSO_AUTH_TOKEN"
check_local_env "MIGRATION_SECRET_KEY"

echo ""
echo "🔑 Required GitHub Secrets:"
echo "  (These should be set in GitHub Settings → Secrets)"
echo "  • VERCEL_TOKEN"
echo "  • VERCEL_ORG_ID"  
echo "  • VERCEL_PROJECT_ID"
echo "  • VERCEL_PRODUCTION_URL"
echo "  • MIGRATION_SECRET_KEY"

echo ""
echo "🌐 Required Vercel Environment Variables:"
echo "  (These should be set in Vercel Dashboard → Settings → Environment Variables)"
echo "  • TURSO_DATABASE_URL"
echo "  • TURSO_AUTH_TOKEN"
echo "  • MIGRATION_SECRET_KEY"
echo "  • BREVO_API_KEY"
echo "  • NODE_ENV=production"

echo ""
echo "🧪 Testing Migration API (if deployed)..."

if [ -n "$VERCEL_PRODUCTION_URL" ]; then
    echo "Testing: https://$VERCEL_PRODUCTION_URL/api/migrate"
    
    if [ -n "$MIGRATION_SECRET_KEY" ]; then
        response=$(curl -s -w "%{http_code}" -o /tmp/migrate_test.json \
            -X POST "https://$VERCEL_PRODUCTION_URL/api/migrate" \
            -H "Content-Type: application/json" \
            -H "x-migration-key: $MIGRATION_SECRET_KEY" \
            -d '{"action": "status"}' 2>/dev/null || echo "000")
        
        if [ "$response" = "200" ]; then
            echo -e "  ✅ ${GREEN}Migration API responding correctly${NC}"
            cat /tmp/migrate_test.json | jq '.' 2>/dev/null || cat /tmp/migrate_test.json
        elif [ "$response" = "000" ]; then
            echo -e "  ⚠️  ${YELLOW}Cannot reach migration API (app may not be deployed yet)${NC}"
        else
            echo -e "  ❌ ${RED}Migration API error (HTTP $response)${NC}"
            cat /tmp/migrate_test.json 2>/dev/null || echo "No response body"
        fi
    else
        echo -e "  ⚠️  ${YELLOW}MIGRATION_SECRET_KEY not set - cannot test API${NC}"
    fi
else
    echo -e "  ⚠️  ${YELLOW}VERCEL_PRODUCTION_URL not set - cannot test API${NC}"
fi

echo ""
echo "📊 Migration System Status:"

if [ $MISSING_COUNT -eq 0 ]; then
    echo -e "🎉 ${GREEN}All local environment variables are set!${NC}"
    echo "   Next steps:"
    echo "   1. Ensure GitHub Secrets are configured"
    echo "   2. Ensure Vercel Environment Variables are configured"  
    echo "   3. Push to main branch to trigger production deployment"
else
    echo -e "⚠️  ${YELLOW}$MISSING_COUNT local environment variables missing${NC}"
    echo "   This is normal if you haven't set up local production testing"
    echo "   The important thing is that GitHub and Vercel secrets are configured"
fi

echo ""
echo "🚀 Ready to deploy? Push to main branch to trigger the migration workflow!"
echo "   The workflow will:"
echo "   1. Run quality checks (lint, test)"
echo "   2. Check for pending migrations"  
echo "   3. Deploy migrations if needed"
echo "   4. Deploy application code"
echo "   5. Run health checks"