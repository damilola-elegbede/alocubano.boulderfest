import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Configuration Validation', () => {
  test('single vitest config exists', () => {
    expect(existsSync('vitest.config.js')).toBe(true);
    
    // No other configs should exist
    expect(existsSync('vitest.integration.config.js')).toBe(false);
    expect(existsSync('vitest.performance.config.js')).toBe(false);
    expect(existsSync('vitest.security.config.js')).toBe(false);
    expect(existsSync('vitest.unit.config.js')).toBe(false);
    expect(existsSync('vitest.e2e.config.js')).toBe(false);
  });
  
  test('package.json has minimal scripts', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const testScripts = Object.keys(pkg.scripts).filter(k => k.includes('test'));
    
    // Should have minimal test scripts
    expect(testScripts.length).toBeLessThanOrEqual(6);
    expect(pkg.scripts.test).toBe('vitest run');
    
    // Key scripts should exist
    expect(pkg.scripts['test:coverage']).toBeDefined();
    expect(pkg.scripts['test:watch']).toBeDefined();
    
    // CI-specific scripts should be removed
    expect(pkg.scripts['test:unit:ci']).toBeUndefined();
    expect(pkg.scripts['test:integration:ci']).toBeUndefined();
    expect(pkg.scripts['test:performance:ci']).toBeUndefined();
    expect(pkg.scripts['test:security:ci']).toBeUndefined();
  });
  
  test('no environment detection in config', () => {
    const config = readFileSync('vitest.config.js', 'utf8');
    
    // Should not contain CI-specific logic
    expect(config).not.toContain('process.env.CI');
    expect(config).not.toContain('TEST_CI_EXCLUDE_PATTERNS');
    expect(config).not.toContain("process.env.NODE_ENV === 'test'");
    expect(config).not.toContain('isCI');
    
    // Should not have conditional configurations except for reporters
    expect(config).not.toContain('if (');
    
    // Allow reporter configuration ternary but not others
    const ternaryCount = (config.match(/\?/g) || []).length;
    expect(ternaryCount).toBeLessThanOrEqual(1); // Only for reporters
    expect(config).toContain('github-actions'); // Should have reporter config
  });
  
  test('git hooks match CI commands', () => {
    const hookExists = existsSync('.husky/pre-push');
    const workflowExists = existsSync('.github/workflows/comprehensive-testing.yml');
    
    if (hookExists) {
      const hook = readFileSync('.husky/pre-push', 'utf8');
      // Should use 'npm test'
      expect(hook).toContain('npm test');
      // Should not have CI variants
      expect(hook).not.toContain('test:fast');
      expect(hook).not.toContain('test:unit:ci');
    }
    
    if (workflowExists) {
      const workflow = readFileSync('.github/workflows/comprehensive-testing.yml', 'utf8');
      // Should use 'npm test'
      expect(workflow).toContain('npm test');
      // Should not have CI variants
      expect(workflow).not.toContain('test:unit:ci');
      expect(workflow).not.toContain('test:integration:ci');
    }
  });
  
  test('vitest config has unified settings', () => {
    const config = readFileSync('vitest.config.js', 'utf8');
    
    // Should have pool configuration
    expect(config).toContain('pool:');
    expect(config).toContain('forks');
    expect(config).toContain('maxForks: 2');
    
    // Should have setupFiles
    expect(config).toContain('setupFiles');
    
    // Should have coverage configuration
    expect(config).toContain('coverage');
    expect(config).toContain('thresholds');
  });
  
  test('no redundant test directories or files', () => {
    // Should not have separate config directories
    expect(existsSync('tests/config')).toBe(false);
    expect(existsSync('config/vitest')).toBe(false);
    
    // Should not have type-specific setup files
    expect(existsSync('tests/setup/integration.js')).toBe(false);
    expect(existsSync('tests/setup/performance.js')).toBe(false);
    expect(existsSync('tests/setup/security.js')).toBe(false);
  });
  
  test('coverage configuration is unified', () => {
    const config = readFileSync('vitest.config.js', 'utf8');
    
    // Should have single coverage configuration
    const coverageMatches = config.match(/coverage\s*:/g);
    expect(coverageMatches).toHaveLength(1);
    
    // Should include all test types in coverage
    expect(config).toContain('include');
    expect(config).toContain('exclude');
  });
  
  test('test patterns are consolidated', () => {
    const config = readFileSync('vitest.config.js', 'utf8');
    
    // Should have unified include pattern
    expect(config).toContain('include');
    
    // Should not have type-specific patterns
    expect(config).not.toContain('integration/**');
    expect(config).not.toContain('performance/**');
    expect(config).not.toContain('security/**');
  });
});