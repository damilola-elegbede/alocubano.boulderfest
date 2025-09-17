#!/bin/bash
# Test Cleanup Script - Clean up hanging vitest processes and memory

echo "🧹 Cleaning up test processes and memory..."

# Kill hanging vitest processes
echo "1. Killing vitest processes..."
pkill -f "vitest" 2>/dev/null && echo "   ✅ Killed vitest processes" || echo "   ℹ️ No vitest processes found"

# Kill any node test processes
echo "2. Killing node test processes..."
pkill -f "node.*test" 2>/dev/null && echo "   ✅ Killed node test processes" || echo "   ℹ️ No node test processes found"

# Clean test database files
echo "3. Cleaning test database files..."
rm -rf data/test-*.db* 2>/dev/null && echo "   ✅ Cleaned test database files" || echo "   ℹ️ No test database files found"

# Clean temporary files
echo "4. Cleaning temporary files..."
rm -rf .tmp/* 2>/dev/null && echo "   ✅ Cleaned .tmp directory" || echo "   ℹ️ No temp files found"

# Clean vitest cache
echo "5. Cleaning vitest cache..."
rm -rf node_modules/.vitest node_modules/.cache/vitest 2>/dev/null && echo "   ✅ Cleaned vitest cache" || echo "   ℹ️ No vitest cache found"

# Show current process status
echo "6. Checking remaining processes..."
REMAINING=$(ps aux | grep -E "(vitest|node.*test)" | grep -v grep | wc -l)
if [ "$REMAINING" -eq 0 ]; then
    echo "   ✅ All test processes cleaned up"
else
    echo "   ⚠️ $REMAINING test processes still running:"
    ps aux | grep -E "(vitest|node.*test)" | grep -v grep | head -5
fi

# Show memory usage
echo "7. Current directory sizes:"
du -sh data/ .tmp/ 2>/dev/null || echo "   ℹ️ Directories cleaned"

echo "🎉 Cleanup complete!"