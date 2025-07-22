#!/bin/bash

# A Lo Cubano Boulder Fest - Link Check Script
# Convenient wrapper for link validation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default options
VERBOSE=false
CHECK_EXTERNAL=true
JSON_OUTPUT=false
OUTPUT_DIR="$ROOT_DIR/test-reports"
CI_MODE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --no-external)
            CHECK_EXTERNAL=false
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --ci)
            CI_MODE=true
            shift
            ;;
        -o|--output-dir)
            OUTPUT_DIR="$2"
            shift
            shift
            ;;
        -h|--help)
            echo "A Lo Cubano Boulder Fest - Link Validation"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose      Enable verbose output"
            echo "  --no-external      Skip external link checking"
            echo "  --json             Generate JSON report"
            echo "  --ci               Run in CI mode"
            echo "  -o, --output-dir   Output directory for reports"
            echo "  -h, --help         Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                           # Basic link checking"
            echo "  $0 --verbose                 # Verbose output"
            echo "  $0 --no-external             # Skip external links"
            echo "  $0 --json --ci               # CI mode with JSON output"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

# Print header
echo -e "${BLUE}🔗 A Lo Cubano Boulder Fest - Link Validation${NC}"
echo -e "${BLUE}===============================================${NC}"
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    exit 1
fi

# Change to project root
cd "$ROOT_DIR"

# Build command arguments
ARGS=()

if [ "$VERBOSE" = true ]; then
    ARGS+=(--verbose)
fi

if [ "$CHECK_EXTERNAL" = false ]; then
    ARGS+=(--no-external)
fi

if [ "$JSON_OUTPUT" = true ]; then
    ARGS+=(--json)
fi

ARGS+=(--output-dir "$OUTPUT_DIR")

# Run the appropriate script
if [ "$CI_MODE" = true ]; then
    echo -e "${YELLOW}Running in CI mode...${NC}"
    node tests/ci-link-check.js
else
    echo -e "${YELLOW}Running link validation...${NC}"
    node tests/run-link-tests.js "${ARGS[@]}"
fi

# Check exit code and provide feedback
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 Link validation completed successfully!${NC}"
    
    # Show report location if generated
    if [ -d "$OUTPUT_DIR" ] && [ "$(ls -A "$OUTPUT_DIR" 2>/dev/null)" ]; then
        echo -e "${BLUE}📄 Reports saved to: $OUTPUT_DIR${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ Link validation failed. Please check the output above for details.${NC}"
    
    # Show report location if generated
    if [ -d "$OUTPUT_DIR" ] && [ "$(ls -A "$OUTPUT_DIR" 2>/dev/null)" ]; then
        echo -e "${BLUE}📄 Detailed reports saved to: $OUTPUT_DIR${NC}"
    fi
fi

exit $EXIT_CODE