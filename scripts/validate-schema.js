#!/usr/bin/env node

/**
 * Database Schema Validation Script
 * Validates database schema matches application requirements and scans codebase for column references
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { getDatabase } from '../api/lib/database.js';

class SchemaValidator {
  constructor() {
    this.database = getDatabase();
    this.codebaseRoot = process.cwd();
    this.requiredColumns = {
      tickets: [
        'id', 'ticket_id', 'transaction_id', 'ticket_type', 'event_id',
        'event_date', 'price_cents', 'attendee_first_name', 'attendee_last_name',
        'attendee_email', 'attendee_phone', 'status', 'validation_code',
        'checked_in_at', 'checked_in_by', 'check_in_location', 'ticket_metadata',
        'created_at', 'updated_at', 'qr_token', 'qr_code_generated_at',
        'scan_count', 'max_scan_count', 'first_scanned_at', 'last_scanned_at',
        'qr_access_method', 'wallet_source', 'apple_pass_serial', 'google_pass_id',
        'wallet_pass_generated_at', 'wallet_pass_updated_at', 'wallet_pass_revoked_at',
        'wallet_pass_revoked_reason'
      ],
      transactions: [
        'id', 'transaction_id', 'status', 'payment_intent_id', 'amount_cents',
        'currency', 'customer_email', 'customer_name', 'customer_phone',
        'created_at', 'updated_at'
      ],
      subscribers: [
        'id', 'email', 'first_name', 'last_name', 'status', 'subscribed_at',
        'unsubscribed_at', 'marketing_consent', 'data_processing_consent',
        'created_at', 'updated_at'
      ]
    };
    
    this.requiredIndexes = {
      tickets: [
        'idx_tickets_wallet_source',
        'idx_tickets_qr_access_method',
        'idx_tickets_ticket_id_status',
        'idx_tickets_scan_validation',
        'idx_tickets_validation_composite'
      ]
    };
    
    this.columnDataTypes = {
      tickets: {
        wallet_source: 'TEXT',
        qr_access_method: 'TEXT',
        scan_count: 'INTEGER',
        max_scan_count: 'INTEGER'
      }
    };
  }

  /**
   * Get all columns for a table
   */
  async getTableColumns(tableName) {
    try {
      const result = await this.database.execute(
        `SELECT * FROM pragma_table_info('${tableName}')`
      );
      
      return result.rows.map(row => ({
        name: row.name,
        type: row.type,
        notNull: row.notnull === 1,
        defaultValue: row.dflt_value,
        isPrimaryKey: row.pk === 1
      }));
    } catch (error) {
      console.error(`Failed to get columns for table ${tableName}:`, error.message);
      return [];
    }
  }

  /**
   * Get all indexes for a table
   */
  async getTableIndexes(tableName) {
    try {
      const result = await this.database.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?",
        [tableName]
      );
      
      return result.rows.map(row => row.name);
    } catch (error) {
      console.error(`Failed to get indexes for table ${tableName}:`, error.message);
      return [];
    }
  }

  /**
   * Scan codebase for database column references
   */
  async scanCodebaseForColumnReferences() {
    const references = {
      found: [],
      missing: [],
      byFile: {}
    };
    
    try {
      // Find all JavaScript files
      const jsFiles = await glob('**/*.js', {
        ignore: ['node_modules/**', 'tests/**', '.next/**', 'dist/**', 'build/**'],
        cwd: this.codebaseRoot
      });
      
      // Regex patterns for finding column references
      const patterns = [
        /\b(wallet_source|qr_access_method)\b/g,
        /SELECT.*?(wallet_source|qr_access_method)/gi,
        /UPDATE.*?SET.*?(wallet_source|qr_access_method)/gi,
        /INSERT.*?(wallet_source|qr_access_method)/gi,
        /\['(wallet_source|qr_access_method)'\]/g,
        /\["(wallet_source|qr_access_method)"\]/g,
        /\.(wallet_source|qr_access_method)\b/g
      ];
      
      for (const file of jsFiles) {
        const filePath = path.join(this.codebaseRoot, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        const fileReferences = new Set();
        
        for (const pattern of patterns) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            const column = match[1] || match[0];
            if (column && (column === 'wallet_source' || column === 'qr_access_method')) {
              fileReferences.add(column);
            }
          }
        }
        
        if (fileReferences.size > 0) {
          references.byFile[file] = Array.from(fileReferences);
          references.found.push(...Array.from(fileReferences).map(col => ({
            file,
            column: col
          })));
        }
      }
      
      // Check SQL files for column references
      const sqlFiles = await glob('**/*.sql', {
        ignore: ['node_modules/**'],
        cwd: this.codebaseRoot
      });
      
      for (const file of sqlFiles) {
        const filePath = path.join(this.codebaseRoot, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        const fileReferences = new Set();
        
        if (content.includes('wallet_source')) {
          fileReferences.add('wallet_source');
        }
        if (content.includes('qr_access_method')) {
          fileReferences.add('qr_access_method');
        }
        
        if (fileReferences.size > 0) {
          references.byFile[file] = Array.from(fileReferences);
          references.found.push(...Array.from(fileReferences).map(col => ({
            file,
            column: col
          })));
        }
      }
      
      return references;
    } catch (error) {
      console.error('Failed to scan codebase:', error.message);
      return references;
    }
  }

  /**
   * Validate column existence
   */
  async validateColumnExistence() {
    const validation = {
      status: 'PASS',
      tables: {},
      missingColumns: [],
      extraColumns: []
    };
    
    for (const [tableName, requiredCols] of Object.entries(this.requiredColumns)) {
      const actualColumns = await this.getTableColumns(tableName);
      const actualColumnNames = actualColumns.map(col => col.name);
      
      validation.tables[tableName] = {
        required: requiredCols.length,
        actual: actualColumnNames.length,
        columns: actualColumnNames
      };
      
      // Check for missing columns
      const missing = requiredCols.filter(col => !actualColumnNames.includes(col));
      if (missing.length > 0) {
        validation.status = 'FAIL';
        validation.missingColumns.push({
          table: tableName,
          columns: missing
        });
      }
      
      // Check for extra columns (not necessarily bad)
      const extra = actualColumnNames.filter(col => !requiredCols.includes(col));
      if (extra.length > 0) {
        validation.extraColumns.push({
          table: tableName,
          columns: extra
        });
      }
    }
    
    return validation;
  }

  /**
   * Validate data types
   */
  async validateDataTypes() {
    const validation = {
      status: 'PASS',
      issues: []
    };
    
    for (const [tableName, columnTypes] of Object.entries(this.columnDataTypes)) {
      const actualColumns = await this.getTableColumns(tableName);
      
      for (const [columnName, expectedType] of Object.entries(columnTypes)) {
        const actualColumn = actualColumns.find(col => col.name === columnName);
        
        if (actualColumn) {
          if (actualColumn.type !== expectedType) {
            validation.status = 'FAIL';
            validation.issues.push({
              table: tableName,
              column: columnName,
              expected: expectedType,
              actual: actualColumn.type
            });
          }
        } else {
          validation.status = 'FAIL';
          validation.issues.push({
            table: tableName,
            column: columnName,
            expected: expectedType,
            actual: 'MISSING'
          });
        }
      }
    }
    
    return validation;
  }

  /**
   * Validate indexes
   */
  async validateIndexes() {
    const validation = {
      status: 'PASS',
      tables: {},
      missingIndexes: []
    };
    
    for (const [tableName, requiredIdxs] of Object.entries(this.requiredIndexes)) {
      const actualIndexes = await this.getTableIndexes(tableName);
      
      validation.tables[tableName] = {
        required: requiredIdxs.length,
        actual: actualIndexes.length,
        indexes: actualIndexes
      };
      
      // Check for missing indexes
      const missing = requiredIdxs.filter(idx => !actualIndexes.includes(idx));
      if (missing.length > 0) {
        validation.status = 'WARN'; // Indexes are warnings, not failures
        validation.missingIndexes.push({
          table: tableName,
          indexes: missing
        });
      }
    }
    
    return validation;
  }

  /**
   * Test query performance
   */
  async testQueryPerformance() {
    const performanceTests = [
      {
        name: 'wallet_analytics_query',
        query: `SELECT wallet_source, COUNT(*) as count 
                FROM tickets 
                WHERE wallet_source IS NOT NULL 
                GROUP BY wallet_source`,
        maxTime: 50
      },
      {
        name: 'qr_access_method_query',
        query: `SELECT qr_access_method, COUNT(*) as count 
                FROM tickets 
                GROUP BY qr_access_method`,
        maxTime: 50
      },
      {
        name: 'ticket_validation_query',
        query: `SELECT id, status, scan_count, max_scan_count 
                FROM tickets 
                WHERE ticket_id = 'test' AND status = 'valid'`,
        maxTime: 10
      }
    ];
    
    const results = {
      status: 'PASS',
      tests: []
    };
    
    for (const test of performanceTests) {
      const startTime = Date.now();
      
      try {
        await this.database.execute(test.query);
        const executionTime = Date.now() - startTime;
        
        const passed = executionTime <= test.maxTime;
        if (!passed) {
          results.status = 'WARN';
        }
        
        results.tests.push({
          name: test.name,
          executionTime,
          maxTime: test.maxTime,
          passed
        });
      } catch (error) {
        results.status = 'FAIL';
        results.tests.push({
          name: test.name,
          error: error.message,
          passed: false
        });
      }
    }
    
    return results;
  }

  /**
   * Generate validation report
   */
  async generateReport() {
    console.log('Starting schema validation...\n');
    
    const report = {
      schema_version: '009',
      validation_date: new Date().toISOString(),
      status: 'PASS',
      checks: []
    };
    
    // Check column existence
    console.log('Validating column existence...');
    const columnValidation = await this.validateColumnExistence();
    report.checks.push({
      check: 'column_existence',
      status: columnValidation.status,
      details: `All required columns validated. Missing: ${columnValidation.missingColumns.length}`
    });
    
    if (columnValidation.status === 'FAIL') {
      report.status = 'FAIL';
      console.error('  ❌ Missing columns:', columnValidation.missingColumns);
    } else {
      console.log('  ✅ All required columns exist');
    }
    
    // Check data types
    console.log('Validating data types...');
    const dataTypeValidation = await this.validateDataTypes();
    report.checks.push({
      check: 'data_types',
      status: dataTypeValidation.status,
      details: `Data type validation. Issues: ${dataTypeValidation.issues.length}`
    });
    
    if (dataTypeValidation.status === 'FAIL') {
      report.status = 'FAIL';
      console.error('  ❌ Data type mismatches:', dataTypeValidation.issues);
    } else {
      console.log('  ✅ All data types correct');
    }
    
    // Check indexes
    console.log('Validating indexes...');
    const indexValidation = await this.validateIndexes();
    report.checks.push({
      check: 'indexes',
      status: indexValidation.status,
      details: `Index validation. Missing: ${indexValidation.missingIndexes.length}`
    });
    
    if (indexValidation.missingIndexes.length > 0) {
      console.warn('  ⚠️  Missing indexes:', indexValidation.missingIndexes);
    } else {
      console.log('  ✅ All required indexes exist');
    }
    
    // Scan codebase for column references
    console.log('Scanning codebase for column references...');
    const codebaseReferences = await this.scanCodebaseForColumnReferences();
    report.checks.push({
      check: 'codebase_references',
      status: 'PASS',
      details: `Found ${codebaseReferences.found.length} column references in ${Object.keys(codebaseReferences.byFile).length} files`
    });
    
    console.log(`  ✅ Found ${codebaseReferences.found.length} column references`);
    
    if (Object.keys(codebaseReferences.byFile).length > 0) {
      console.log('\nFiles with column references:');
      for (const [file, columns] of Object.entries(codebaseReferences.byFile)) {
        console.log(`  - ${file}: ${columns.join(', ')}`);
      }
    }
    
    // Test query performance
    console.log('\nTesting query performance...');
    const performanceResults = await this.testQueryPerformance();
    report.checks.push({
      check: 'query_performance',
      status: performanceResults.status,
      details: `Performance tests. Failed: ${performanceResults.tests.filter(t => !t.passed).length}`
    });
    
    // Update overall report status if performance tests fail
    if (performanceResults.status === 'FAIL') {
      report.status = 'FAIL';
    } else if (performanceResults.status === 'WARN' && report.status === 'PASS') {
      report.status = 'WARN';
    }
    
    report.performance_metrics = {
      avg_query_time: Math.round(
        performanceResults.tests.reduce((sum, t) => sum + (t.executionTime || 0), 0) / 
        performanceResults.tests.length
      ) + 'ms',
      tests: performanceResults.tests
    };
    
    for (const test of performanceResults.tests) {
      if (test.passed) {
        console.log(`  ✅ ${test.name}: ${test.executionTime}ms (max: ${test.maxTime}ms)`);
      } else if (test.error) {
        console.error(`  ❌ ${test.name}: ${test.error}`);
      } else {
        console.warn(`  ⚠️  ${test.name}: ${test.executionTime}ms (max: ${test.maxTime}ms)`);
      }
    }
    
    // Final status
    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL STATUS: ${report.status}`);
    console.log('='.repeat(60));
    
    // Write report to file
    const reportPath = path.join(process.cwd(), 'schema-validation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);
    
    return report;
  }
}

// Main execution
async function main() {
  try {
    const validator = new SchemaValidator();
    const report = await validator.generateReport();
    
    // Exit with appropriate code
    process.exit(report.status === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error('Schema validation failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SchemaValidator };
export default SchemaValidator;