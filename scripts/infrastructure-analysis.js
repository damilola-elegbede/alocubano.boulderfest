import { readdir, stat, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function analyzeTestInfrastructure() {
  const results = {
    timestamp: new Date().toISOString(),
    totalLines: 0,
    fileCount: 0,
    managerClasses: [],
    utilities: [],
    complexityScore: 0,
    dependencies: {}
  };

  // Analyze test utilities
  const paths = ['./tests/utils', './tests/config', './tests/mocks'];
  
  for (const dirPath of paths) {
    const files = await readdir(dirPath).catch((err) => {
      console.warn(`⚠️ Could not read directory ${dirPath}: ${err.message}`);
      return [];
    });
    
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      
      const filePath = join(dirPath, file);
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n').length;
      
      results.totalLines += lines;
      results.fileCount++;
      
      // Detect manager classes (elimination targets)
      if (content.match(/class.*(?:Manager|Orchestrator|Coordinator)/)) {
        results.managerClasses.push({
          file: filePath,
          lines,
          className: extractClassName(content),
          complexity: calculateComplexity(content),
          dependencies: extractDependencies(content)
        });
      }
      
      // Track all utilities
      results.utilities.push({
        file: filePath,
        lines,
        functions: extractFunctions(content),
        category: categorizeUtility(file, content)
      });
    }
  }
  
  // Generate comprehensive report
  const report = generateReport(results);
  await writeFile('./docs/INFRASTRUCTURE_INVENTORY.md', report);
  // Ensure dependencies is serializable
  const jsonResults = {
    ...results,
    dependencies: results.dependencies || {}
  };
  await writeFile('./docs/infrastructure-metrics.json', JSON.stringify(jsonResults, null, 2));
  
  return results;
}

function calculateComplexity(content) {
  const conditions = (content.match(/if\s*\(|while\s*\(|for\s*\(|\?\s*:/g) || []).length;
  const functions = (content.match(/function\s+\w+|=>\s*{/g) || []).length;
  const asyncPatterns = (content.match(/async|await|Promise|then\(/g) || []).length;
  return conditions + functions + Math.floor(asyncPatterns / 2);
}

function extractClassName(content) {
  const match = content.match(/class\s+(\w+)/);
  return match ? match[1] : 'Unknown';
}

function categorizeUtility(filename, content) {
  if (filename.includes('database') || filename.includes('db')) return 'database';
  if (filename.includes('mock')) return 'mocking';
  if (filename.includes('env')) return 'environment';
  if (filename.includes('helper')) return 'helpers';
  if (content.includes('Manager')) return 'manager';
  return 'other';
}

function generateReport(results) {
  return `# Test Infrastructure Inventory
  
Generated: ${results.timestamp}

## Executive Summary
- **Total Infrastructure**: ${results.totalLines.toLocaleString()} lines
- **File Count**: ${results.fileCount} files
- **Average File Size**: ${Math.round(results.totalLines / results.fileCount)} lines
- **Manager Classes**: ${results.managerClasses.length} (${results.managerClasses.reduce((sum, m) => sum + m.lines, 0)} lines)
- **Target Reduction**: ${Math.round(results.totalLines * 0.8)} lines to eliminate

## Manager Classes (Priority Targets)
${results.managerClasses.map(m => `
### ${m.className}
- **File**: ${m.file}
- **Lines**: ${m.lines}
- **Complexity**: ${m.complexity}
- **Action**: DELETE in PR #${getManagerPR(m.className)}`).join('\n')}

## Utility Categories
${Object.entries(groupByCategory(results.utilities)).map(([category, files]) => `
### ${category}
- Files: ${files.length}
- Lines: ${files.reduce((sum, f) => sum + f.lines, 0)}
- Action: ${getActionForCategory(category)}`).join('\n')}

## Elimination Strategy
1. **PR #1**: This inventory and foundation (0 deletions)
2. **PR #2-6**: Manager eliminations (2,624 lines)
3. **PR #7**: Configuration consolidation (500 lines)
4. **PR #8**: Test activation (0 deletions, 49 test fixes)
5. **PR #9-10**: Validation and documentation

## Success Metrics
- [ ] Reduce from ${results.totalLines} to <1,600 lines
- [ ] Eliminate all ${results.managerClasses.length} manager classes
- [ ] Consolidate ${results.fileCount} files to <10 files
- [ ] Activate all 49 skipped tests`;
}

// Helper functions
function extractFunctions(content) {
  const regex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  const functions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    functions.push(match[1] || match[2]);
  }
  return functions;
}

function extractDependencies(content) {
  const regex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
  const deps = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    deps.push(match[1]);
  }
  return deps;
}

function groupByCategory(utilities) {
  return utilities.reduce((acc, util) => {
    acc[util.category] = acc[util.category] || [];
    acc[util.category].push(util);
    return acc;
  }, {});
}

function getManagerPR(className) {
  const prMap = {
    'TestEnvironmentManager': 2,
    'TestSingletonManager': 3,
    'TestMockManager': 5,
    'TestInitializationOrchestrator': 6
  };
  return prMap[className] || 'TBD';
}

function getActionForCategory(category) {
  const actions = {
    'database': 'SIMPLIFY in PR #4 (1,017 → 80 lines)',
    'mocking': 'SIMPLIFY in PR #5 (850 → 100 lines)',
    'environment': 'REPLACE in PR #2 (400 → 30 lines)',
    'manager': 'DELETE in PR #2-6',
    'helpers': 'CONSOLIDATE in PR #7',
    'other': 'REVIEW and consolidate'
  };
  return actions[category] || 'REVIEW';
}

// Run analysis
analyzeTestInfrastructure()
  .then(results => {
    console.log('✅ Infrastructure analysis complete');
    console.log(`📊 Total lines to eliminate: ${Math.round(results.totalLines * 0.8)}`);
  })
  .catch(error => {
    console.error('❌ Infrastructure analysis failed:', error);
    process.exit(1);
  });