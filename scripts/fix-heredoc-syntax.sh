#!/bin/bash

# Fix the heredoc syntax issue in ci-performance-metrics.yml
# This script fixes the broken heredoc on line 165

WORKFLOW_FILE=".github/workflows/ci-performance-metrics.yml"

if [ ! -f "$WORKFLOW_FILE" ]; then
  echo "❌ Workflow file not found: $WORKFLOW_FILE"
  exit 1
fi

echo "🔧 Fixing heredoc syntax in $WORKFLOW_FILE..."

# Create a backup
cp "$WORKFLOW_FILE" "${WORKFLOW_FILE}.backup"

# Fix the heredoc section using sed
# We need to properly handle the command substitution and variable expansion
sed -i '' '163,170d' "$WORKFLOW_FILE"
sed -i '' '162a\
            cat > .tmp/performance/ci-performance-report.json << EOF\
{\
  "timestamp": "$(date -u +\\"%Y-%m-%dT%H:%M:%SZ\\")",\
  "duration": ${EXECUTION_DURATION:-0},\
  "target": ${CI_PERFORMANCE_TARGET},\
  "status": "$([ ${EXECUTION_DURATION:-0} -le ${CI_PERFORMANCE_TARGET} ] && echo \\"pass\\" || echo \\"fail\\")"\
}\
EOF' "$WORKFLOW_FILE"

echo "✅ Heredoc syntax fixed"

# Alternative fix using a more robust approach
cat > fix-performance-report-generation.patch << 'PATCH'
--- a/.github/workflows/ci-performance-metrics.yml
+++ b/.github/workflows/ci-performance-metrics.yml
@@ -161,11 +161,17 @@
            # Create basic performance metrics
            mkdir -p .tmp/performance
-           cat > .tmp/performance/ci-performance-report.json << EOF
-{
-  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
-  "duration": ${EXECUTION_DURATION:-0},
-  "target": ${CI_PERFORMANCE_TARGET},
-  "status": "$(if [ ${EXECUTION_DURATION:-0} -le ${CI_PERFORMANCE_TARGET} ]; then echo "pass"; else echo "fail"; fi)"
-}
-EOF
+           
+           # Generate performance report with proper JSON formatting
+           TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
+           DURATION=${EXECUTION_DURATION:-0}
+           TARGET=${CI_PERFORMANCE_TARGET}
+           if [ $DURATION -le $TARGET ]; then
+             STATUS="pass"
+           else
+             STATUS="fail"
+           fi
+           
+           echo "{\"timestamp\":\"$TIMESTAMP\",\"duration\":$DURATION,\"target\":$TARGET,\"status\":\"$STATUS\"}" | \
+             jq '.' > .tmp/performance/ci-performance-report.json
+           
          fi
PATCH

echo "📝 Alternative patch created as fix-performance-report-generation.patch"
echo "   Apply with: patch -p1 < fix-performance-report-generation.patch"