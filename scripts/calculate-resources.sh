#!/bin/bash
# Resource Calculation Helper Script
# Usage: ./scripts/calculate-resources.sh <memory_profile> <timeout_profile> <browser> <environment>

set -e

# Default values
MEMORY_PROFILE=${1:-standard}
TIMEOUT_PROFILE=${2:-standard}
BROWSER=${3:-chromium}
ENVIRONMENT=${4:-ci}

# Check if config file exists
if [ ! -f ".github/browser-matrix-config.yml" ]; then
    echo "Error: Browser matrix config file not found"
    exit 1
fi

# Install yq if not available
if ! command -v yq &> /dev/null; then
    echo "Installing yq for YAML parsing..."
    sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 2>/dev/null || {
        curl -L https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -o /tmp/yq
        sudo mv /tmp/yq /usr/local/bin/yq
    }
    sudo chmod +x /usr/local/bin/yq
fi

# Get base values from profiles
MEMORY_MB=$(yq eval ".resource_management.memory_profiles.${MEMORY_PROFILE}.memory_mb" .github/browser-matrix-config.yml)
JOB_TIMEOUT=$(yq eval ".resource_management.timeout_profiles.${TIMEOUT_PROFILE}.job_timeout_minutes" .github/browser-matrix-config.yml)
NODE_OPTIONS=$(yq eval ".resource_management.memory_profiles.${MEMORY_PROFILE}.node_options" .github/browser-matrix-config.yml)

# Apply browser multipliers
BROWSER_MEMORY_MULT=$(yq eval ".resource_management.browser_resources.${BROWSER}.memory_multiplier" .github/browser-matrix-config.yml)
BROWSER_TIMEOUT_MULT=$(yq eval ".resource_management.browser_resources.${BROWSER}.timeout_multiplier" .github/browser-matrix-config.yml)

# Apply environment multipliers
ENV_TIMEOUT_MULT=$(yq eval ".resource_management.environment_multipliers.${ENVIRONMENT}.timeout_multiplier" .github/browser-matrix-config.yml)
ENV_MEMORY_BUFFER=$(yq eval ".resource_management.environment_multipliers.${ENVIRONMENT}.memory_buffer_mb" .github/browser-matrix-config.yml)

# Calculate final values
FINAL_MEMORY=$((MEMORY_MB + ENV_MEMORY_BUFFER))
FINAL_TIMEOUT=$(echo "$JOB_TIMEOUT * $BROWSER_TIMEOUT_MULT * $ENV_TIMEOUT_MULT" | bc -l | cut -d. -f1)
FINAL_NODE_OPTIONS="--max-old-space-size=${FINAL_MEMORY}"

# Output results
echo "==============================================="
echo "Resource Calculation Results"
echo "==============================================="
echo "Input Parameters:"
echo "  Memory Profile: $MEMORY_PROFILE"
echo "  Timeout Profile: $TIMEOUT_PROFILE"
echo "  Browser: $BROWSER"
echo "  Environment: $ENVIRONMENT"
echo ""
echo "Base Values:"
echo "  Base Memory: ${MEMORY_MB}MB"
echo "  Base Timeout: ${JOB_TIMEOUT} minutes"
echo ""
echo "Multipliers:"
echo "  Browser Memory: ${BROWSER_MEMORY_MULT}x"
echo "  Browser Timeout: ${BROWSER_TIMEOUT_MULT}x"
echo "  Environment Timeout: ${ENV_TIMEOUT_MULT}x"
echo "  Environment Memory Buffer: ${ENV_MEMORY_BUFFER}MB"
echo ""
echo "Final Calculated Values:"
echo "  Memory: ${FINAL_MEMORY}MB"
echo "  Timeout: ${FINAL_TIMEOUT} minutes"
echo "  Node Options: $FINAL_NODE_OPTIONS"
echo "==============================================="

# Export for GitHub Actions if requested
if [ "${GITHUB_ACTIONS}" = "true" ]; then
    echo "memory_mb=$FINAL_MEMORY" >> $GITHUB_OUTPUT
    echo "timeout_minutes=$FINAL_TIMEOUT" >> $GITHUB_OUTPUT
    echo "node_options=$FINAL_NODE_OPTIONS" >> $GITHUB_OUTPUT
    
    # Also set environment variables
    echo "NODE_OPTIONS=$FINAL_NODE_OPTIONS" >> $GITHUB_ENV
fi