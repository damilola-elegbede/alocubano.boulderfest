#!/bin/bash

# A Lo Cubano Payment System Rollback Procedure
# This script handles emergency rollbacks for payment feature deployments

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VERCEL_TOKEN="${VERCEL_TOKEN}"
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID}"
DATADOG_API_KEY="${DATADOG_API_KEY}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}"
DATABASE_URL="${DATABASE_URL}"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

send_notification() {
    local message="$1"
    local severity="${2:-info}"
    
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"text\": \"🚨 Rollback Alert: $message\",
            \"attachments\": [{
                \"color\": \"$([ "$severity" = "error" ] && echo "danger" || echo "warning")\",
                \"fields\": [{
                    \"title\": \"Environment\",
                    \"value\": \"Production\",
                    \"short\": true
                }, {
                    \"title\": \"Initiated By\",
                    \"value\": \"$(whoami)\",
                    \"short\": true
                }, {
                    \"title\": \"Timestamp\",
                    \"value\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
                    \"short\": true
                }]
            }]
        }" 2>/dev/null || true
}

create_incident() {
    local title="$1"
    local severity="${2:-high}"
    
    # Create PagerDuty incident
    curl -X POST "https://api.pagerduty.com/incidents" \
        -H "Authorization: Token token=${PAGERDUTY_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{
            \"incident\": {
                \"type\": \"incident\",
                \"title\": \"$title\",
                \"service\": {
                    \"id\": \"${PAGERDUTY_SERVICE_ID}\",
                    \"type\": \"service_reference\"
                },
                \"urgency\": \"$severity\",
                \"body\": {
                    \"type\": \"incident_body\",
                    \"details\": \"Automatic rollback initiated due to payment system failure\"
                }
            }
        }" 2>/dev/null || true
}

# Check current system health
check_system_health() {
    log_info "Checking current system health..."
    
    # Check payment API health
    local payment_health=$(curl -s -o /dev/null -w "%{http_code}" https://alocubano.boulderfest.com/api/payment/health)
    
    if [ "$payment_health" != "200" ]; then
        log_error "Payment API is unhealthy (HTTP $payment_health)"
        return 1
    fi
    
    # Check database connectivity
    if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
        log_error "Database connection failed"
        return 1
    fi
    
    # Check error rate from monitoring
    local error_rate=$(curl -s -X GET "https://api.datadoghq.com/api/v1/query" \
        -H "DD-API-KEY: $DATADOG_API_KEY" \
        -H "DD-APPLICATION-KEY: $DATADOG_APP_KEY" \
        -d "from=$(date -u -d '5 minutes ago' +%s)" \
        -d "to=$(date +%s)" \
        -d "query=avg:payment.error_rate{env:production}" \
        | jq -r '.series[0].pointlist[-1][1] // 0')
    
    if (( $(echo "$error_rate > 5" | bc -l) )); then
        log_error "High error rate detected: ${error_rate}%"
        return 1
    fi
    
    log_info "System health check passed"
    return 0
}

# Get the previous stable deployment
get_previous_deployment() {
    log_info "Fetching previous stable deployment..."
    
    local deployments=$(curl -s -X GET \
        "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&target=production&limit=10" \
        -H "Authorization: Bearer $VERCEL_TOKEN")
    
    # Get the second most recent production deployment
    local previous_deployment=$(echo "$deployments" | jq -r '.deployments[1].uid')
    local previous_url=$(echo "$deployments" | jq -r '.deployments[1].url')
    
    if [ -z "$previous_deployment" ] || [ "$previous_deployment" = "null" ]; then
        log_error "No previous deployment found"
        return 1
    fi
    
    echo "$previous_deployment"
}

# Perform the rollback
perform_rollback() {
    local deployment_id="$1"
    
    log_info "Rolling back to deployment: $deployment_id"
    
    # Set the deployment as current
    local response=$(curl -s -X POST \
        "https://api.vercel.com/v6/deployments/$deployment_id/promote" \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo "$response" | jq -e '.error' > /dev/null; then
        log_error "Rollback failed: $(echo "$response" | jq -r '.error.message')"
        return 1
    fi
    
    log_info "Deployment promoted successfully"
    
    # Wait for rollback to propagate
    log_info "Waiting for rollback to propagate..."
    sleep 30
    
    # Verify rollback
    if check_system_health; then
        log_info "Rollback completed successfully"
        return 0
    else
        log_error "System still unhealthy after rollback"
        return 1
    fi
}

# Database rollback
rollback_database() {
    local migration_version="$1"
    
    log_info "Rolling back database migration: $migration_version"
    
    # Execute rollback migration
    if [ -f "migrations/rollback/$migration_version.sql" ]; then
        psql "$DATABASE_URL" < "migrations/rollback/$migration_version.sql"
        
        # Update migration history
        psql "$DATABASE_URL" -c "DELETE FROM schema_migrations WHERE version = '$migration_version'"
        
        log_info "Database rollback completed"
    else
        log_warn "No rollback script found for migration $migration_version"
    fi
}

# Clear caches
clear_caches() {
    log_info "Clearing caches..."
    
    # Clear Vercel edge cache
    curl -X POST \
        "https://api.vercel.com/v1/projects/$VERCEL_PROJECT_ID/purge" \
        -H "Authorization: Bearer $VERCEL_TOKEN"
    
    # Clear Redis cache
    redis-cli -u "$REDIS_URL" FLUSHDB
    
    # Clear CDN cache if applicable
    # curl -X POST ...
    
    log_info "Caches cleared"
}

# Main rollback procedure
main() {
    local rollback_type="${1:-full}"
    local force="${2:-false}"
    
    log_info "Starting rollback procedure (type: $rollback_type)"
    
    # Send initial notification
    send_notification "Rollback procedure initiated" "warning"
    
    # Create incident
    create_incident "Payment System Rollback" "high"
    
    # Check if rollback is needed
    if [ "$force" != "true" ] && check_system_health; then
        log_info "System is healthy, rollback may not be necessary"
        read -p "Continue with rollback? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Rollback cancelled"
            exit 0
        fi
    fi
    
    case "$rollback_type" in
        "full")
            # Full rollback: code + database
            log_info "Performing full rollback..."
            
            # Get previous deployment
            if previous_deployment=$(get_previous_deployment); then
                perform_rollback "$previous_deployment" || exit 1
            else
                log_error "Failed to get previous deployment"
                exit 1
            fi
            
            # Rollback database if needed
            if [ -n "${DB_MIGRATION_VERSION:-}" ]; then
                rollback_database "$DB_MIGRATION_VERSION"
            fi
            
            # Clear all caches
            clear_caches
            ;;
            
        "code")
            # Code-only rollback
            log_info "Performing code-only rollback..."
            
            if previous_deployment=$(get_previous_deployment); then
                perform_rollback "$previous_deployment" || exit 1
            else
                log_error "Failed to get previous deployment"
                exit 1
            fi
            
            clear_caches
            ;;
            
        "database")
            # Database-only rollback
            log_info "Performing database-only rollback..."
            
            if [ -z "${DB_MIGRATION_VERSION:-}" ]; then
                log_error "DB_MIGRATION_VERSION not specified"
                exit 1
            fi
            
            rollback_database "$DB_MIGRATION_VERSION"
            ;;
            
        *)
            log_error "Unknown rollback type: $rollback_type"
            exit 1
            ;;
    esac
    
    # Final health check
    log_info "Performing final health check..."
    if check_system_health; then
        log_info "✅ Rollback completed successfully"
        send_notification "Rollback completed successfully" "info"
        
        # Generate rollback report
        cat > rollback_report_$(date +%Y%m%d_%H%M%S).txt << EOF
Rollback Report
===============
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Type: $rollback_type
Initiated By: $(whoami)
Status: Success

Actions Taken:
- Rolled back to deployment: ${previous_deployment:-N/A}
- Database rollback: ${DB_MIGRATION_VERSION:-N/A}
- Caches cleared: Yes

System Health: Verified
EOF
        
    else
        log_error "❌ System still unhealthy after rollback"
        send_notification "Rollback completed but system still unhealthy" "error"
        exit 1
    fi
}

# Parse arguments
case "${1:-}" in
    "help"|"-h"|"--help")
        cat << EOF
Payment System Rollback Procedure

Usage: $0 [rollback_type] [force]

Rollback Types:
  full     - Roll back both code and database (default)
  code     - Roll back code deployment only
  database - Roll back database migrations only

Options:
  force    - Skip health check confirmation

Environment Variables Required:
  VERCEL_TOKEN
  VERCEL_PROJECT_ID
  DATABASE_URL
  REDIS_URL
  DATADOG_API_KEY
  SLACK_WEBHOOK_URL

Examples:
  $0                    # Full rollback with confirmation
  $0 code              # Code-only rollback
  $0 database force    # Force database rollback
EOF
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac