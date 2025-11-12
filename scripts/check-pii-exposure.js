#!/usr/bin/env node

/**
 * PII Exposure Detection Script
 *
 * Scans JavaScript files for potential PII exposure in logging statements.
 * Used by both pre-commit hooks and CI/CD quality gates.
 *
 * Exit Codes:
 * - 0: No PII exposure detected
 * - 1: PII exposure detected (blocking violations)
 * - 2: PII warnings only (non-blocking)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';
import { execSync } from 'child_process';

// PII patterns to detect in logging statements
const PII_PATTERNS = {
  // Direct property access on objects (e.g., user.email, data.password)
  directAccess: /\.(email|password|phone|ssn|creditCard|credit_card|firstName|first_name|lastName|last_name|dob|dateOfBirth|address)/i,

  // Variable names that likely contain PII (only in template literals or concatenations)
  variableNames: /\$\{[^}]*(email|password|phone|ssn|creditCard|userEmail|userPhone|customerEmail)[^}]*\}|`[^`]*\$\{[^}]*(email|password|phone|ssn|creditCard)[^}]*\}[^`]*`/i,

  // Template literals with PII fields
  templateLiterals: /\$\{[^}]*\.(email|password|phone|firstName|lastName)[^}]*\}/i,
};

// Patterns that indicate safe PII handling
const SAFE_PATTERNS = {
  // Using maskEmail() utility
  maskEmail: /maskEmail\s*\(/,

  // Using sanitization utilities
  sanitize: /sanitize\w+\s*\(/,

  // Sentry sanitization
  sentry: /beforeSend|sanitizeEvent/,

  // Already masked/redacted
  masked: /\[REDACTED\]|\[EMAIL\]|\[PHONE\]|\*\*\*/,

  // Non-PII email variables (booleans, counts, IDs)
  nonPII: /\$\{(skipOrderEmail|skipAttendeeEmails|attendeeEmailsSent|emailTasks\.length|email\.id)\}/,
};

// Files/directories to exclude from scanning
const EXCLUDE_PATTERNS = [
  /(^|[\\\/])node_modules[\\\/]/,
  /(^|[\\\/])\.git[\\\/]/,
  /(^|[\\\/])__tests__[\\\/]/,
  /(^|[\\\/])(tests?|specs?|mocks?|fixtures?)[\\\/]/i,
  /\.(test|spec|mock|fixture)\.(js|jsx|ts|tsx)$/i,
  /sentry-config\.js$/,  // Sentry config handles PII by design
  /gdpr-compliance-service\.js$/,  // GDPR service handles PII by design
  /volunteer-helpers\.js$/,  // Contains maskEmail() utility with examples
  /admin-audit-middleware\.js$/,  // Audit middleware handles PII by design
  /payment-sanitization\.js$/,  // Sanitization utility with examples
];

// Logging functions to check
const LOGGING_FUNCTIONS = [
  'console.log',
  'console.info',
  'console.debug',
  'console.warn',
  'console.error',
  'logger.info',
  'logger.debug',
  'logger.warn',
  'logger.error',
];

/**
 * Check if a file should be excluded from scanning
 */
function shouldExcludeFile(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a line contains safe PII handling
 */
function hasSafePIIHandling(line) {
  return Object.values(SAFE_PATTERNS).some(pattern => pattern.test(line));
}

/**
 * Extract logging statements from a line of code
 */
function extractLoggingStatements(line) {
  const statements = [];

  for (const logFunc of LOGGING_FUNCTIONS) {
    // Match logging function with its full statement
    const regex = new RegExp(`${logFunc.replace('.', '\\.')}\\s*\\([^)]*\\)`, 'g');
    const matches = line.match(regex);

    if (matches) {
      statements.push(...matches);
    }
  }

  return statements;
}

/**
 * Check a single line for PII exposure
 */
function checkLineForPII(line, lineNumber) {
  // Skip if line has safe PII handling
  if (hasSafePIIHandling(line)) {
    return null;
  }

  // Extract logging statements
  const statements = extractLoggingStatements(line);

  if (statements.length === 0) {
    return null;
  }

  // Check each statement for PII patterns
  for (const statement of statements) {
    // Check for direct property access (user.email)
    if (PII_PATTERNS.directAccess.test(statement)) {
      return {
        line: lineNumber,
        code: line.trim(),
        pattern: 'direct-access',
        severity: 'error',
        message: 'Direct PII property access in logging statement',
      };
    }

    // Check for PII variable names
    if (PII_PATTERNS.variableNames.test(statement)) {
      return {
        line: lineNumber,
        code: line.trim(),
        pattern: 'variable-name',
        severity: 'error',
        message: 'PII variable in logging statement - use maskEmail() or sanitization utility',
      };
    }

    // Check for template literals with PII
    if (PII_PATTERNS.templateLiterals.test(statement)) {
      return {
        line: lineNumber,
        code: line.trim(),
        pattern: 'template-literal',
        severity: 'error',
        message: 'PII in template literal',
      };
    }
  }

  return null;
}

/**
 * Scan a single file for PII exposure
 */
function scanFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const violations = [];

    lines.forEach((line, index) => {
      const violation = checkLineForPII(line, index + 1);
      if (violation) {
        violations.push(violation);
      }
    });

    return violations;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Get list of files to scan
 */
function getFilesToScan(stagedOnly = false) {
  const projectRoot = resolve(process.cwd());

  if (stagedOnly) {
    // Get staged files from git
    try {
      const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
        encoding: 'utf8',
        cwd: projectRoot,
      });

      return output
        .split('\n')
        .filter(file => file.endsWith('.js') && file.length > 0)
        .map(file => resolve(projectRoot, file))
        .filter(file => existsSync(file) && !shouldExcludeFile(file));
    } catch (error) {
      console.error('Error getting staged files:', error.message);
      return [];
    }
  } else {
    // Scan all JS files in lib/, api/, js/ directories
    const directories = ['lib', 'api', 'js'];
    const files = [];

    for (const dir of directories) {
      const dirPath = resolve(projectRoot, dir);
      if (!existsSync(dirPath)) continue;

      try {
        const output = execSync(`find ${dirPath} -name "*.js" -type f`, {
          encoding: 'utf8',
          cwd: projectRoot,
        });

        const dirFiles = output
          .split('\n')
          .filter(file => file.length > 0)
          .map(file => resolve(projectRoot, file))
          .filter(file => !shouldExcludeFile(file));

        files.push(...dirFiles);
      } catch (error) {
        // Directory might not exist or find command failed
        continue;
      }
    }

    return files;
  }
}

/**
 * Format violations for display
 */
function formatViolations(violations, projectRoot) {
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  let output = '';

  if (errors.length > 0) {
    output += '\n❌ PII EXPOSURE DETECTED (Blocking)\n';
    output += '━'.repeat(50) + '\n\n';

    errors.forEach(({ file, line, code, message }) => {
      const relPath = relative(projectRoot, file);
      output += `📁 ${relPath}:${line}\n`;
      output += `   ${message}\n`;
      output += `   ${code}\n\n`;
    });

    output += '💡 Fix: Use maskEmail() or sanitization utilities\n';
    output += '   Example: console.log("User:", maskEmail(user.email))\n\n';
  }

  if (warnings.length > 0) {
    output += '⚠️  PII WARNINGS (Non-blocking)\n';
    output += '━'.repeat(50) + '\n\n';

    warnings.forEach(({ file, line, code, message }) => {
      const relPath = relative(projectRoot, file);
      output += `📁 ${relPath}:${line}\n`;
      output += `   ${message}\n`;
      output += `   ${code}\n\n`;
    });

    output += '💡 Consider: Verify if PII is properly sanitized\n\n';
  }

  return output;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const stagedOnly = args.includes('--staged');
  const jsonOutput = args.includes('--json');
  const projectRoot = resolve(process.cwd());

  console.error('🔐 Scanning for PII exposure in code...\n');

  const files = getFilesToScan(stagedOnly);

  if (files.length === 0) {
    console.error('ℹ️  No JavaScript files to scan\n');
    process.exit(0);
  }

  console.error(`📊 Scanning ${files.length} files...\n`);

  const allViolations = [];

  files.forEach(file => {
    const violations = scanFile(file);
    if (violations.length > 0) {
      violations.forEach(v => {
        allViolations.push({ file, ...v });
      });
    }
  });

  if (jsonOutput) {
    // JSON output for CI/CD integration
    console.log(JSON.stringify({
      scanned: files.length,
      violations: allViolations.length,
      errors: allViolations.filter(v => v.severity === 'error').length,
      warnings: allViolations.filter(v => v.severity === 'warning').length,
      details: allViolations,
    }, null, 2));
  } else {
    // Human-readable output
    if (allViolations.length > 0) {
      const output = formatViolations(allViolations, projectRoot);
      console.log(output);

      const errors = allViolations.filter(v => v.severity === 'error');
      const warnings = allViolations.filter(v => v.severity === 'warning');

      console.error(`📊 Summary: ${errors.length} errors, ${warnings.length} warnings\n`);

      if (errors.length > 0) {
        process.exit(1);  // Blocking violations
      } else {
        process.exit(2);  // Warnings only
      }
    } else {
      console.error('✅ No PII exposure detected\n');
      process.exit(0);
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scanFile, checkLineForPII, getFilesToScan };
