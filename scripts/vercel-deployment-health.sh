#!/bin/bash

# Vercel Deployment Health Check Script
# This script monitors a Vercel deployment and validates its health status
# It uses the deployment mode to bypass external service checks during initial deployment

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAX_RETRIES="${MAX_RETRIES:-30}"
RETRY_INTERVAL="${RETRY_INTERVAL:-4}"
DEPLOYMENT_URL="${1:-}"

# Validate deployment URL
if [ -z "$DEPLOYMENT_URL" ]; then
  echo -e "${RED}❌ Error: Deployment URL is required${NC}"
  echo "Usage: $0 <deployment-url>"
  echo "Example: $0 https://alocubano-boulderfest-xyz.vercel.app"
  exit 1
fi

# Remove trailing slash if present
DEPLOYMENT_URL="${DEPLOYMENT_URL%/}"

echo -e "${BLUE}🚀 Vercel Deployment Health Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Deployment URL: ${GREEN}$DEPLOYMENT_URL${NC}"
echo -e "Max retries: ${YELLOW}$MAX_RETRIES${NC}"
echo -e "Retry interval: ${YELLOW}${RETRY_INTERVAL}s${NC}"
echo ""

# Function to check deployment health
check_health() {
  local url="$1"
  local mode="$2"
  
  if [ "$mode" = "deployment" ]; then
    # Use deployment mode for initial checks
    response=$(curl -s -w "\n%{http_code}" "$url/api/health/check?deployment=true" 2>/dev/null || echo "000")
  else
    # Use quick mode for subsequent checks
    response=$(curl -s -w "\n%{http_code}" "$url/api/health/check?quick=true" 2>/dev/null || echo "000")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n -1)
  
  echo "$http_code"
}

# Function to get detailed health status
get_health_details() {
  local url="$1"
  curl -s "$url/api/health/check?deployment=true" 2>/dev/null | jq '.' 2>/dev/null || echo "{}"
}

# Phase 1: Wait for deployment to be accessible
echo -e "${YELLOW}⏳ Phase 1: Waiting for deployment to be accessible...${NC}"
for i in $(seq 1 $MAX_RETRIES); do
  http_code=$(check_health "$DEPLOYMENT_URL" "deployment")
  
  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✅ Deployment is accessible (attempt $i/$MAX_RETRIES)${NC}"
    break
  elif [ "$http_code" = "000" ]; then
    echo -e "  Attempt $i/$MAX_RETRIES: Deployment not reachable yet..."
  else
    echo -e "  Attempt $i/$MAX_RETRIES: HTTP $http_code"
  fi
  
  if [ $i -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ Deployment failed to become accessible after $((MAX_RETRIES * RETRY_INTERVAL))s${NC}"
    exit 1
  fi
  
  sleep $RETRY_INTERVAL
done

# Phase 2: Validate deployment health
echo ""
echo -e "${YELLOW}⏳ Phase 2: Validating deployment health...${NC}"

# Get detailed health status
health_details=$(get_health_details "$DEPLOYMENT_URL")

# Extract key information
status=$(echo "$health_details" | jq -r '.status // "unknown"')
environment=$(echo "$health_details" | jq -r '.environment // "unknown"')
vercel_env=$(echo "$health_details" | jq -r '.vercel.environment // "unknown"')
deployment_mode=$(echo "$health_details" | jq -r '.deployment_mode // false')
has_db_url=$(echo "$health_details" | jq -r '.vercel.has_database_url // false')
has_auth_token=$(echo "$health_details" | jq -r '.vercel.has_auth_token // false')

echo -e "${BLUE}📊 Deployment Status:${NC}"
echo -e "  Status: ${GREEN}$status${NC}"
echo -e "  Environment: $environment"
echo -e "  Vercel Environment: $vercel_env"
echo -e "  Deployment Mode: $deployment_mode"

# Phase 3: Check critical endpoints
echo ""
echo -e "${YELLOW}⏳ Phase 3: Checking critical endpoints...${NC}"

# Check home page
home_status=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL/" 2>/dev/null || echo "000")
if [ "$home_status" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Home page: HTTP $home_status"
else
  echo -e "  ${RED}❌${NC} Home page: HTTP $home_status"
fi

# Check tickets page
tickets_status=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL/tickets" 2>/dev/null || echo "000")
if [ "$tickets_status" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Tickets page: HTTP $tickets_status"
else
  echo -e "  ${YELLOW}⚠️${NC} Tickets page: HTTP $tickets_status"
fi

# Check API gallery endpoint
gallery_status=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL/api/gallery" 2>/dev/null || echo "000")
if [ "$gallery_status" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Gallery API: HTTP $gallery_status"
else
  echo -e "  ${YELLOW}⚠️${NC} Gallery API: HTTP $gallery_status"
fi

# Phase 4: Environment configuration check
echo ""
echo -e "${YELLOW}⏳ Phase 4: Checking environment configuration...${NC}"

if [ "$has_db_url" = "true" ] && [ "$has_auth_token" = "true" ]; then
  echo -e "  ${GREEN}✅${NC} Database configuration: Complete"
else
  echo -e "  ${YELLOW}⚠️${NC} Database configuration: Incomplete"
  if [ "$has_db_url" = "false" ]; then
    echo -e "    ${YELLOW}•${NC} Missing: TURSO_DATABASE_URL"
  fi
  if [ "$has_auth_token" = "false" ]; then
    echo -e "    ${YELLOW}•${NC} Missing: TURSO_AUTH_TOKEN"
  fi
  echo -e "    ${BLUE}ℹ️${NC} Configure these in Vercel dashboard for full functionality"
fi

# Phase 5: Performance check
echo ""
echo -e "${YELLOW}⏳ Phase 5: Performance validation...${NC}"

# Measure response time
start_time=$(date +%s%N)
curl -s -o /dev/null "$DEPLOYMENT_URL/api/health/check?quick=true" 2>/dev/null
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))

if [ $response_time -lt 1000 ]; then
  echo -e "  ${GREEN}✅${NC} Response time: ${response_time}ms (Excellent)"
elif [ $response_time -lt 2000 ]; then
  echo -e "  ${YELLOW}⚠️${NC} Response time: ${response_time}ms (Acceptable)"
else
  echo -e "  ${RED}❌${NC} Response time: ${response_time}ms (Slow)"
fi

# Final summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$status" = "healthy" ] || [ "$status" = "degraded" ]; then
  echo -e "${GREEN}✅ Deployment health check PASSED${NC}"
  echo -e "${GREEN}🎉 Deployment is operational at: $DEPLOYMENT_URL${NC}"
  
  if [ "$has_db_url" = "false" ] || [ "$has_auth_token" = "false" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Next Steps:${NC}"
    echo -e "${YELLOW}   1. Configure database environment variables in Vercel dashboard${NC}"
    echo -e "${YELLOW}   2. Redeploy to enable full functionality${NC}"
  fi
  
  exit 0
else
  echo -e "${RED}❌ Deployment health check FAILED${NC}"
  echo -e "${RED}   Status: $status${NC}"
  echo -e "${RED}   Please check deployment logs for details${NC}"
  exit 1
fi