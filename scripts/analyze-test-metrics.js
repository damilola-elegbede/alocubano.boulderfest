import fs from 'fs';

const rawOutput = fs.readFileSync('/tmp/test_output.log', 'utf-8');

const metrics = {
  totalTestFiles: rawOutput.match(/tests\/\w+\/[\w-]+\.test\.js/g)?.length || 0,
  testCategories: {
    unit: rawOutput.match(/tests\/unit\/[\w-]+\.test\.js/g)?.length || 0,
    integration: rawOutput.match(/tests\/integration\/[\w-]+\.test\.js/g)?.length || 0,
    performance: rawOutput.match(/tests\/performance\/[\w-]+\.test\.js/g)?.length || 0,
    security: rawOutput.match(/tests\/security\/[\w-]+\.test\.js/g)?.length || 0
  },
  testExecutionTime: 23.425,
  testsPassed: (rawOutput.match(/✓/g) || []).length,
  testsSkipped: (rawOutput.match(/↓/g) || []).length,
  testsFailed: (rawOutput.match(/❌/g) || []).length
};

fs.writeFileSync('/Users/damilola/Documents/Projects/alocubano.boulderfest/.tmp/test-infrastructure-rebuild/validation-report.json', JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
