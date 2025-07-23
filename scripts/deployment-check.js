/**
 * Deployment Quality Gate Check
 * Validates all requirements before deployment
 */

import { execSync } from 'child_process';
import fs from 'fs';

const DeploymentCheck = {
  // Validate test coverage meets requirements
  validateCoverage: () => {
    console.log('📊 Validating test coverage...');
    try {
      execSync('npm run test:coverage:threshold', { stdio: 'pipe' });
      console.log('✅ Coverage requirements met');
      return true;
    } catch (error) {
      console.log('❌ Coverage requirements not met');
      return false;
    }
  },

  // Validate no flaky tests
  validateTestStability: () => {
    console.log('🔍 Validating test stability...');
    try {
      execSync('node scripts/test-maintenance.js flaky', { stdio: 'pipe' });
      console.log('✅ No flaky tests detected');
      return true;
    } catch (error) {
      console.log('❌ Flaky tests detected');
      return false;
    }
  },

  // Validate performance benchmarks
  validatePerformance: () => {
    console.log('⚡ Validating performance benchmarks...');
    try {
      execSync('npm run test:performance', { stdio: 'pipe' });
      console.log('✅ Performance benchmarks met');
      return true;
    } catch (error) {
      console.log('❌ Performance benchmarks not met');
      return false;
    }
  },

  // Run comprehensive deployment check
  runDeploymentCheck: () => {
    console.log('🚀 Running deployment quality gate check...');
    
    const checks = [
      { name: 'Coverage', check: DeploymentCheck.validateCoverage },
      { name: 'Test Stability', check: DeploymentCheck.validateTestStability },
      { name: 'Performance', check: DeploymentCheck.validatePerformance }
    ];
    
    let allPassed = true;
    const results = [];
    
    for (const { name, check } of checks) {
      const passed = check();
      results.push({ name, passed });
      if (!passed) allPassed = false;
    }
    
    // Generate deployment report
    const report = {
      timestamp: new Date().toISOString(),
      overallResult: allPassed ? 'PASS' : 'FAIL',
      checks: results
    };
    
    fs.writeFileSync('deployment-check-report.json', JSON.stringify(report, null, 2));
    
    if (allPassed) {
      console.log('✅ All deployment checks passed - Ready for deployment');
      process.exit(0);
    } else {
      console.log('❌ Deployment checks failed - Deployment blocked');
      process.exit(1);
    }
  }
};

DeploymentCheck.runDeploymentCheck();