#!/bin/bash

echo "🔍 Checking Test Structure..."
echo ""
echo "📂 Test directories:"
ls -la tests/ 2>/dev/null || echo "  ❌ tests/ directory not found"

echo ""
echo "📝 Test files in tests/:"
find tests -name "*.test.js" -type f 2>/dev/null | head -20 || echo "  ❌ No test files found"

echo ""
echo "📊 Test file count by directory:"
for dir in tests/unit tests/integration tests/e2e; do
  if [ -d "$dir" ]; then
    count=$(find "$dir" -name "*.test.js" -type f 2>/dev/null | wc -l)
    echo "  $dir: $count files"
  else
    echo "  $dir: ❌ Directory not found"
  fi
done

echo ""
echo "🔧 Config files:"
ls -la tests/*.js tests/config/*.js 2>/dev/null || echo "  ❌ No config files found"