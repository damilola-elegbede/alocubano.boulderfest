#!/bin/bash

# Remote Migration Helper Script
# Runs migrations on production via Vercel API endpoint

set -e  # Exit on error

# Configuration
APP_URL="https://your-app.vercel.app"  # Update this!
MIGRATION_KEY="${MIGRATION_SECRET_KEY}"  # Set this environment variable locally

if [ -z "$MIGRATION_KEY" ]; then
    echo "❌ Error: MIGRATION_SECRET_KEY environment variable not set"
    echo "Run: export MIGRATION_SECRET_KEY='your-secret-key'"
    exit 1
fi

# Function to call migration API
call_migration_api() {
    local action="$1"
    echo "🔄 Running migration action: $action"
    
    curl -s -X POST "$APP_URL/api/migrate" \
        -H "Content-Type: application/json" \
        -H "x-migration-key: $MIGRATION_KEY" \
        -d "{\"action\": \"$action\"}" | jq '.'
}

# Main command handling
case "${1:-status}" in
    "status")
        echo "📊 Checking migration status..."
        call_migration_api "status"
        ;;
    "run")
        echo "🚀 Deploying migrations..."
        call_migration_api "run"
        ;;
    "verify")
        echo "🔍 Verifying migrations..."
        call_migration_api "verify"
        ;;
    "health")
        echo "🏥 Checking application health..."
        curl -s "$APP_URL/api/test-db" | jq '.'
        ;;
    "help")
        echo "Remote Migration Helper"
        echo ""
        echo "Usage: ./scripts/remote-migrate.sh [command]"
        echo ""
        echo "Commands:"
        echo "  status  - Check migration status (default)"
        echo "  run     - Deploy all pending migrations"
        echo "  verify  - Verify migration integrity"
        echo "  health  - Check application health"
        echo "  help    - Show this help"
        echo ""
        echo "Environment:"
        echo "  MIGRATION_SECRET_KEY - Required migration API key"
        echo "  Update APP_URL in script to match your domain"
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo "Run './scripts/remote-migrate.sh help' for usage"
        exit 1
        ;;
esac