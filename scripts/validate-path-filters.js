#!/usr/bin/env node

/**
 * Path Filter Validation Script
 *
 * Validates the path filter configuration for correctness and completeness:
 * - Checks for valid YAML syntax
 * - Validates path patterns
 * - Ensures comprehensive coverage
 * - Tests filter logic with sample file changes
 * - Reports potential issues and recommendations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

class PathFilterValidator {
    constructor() {
        this.issues = [];
        this.warnings = [];
        this.recommendations = [];
    }

    /**
     * Simple YAML parser for validation
     */
    parseYAML(yamlString) {
        const lines = yamlString.split('\n');
        const result = {};
        let currentPath = [];
        let currentIndent = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith('#')) continue;

            const indent = line.length - line.trimStart().length;

            // Check for YAML syntax issues
            if (line.includes('\t')) {
                this.issues.push(`Line ${i + 1}: Uses tabs instead of spaces for indentation`);
            }

            if (trimmed.includes(':')) {
                const [key, ...valueParts] = trimmed.split(':');
                const value = valueParts.join(':').trim();

                if (indent <= currentIndent) {
                    currentPath = currentPath.slice(0, Math.floor(indent / 2));
                }

                if (value) {
                    this.setNestedValue(result, [...currentPath, key], value);
                } else {
                    this.setNestedValue(result, [...currentPath, key], {});
                    currentPath.push(key);
                }

                currentIndent = indent;
            } else if (trimmed.startsWith('- ')) {
                // Array item
                const item = trimmed.substring(2).trim();
                const parentKey = currentPath[currentPath.length - 1];
                if (!Array.isArray(result[parentKey])) {
                    this.setNestedValue(result, currentPath, []);
                }
                const parent = this.getNestedValue(result, currentPath);
                if (Array.isArray(parent)) {
                    parent.push(item);
                }
            }
        }

        return result;
    }

    setNestedValue(obj, path, value) {
        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            if (!(path[i] in current)) {
                current[path[i]] = {};
            }
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
    }

    getNestedValue(obj, path) {
        let current = obj;
        for (const key of path) {
            current = current[key];
            if (current === undefined) return undefined;
        }
        return current;
    }

    /**
     * Load and validate path filter configuration
     */
    async loadAndValidateConfig() {
        console.log('🔍 Loading path filter configuration...');

        try {
            const configPath = path.join(projectRoot, '.github', 'path-filters.yml');
            const configContent = await fs.readFile(configPath, 'utf8');

            // Basic YAML validation
            const config = this.parseYAML(configContent);

            console.log(`✅ Successfully loaded ${Object.keys(config).length} filter definitions`);
            return config;

        } catch (error) {
            this.issues.push(`Failed to load configuration: ${error.message}`);
            return null;
        }
    }

    /**
     * Validate individual path patterns
     */
    validatePathPatterns(config) {
        console.log('🔍 Validating path patterns...');

        let validPatterns = 0;
        let totalPatterns = 0;

        for (const [filterName, patterns] of Object.entries(config)) {
            if (!Array.isArray(patterns)) {
                // Handle nested objects or string values
                if (typeof patterns === 'string') {
                    this.warnings.push(`Filter '${filterName}' has string value instead of array: ${patterns}`);
                }
                continue;
            }

            for (const pattern of patterns) {
                totalPatterns++;

                // Check for common pattern issues
                if (this.validatePattern(pattern, filterName)) {
                    validPatterns++;
                }
            }
        }

        console.log(`✅ Validated ${validPatterns}/${totalPatterns} path patterns`);

        if (this.issues.length === 0) {
            console.log('✅ All path patterns appear valid');
        }
    }

    /**
     * Validate individual pattern
     */
    validatePattern(pattern, filterName) {
        let isValid = true;

        // Check for common issues
        if (pattern.includes('\\') && !pattern.includes('\\\\')) {
            this.warnings.push(`Filter '${filterName}': Pattern '${pattern}' may need escaped backslashes`);
        }

        if (pattern.startsWith('/')) {
            this.warnings.push(`Filter '${filterName}': Pattern '${pattern}' starts with '/' - may not match correctly`);
        }

        if (pattern.includes(' ') && !pattern.includes('"') && !pattern.includes("'")) {
            this.warnings.push(`Filter '${filterName}': Pattern '${pattern}' contains spaces - may need quoting`);
        }

        // Check for overly broad patterns
        if (pattern === '**' || pattern === '*') {
            this.warnings.push(`Filter '${filterName}': Very broad pattern '${pattern}' may match too many files`);
        }

        // Check for potentially redundant patterns
        if (pattern.endsWith('/**') && patterns.includes(pattern.replace('/**', '/**/*'))) {
            this.warnings.push(`Filter '${filterName}': Potentially redundant patterns`);
        }

        return isValid;
    }

    /**
     * Check filter coverage and completeness
     */
    validateCoverage(config) {
        console.log('🔍 Checking filter coverage...');

        const expectedCategories = {
            core: ['frontend', 'backend', 'tests', 'docs', 'ci'],
            specific: ['dependencies', 'config', 'security'],
            triggers: ['ci-triggers', 'e2e-triggers', 'deploy-triggers'],
            smart: ['critical', 'skip-ci', 'docs-only']
        };

        let coverageScore = 0;
        let totalExpected = 0;

        for (const [category, filters] of Object.entries(expectedCategories)) {
            console.log(`\n📂 ${category.toUpperCase()} category:`);

            for (const filterName of filters) {
                totalExpected++;

                if (config[filterName]) {
                    console.log(`  ✅ ${filterName}`);
                    coverageScore++;
                } else {
                    console.log(`  ❌ ${filterName} (missing)`);
                    this.issues.push(`Missing recommended filter: ${filterName}`);
                }
            }
        }

        const coveragePercent = Math.round((coverageScore / totalExpected) * 100);
        console.log(`\n📊 Coverage Score: ${coverageScore}/${totalExpected} (${coveragePercent}%)`);

        if (coveragePercent >= 90) {
            console.log('🎉 Excellent filter coverage!');
        } else if (coveragePercent >= 70) {
            console.log('👍 Good filter coverage');
            this.recommendations.push('Consider adding missing filters for complete coverage');
        } else {
            console.log('⚠️  Low filter coverage - consider adding more filters');
            this.recommendations.push('Add missing core filters for better optimization');
        }
    }

    /**
     * Test filters with sample file changes
     */
    async testFilterLogic(config) {
        console.log('\n🧪 Testing filter logic with sample changes...');

        const testCases = [
            {
                name: 'Frontend-only changes',
                files: ['js/app.js', 'css/style.css', 'pages/index.html'],
                expectedTriggers: ['frontend', 'frontend-js', 'frontend-css', 'frontend-html', 'ci-triggers']
            },
            {
                name: 'Backend-only changes',
                files: ['api/users.js', 'lib/database.js'],
                expectedTriggers: ['backend', 'backend-api', 'backend-lib', 'ci-triggers']
            },
            {
                name: 'Documentation-only changes',
                files: ['README.md', 'docs/setup.md'],
                expectedTriggers: ['docs', 'docs-user', 'skip-ci']
            },
            {
                name: 'Critical changes',
                files: ['package.json', 'SECURITY.md', '.github/workflows/ci.yml'],
                expectedTriggers: ['dependencies', 'security', 'ci', 'critical']
            },
            {
                name: 'Test changes',
                files: ['tests/api.test.js', 'playwright.config.js'],
                expectedTriggers: ['tests', 'tests-unit', 'tests-config']
            }
        ];

        let passedTests = 0;

        for (const testCase of testCases) {
            console.log(`\n🧪 Testing: ${testCase.name}`);
            console.log(`   Files: ${testCase.files.join(', ')}`);

            const triggeredFilters = this.simulateFilterMatching(config, testCase.files);
            console.log(`   Triggered: ${triggeredFilters.join(', ')}`);

            // Check if expected filters were triggered
            const matchedExpected = testCase.expectedTriggers.filter(filter =>
                triggeredFilters.includes(filter)
            );

            const successRate = matchedExpected.length / testCase.expectedTriggers.length;
            console.log(`   Success: ${Math.round(successRate * 100)}% (${matchedExpected.length}/${testCase.expectedTriggers.length})`);

            if (successRate >= 0.8) {
                console.log('   ✅ Test passed');
                passedTests++;
            } else {
                console.log('   ❌ Test failed');
                console.log(`   Missing: ${testCase.expectedTriggers.filter(f => !triggeredFilters.includes(f)).join(', ')}`);
            }
        }

        console.log(`\n📊 Test Results: ${passedTests}/${testCases.length} passed`);

        if (passedTests === testCases.length) {
            console.log('🎉 All filter logic tests passed!');
        } else {
            this.warnings.push('Some filter logic tests failed - review filter patterns');
        }
    }

    /**
     * Simulate filter matching for test files
     */
    simulateFilterMatching(config, files) {
        const triggered = [];

        for (const [filterName, patterns] of Object.entries(config)) {
            if (!Array.isArray(patterns)) continue;

            for (const file of files) {
                for (const pattern of patterns) {
                    if (this.matchesPattern(file, pattern)) {
                        triggered.push(filterName);
                        break;
                    }
                }
                if (triggered.includes(filterName)) break;
            }
        }

        return [...new Set(triggered)]; // Remove duplicates
    }

    /**
     * Simple glob pattern matching
     */
    matchesPattern(file, pattern) {
        // Convert glob pattern to regex (simplified)
        let regex = pattern
            .replace(/\*\*/g, '.*')      // ** matches anything including /
            .replace(/\*/g, '[^/]*')     // * matches anything except /
            .replace(/\?/g, '[^/]')      // ? matches single character except /
            .replace(/\./g, '\\.');      // Escape dots

        // Handle negation patterns
        if (pattern.startsWith('!')) {
            regex = regex.substring(1);
            return !new RegExp(`^${regex}$`).test(file);
        }

        return new RegExp(`^${regex}$`).test(file);
    }

    /**
     * Check for potential optimizations
     */
    suggestOptimizations(config) {
        console.log('\n💡 Optimization Suggestions:');

        // Check for overlapping patterns
        const allPatterns = [];
        for (const [filterName, patterns] of Object.entries(config)) {
            if (Array.isArray(patterns)) {
                patterns.forEach(pattern => {
                    allPatterns.push({ filter: filterName, pattern });
                });
            }
        }

        // Look for very similar patterns that could be consolidated
        const patternGroups = {};
        allPatterns.forEach(({ filter, pattern }) => {
            const base = pattern.replace(/\*+/g, '*').replace(/\.\*/g, '*');
            if (!patternGroups[base]) {
                patternGroups[base] = [];
            }
            patternGroups[base].push({ filter, pattern });
        });

        let optimizationCount = 0;

        for (const [base, group] of Object.entries(patternGroups)) {
            if (group.length > 2) {
                console.log(`\n🔧 Consider consolidating similar patterns in ${base}:`);
                group.forEach(({ filter, pattern }) => {
                    console.log(`   ${filter}: ${pattern}`);
                });
                optimizationCount++;
            }
        }

        // Check for missing composite filters
        const coreFilters = ['frontend', 'backend', 'tests'];
        const hasComposite = Object.keys(config).some(key =>
            key.includes('fullstack') || key.includes('complete') || key.includes('all')
        );

        if (!hasComposite) {
            console.log('\n🔧 Consider adding composite filters:');
            console.log('   fullstack: Combined frontend + backend triggers');
            console.log('   complete: All core areas for comprehensive changes');
            optimizationCount++;
        }

        if (optimizationCount === 0) {
            console.log('✅ Configuration appears well-optimized!');
        } else {
            this.recommendations.push(`Found ${optimizationCount} potential optimizations`);
        }
    }

    /**
     * Generate validation report
     */
    generateReport() {
        console.log('\n📋 Path Filter Validation Report');
        console.log('='.repeat(50));

        if (this.issues.length === 0) {
            console.log('✅ No critical issues found');
        } else {
            console.log(`❌ ${this.issues.length} critical issues found:`);
            this.issues.forEach((issue, i) => {
                console.log(`  ${i + 1}. ${issue}`);
            });
        }

        if (this.warnings.length > 0) {
            console.log(`\n⚠️  ${this.warnings.length} warnings:`);
            this.warnings.forEach((warning, i) => {
                console.log(`  ${i + 1}. ${warning}`);
            });
        }

        if (this.recommendations.length > 0) {
            console.log(`\n💡 ${this.recommendations.length} recommendations:`);
            this.recommendations.forEach((rec, i) => {
                console.log(`  ${i + 1}. ${rec}`);
            });
        }

        const overallScore = this.calculateOverallScore();
        console.log(`\n🎯 Overall Score: ${overallScore}/100`);

        if (overallScore >= 90) {
            console.log('🎉 Excellent! Ready for production');
        } else if (overallScore >= 75) {
            console.log('👍 Good! Minor improvements recommended');
        } else if (overallScore >= 60) {
            console.log('⚠️  Needs improvement before production use');
        } else {
            console.log('❌ Significant issues - not ready for production');
        }

        return overallScore >= 75;
    }

    calculateOverallScore() {
        let score = 100;

        // Deduct for issues and warnings
        score -= this.issues.length * 15;      // Critical issues
        score -= this.warnings.length * 5;     // Warnings
        score -= this.recommendations.length * 2; // Minor improvements

        return Math.max(0, score);
    }
}

// CLI Interface
async function main() {
    console.log('🔍 Path Filter Configuration Validator');
    console.log('=====================================');

    const validator = new PathFilterValidator();

    try {
        // Load and validate configuration
        const config = await validator.loadAndValidateConfig();
        if (!config) {
            console.error('❌ Cannot proceed without valid configuration');
            process.exit(1);
        }

        // Run all validations
        validator.validatePathPatterns(config);
        validator.validateCoverage(config);
        await validator.testFilterLogic(config);
        validator.suggestOptimizations(config);

        // Generate final report
        const isReady = validator.generateReport();

        process.exit(isReady ? 0 : 1);

    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        if (process.env.DEBUG) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { PathFilterValidator };