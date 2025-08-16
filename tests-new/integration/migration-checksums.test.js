/**
 * Migration Checksums Integration Test (T1.03.09)
 * Tests database migration integrity and checksum validation
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { databaseHelper } from '../core/database.js';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

// Mock migration system
class MigrationManager {
  constructor(databaseClient) {
    this.db = databaseClient;
    this.migrationsPath = '../migrations'; // Relative to project root
    this.migrations = [];
  }

  /**
   * Calculate checksum for migration file content
   */
  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * Parse migration file to extract metadata
   */
  parseMigration(filename, content) {
    const lines = content.split('\n');
    const migration = {
      filename,
      version: this.extractVersion(filename),
      description: this.extractDescription(lines),
      checksum: this.calculateChecksum(content),
      statements: this.extractStatements(content),
      size: content.length,
      createdAt: new Date().toISOString()
    };

    return migration;
  }

  extractVersion(filename) {
    const match = filename.match(/^(\d{4}_\d{2}_\d{2}_\d{6})/);
    return match ? match[1] : filename.replace('.sql', '');
  }

  extractDescription(lines) {
    const commentLine = lines.find(line => line.trim().startsWith('--') && !line.includes('Migration:'));
    return commentLine ? commentLine.replace(/^--\s*/, '').trim() : 'No description';
  }

  extractStatements(content) {
    // Remove comments and split by semicolon
    const cleanContent = content
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim())
      .join('\n');
    
    return cleanContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
  }

  /**
   * Load migration files and calculate checksums
   */
  async loadMigrations() {
    try {
      // Create mock migration files for testing
      const mockMigrations = this.createMockMigrations();
      
      for (const [filename, content] of Object.entries(mockMigrations)) {
        const migration = this.parseMigration(filename, content);
        this.migrations.push(migration);
      }

      return this.migrations.sort((a, b) => a.version.localeCompare(b.version));
    } catch (error) {
      console.warn('Could not load migration files, using mock migrations:', error.message);
      return this.createFallbackMigrations();
    }
  }

  createMockMigrations() {
    return {
      '2025_01_01_000001_initial_schema.sql': `
-- Migration: Initial database schema
-- Creates base tables for ticket system

CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_email TEXT NOT NULL,
    buyer_name TEXT NOT NULL,
    event_name TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    qr_token TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'confirmed',
    scanned_count INTEGER DEFAULT 0,
    max_scans INTEGER DEFAULT 5,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

CREATE INDEX idx_tickets_email ON tickets(buyer_email);
CREATE INDEX idx_tickets_qr_token ON tickets(qr_token);
      `,
      
      '2025_01_02_000002_subscribers_table.sql': `
-- Migration: Add email subscribers table
-- For newsletter and email marketing

CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    source TEXT DEFAULT 'website',
    subscribed_at TEXT NOT NULL,
    unsubscribed_at TEXT,
    bounce_count INTEGER DEFAULT 0
);

CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_status ON subscribers(status);
      `,

      '2025_01_03_000003_add_ticket_metadata.sql': `
-- Migration: Add metadata fields to tickets
-- Adds payment and scan tracking

ALTER TABLE tickets ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE tickets ADD COLUMN total_amount_cents INTEGER;
ALTER TABLE tickets ADD COLUMN currency TEXT DEFAULT 'usd';
ALTER TABLE tickets ADD COLUMN last_scanned_at TEXT;

CREATE INDEX idx_tickets_payment_intent ON tickets(stripe_payment_intent_id);
      `,

      '2025_01_04_000004_migrations_table.sql': `
-- Migration: Create migrations tracking table
-- Tracks applied migrations and their checksums

CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    description TEXT,
    checksum TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    execution_time_ms INTEGER
);

CREATE INDEX idx_migrations_version ON migrations(version);
      `
    };
  }

  createFallbackMigrations() {
    return [
      {
        filename: 'fallback_migration.sql',
        version: '2025_01_01_000000',
        description: 'Fallback migration for testing',
        checksum: this.calculateChecksum('SELECT 1;'),
        statements: ['SELECT 1'],
        size: 9,
        createdAt: new Date().toISOString()
      }
    ];
  }

  /**
   * Verify migration checksums against database records
   */
  async verifyChecksums() {
    const results = {
      verified: [],
      modified: [],
      missing: [],
      errors: []
    };

    try {
      // Get executed migrations from database
      const executedMigrations = await this.getExecutedMigrations();
      const executedMap = new Map(executedMigrations.map(m => [m.version, m]));

      // Check each migration file
      for (const migration of this.migrations) {
        const executed = executedMap.get(migration.version);
        
        if (!executed) {
          results.missing.push({
            ...migration,
            reason: 'Migration not found in database'
          });
          continue;
        }

        if (executed.checksum === migration.checksum) {
          results.verified.push({
            ...migration,
            executedAt: executed.executed_at
          });
        } else {
          results.modified.push({
            ...migration,
            expectedChecksum: migration.checksum,
            actualChecksum: executed.checksum,
            executedAt: executed.executed_at
          });
        }
      }

      // Check for migrations in database that aren't in files
      for (const executed of executedMigrations) {
        const fileExists = this.migrations.some(m => m.version === executed.version);
        if (!fileExists) {
          results.missing.push({
            ...executed,
            reason: 'Migration file not found'
          });
        }
      }

    } catch (error) {
      results.errors.push({
        error: error.message,
        type: 'verification_error'
      });
    }

    return results;
  }

  async getExecutedMigrations() {
    try {
      // Ensure migrations table exists
      await this.ensureMigrationsTable();
      
      const result = await this.db.execute('SELECT * FROM migrations ORDER BY version');
      return result.rows || [];
    } catch (error) {
      console.warn('Could not retrieve executed migrations:', error.message);
      return [];
    }
  }

  async ensureMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        description TEXT,
        checksum TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        execution_time_ms INTEGER DEFAULT 0
      )
    `;
    
    await this.db.execute(createTableSQL);
  }

  /**
   * Record a migration as executed
   */
  async recordMigration(migration, executionTimeMs = 0) {
    const sql = `
      INSERT OR REPLACE INTO migrations 
      (version, filename, description, checksum, executed_at, execution_time_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.execute(sql, [
      migration.version,
      migration.filename,
      migration.description,
      migration.checksum,
      new Date().toISOString(),
      executionTimeMs
    ]);
  }

  /**
   * Simulate migration execution
   */
  async executeMigration(migration) {
    const startTime = Date.now();
    
    try {
      // Execute each statement
      for (const statement of migration.statements) {
        if (statement.trim()) {
          await this.db.execute(statement);
        }
      }
      
      const executionTime = Date.now() - startTime;
      await this.recordMigration(migration, executionTime);
      
      return { success: true, executionTime };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate migration file integrity
   */
  validateMigrationIntegrity(migration) {
    const issues = [];

    // Check filename format
    if (!/^\d{4}_\d{2}_\d{2}_\d{6}_/.test(migration.filename)) {
      issues.push('Invalid filename format. Expected: YYYY_MM_DD_HHMMSS_description.sql');
    }

    // Check for required fields
    if (!migration.description || migration.description === 'No description') {
      issues.push('Missing migration description');
    }

    // Check for dangerous statements
    const dangerousPatterns = [
      /DROP\s+TABLE/i,
      /TRUNCATE/i,
      /DELETE\s+FROM.*WHERE/i
    ];

    for (const statement of migration.statements) {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(statement)) {
          issues.push(`Potentially dangerous statement: ${statement.substring(0, 50)}...`);
        }
      }
    }

    // Check statement syntax (basic)
    for (const statement of migration.statements) {
      if (!statement.trim().match(/^(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)/i)) {
        issues.push(`Unrecognized SQL statement: ${statement.substring(0, 30)}...`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate migration report
   */
  generateReport() {
    return {
      totalMigrations: this.migrations.length,
      migrationsByType: this.groupMigrationsByType(),
      sizeStats: this.calculateSizeStats(),
      checksumStats: this.calculateChecksumStats(),
      chronology: this.getChronologicalOrder()
    };
  }

  groupMigrationsByType() {
    const types = {
      schema: 0,
      data: 0,
      index: 0,
      alter: 0,
      other: 0
    };

    for (const migration of this.migrations) {
      const content = migration.statements.join(' ').toLowerCase();
      
      if (content.includes('create table')) types.schema++;
      else if (content.includes('insert') || content.includes('update')) types.data++;
      else if (content.includes('create index')) types.index++;
      else if (content.includes('alter table')) types.alter++;
      else types.other++;
    }

    return types;
  }

  calculateSizeStats() {
    const sizes = this.migrations.map(m => m.size);
    return {
      total: sizes.reduce((a, b) => a + b, 0),
      average: sizes.reduce((a, b) => a + b, 0) / sizes.length || 0,
      min: Math.min(...sizes) || 0,
      max: Math.max(...sizes) || 0
    };
  }

  calculateChecksumStats() {
    const checksums = this.migrations.map(m => m.checksum);
    const uniqueChecksums = new Set(checksums);
    
    return {
      totalChecksums: checksums.length,
      uniqueChecksums: uniqueChecksums.size,
      duplicates: checksums.length - uniqueChecksums.size,
      avgChecksumLength: checksums.reduce((a, b) => a + b.length, 0) / checksums.length || 0
    };
  }

  getChronologicalOrder() {
    return this.migrations
      .sort((a, b) => a.version.localeCompare(b.version))
      .map(m => ({
        version: m.version,
        description: m.description,
        checksum: m.checksum.substring(0, 8) + '...'
      }));
  }
}

describe('Migration Checksums Integration (T1.03.09)', () => {
  let migrationManager;
  let db;

  beforeAll(async () => {
    db = await databaseHelper.initialize();
    migrationManager = new MigrationManager(db);
    await migrationManager.loadMigrations();
  });

  afterAll(async () => {
    // Clean up test migrations
    try {
      await db.execute('DROP TABLE IF EXISTS migrations');
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  });

  describe('Migration File Loading and Parsing', () => {
    it('should load and parse migration files correctly', async () => {
      const migrations = await migrationManager.loadMigrations();
      
      expect(migrations).toBeInstanceOf(Array);
      expect(migrations.length).toBeGreaterThan(0);
      
      // Check first migration structure
      const firstMigration = migrations[0];
      expect(firstMigration).toHaveProperty('filename');
      expect(firstMigration).toHaveProperty('version');
      expect(firstMigration).toHaveProperty('description');
      expect(firstMigration).toHaveProperty('checksum');
      expect(firstMigration).toHaveProperty('statements');
    });

    it('should calculate consistent checksums', () => {
      const testContent = 'CREATE TABLE test (id INTEGER);';
      
      const checksum1 = migrationManager.calculateChecksum(testContent);
      const checksum2 = migrationManager.calculateChecksum(testContent);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 hex length
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should detect content changes through checksum differences', () => {
      const originalContent = 'CREATE TABLE users (id INTEGER);';
      const modifiedContent = 'CREATE TABLE users (id INTEGER, name TEXT);';
      
      const originalChecksum = migrationManager.calculateChecksum(originalContent);
      const modifiedChecksum = migrationManager.calculateChecksum(modifiedContent);
      
      expect(originalChecksum).not.toBe(modifiedChecksum);
    });

    it('should parse migration metadata correctly', () => {
      const filename = '2025_01_15_120000_add_user_table.sql';
      const content = `
-- Migration: Add user authentication table
-- Creates users table with basic fields

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL
);
      `;
      
      const migration = migrationManager.parseMigration(filename, content);
      
      expect(migration.version).toBe('2025_01_15_120000');
      expect(migration.description).toBe('Add user authentication table');
      expect(migration.statements).toContain('CREATE TABLE users (\n    id INTEGER PRIMARY KEY,\n    email TEXT UNIQUE NOT NULL\n)');
    });
  });

  describe('Migration Integrity Validation', () => {
    it('should validate migration file naming conventions', () => {
      const validMigration = {
        filename: '2025_01_15_120000_valid_migration.sql',
        description: 'Valid migration',
        statements: ['CREATE TABLE test (id INTEGER)']
      };
      
      const invalidMigration = {
        filename: 'invalid_name.sql',
        description: '',
        statements: ['invalid statement']
      };
      
      const validResult = migrationManager.validateMigrationIntegrity(validMigration);
      const invalidResult = migrationManager.validateMigrationIntegrity(invalidMigration);
      
      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.issues).toContain('Invalid filename format. Expected: YYYY_MM_DD_HHMMSS_description.sql');
    });

    it('should detect potentially dangerous SQL statements', () => {
      const dangerousMigration = {
        filename: '2025_01_15_120000_dangerous.sql',
        description: 'Dangerous migration',
        statements: [
          'DROP TABLE users',
          'TRUNCATE sensitive_data',
          'DELETE FROM important_table WHERE condition = true'
        ]
      };
      
      const result = migrationManager.validateMigrationIntegrity(dangerousMigration);
      
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(issue => issue.includes('dangerous'))).toBe(true);
    });

    it('should require migration descriptions', () => {
      const migrationWithoutDescription = {
        filename: '2025_01_15_120000_test.sql',
        description: '',
        statements: ['CREATE TABLE test (id INTEGER)']
      };
      
      const result = migrationManager.validateMigrationIntegrity(migrationWithoutDescription);
      
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing migration description');
    });

    it('should validate SQL statement syntax', () => {
      const validMigration = {
        filename: '2025_01_15_120000_valid.sql',
        description: 'Valid SQL statements',
        statements: [
          'CREATE TABLE test (id INTEGER)',
          'ALTER TABLE test ADD COLUMN name TEXT',
          'INSERT INTO test (id) VALUES (1)'
        ]
      };
      
      const result = migrationManager.validateMigrationIntegrity(validMigration);
      expect(result.valid).toBe(true);
    });
  });

  describe('Migration Execution and Recording', () => {
    it('should execute migrations and record them in database', async () => {
      const testMigration = {
        version: 'test_2025_01_15_120000',
        filename: 'test_migration.sql',
        description: 'Test migration execution',
        checksum: migrationManager.calculateChecksum('CREATE TABLE test_exec (id INTEGER);'),
        statements: ['CREATE TABLE test_exec (id INTEGER)']
      };
      
      const result = await migrationManager.executeMigration(testMigration);
      
      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
      
      // Verify migration was recorded
      const executedMigrations = await migrationManager.getExecutedMigrations();
      const recorded = executedMigrations.find(m => m.version === testMigration.version);
      
      expect(recorded).toBeDefined();
      expect(recorded.checksum).toBe(testMigration.checksum);
      expect(recorded.description).toBe(testMigration.description);
      
      // Clean up
      await db.execute('DROP TABLE IF EXISTS test_exec');
      await db.execute('DELETE FROM migrations WHERE version = ?', [testMigration.version]);
    });

    it('should handle migration execution failures gracefully', async () => {
      const failingMigration = {
        version: 'test_failing_migration',
        filename: 'failing_migration.sql',
        description: 'Migration that should fail',
        checksum: 'test_checksum',
        statements: ['INVALID SQL STATEMENT']
      };
      
      const result = await migrationManager.executeMigration(failingMigration);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    it('should track migration execution times', async () => {
      const timedMigration = {
        version: 'test_timed_migration',
        filename: 'timed_migration.sql',
        description: 'Migration for timing test',
        checksum: migrationManager.calculateChecksum('CREATE TABLE timed_test (id INTEGER);'),
        statements: ['CREATE TABLE timed_test (id INTEGER)']
      };
      
      const startTime = Date.now();
      await migrationManager.executeMigration(timedMigration);
      const endTime = Date.now();
      
      const executedMigrations = await migrationManager.getExecutedMigrations();
      const recorded = executedMigrations.find(m => m.version === timedMigration.version);
      
      expect(recorded.execution_time_ms).toBeGreaterThan(0);
      expect(recorded.execution_time_ms).toBeLessThanOrEqual(endTime - startTime + 100); // Allow some tolerance
      
      // Clean up
      await db.execute('DROP TABLE IF EXISTS timed_test');
      await db.execute('DELETE FROM migrations WHERE version = ?', [timedMigration.version]);
    });
  });

  describe('Checksum Verification and Integrity Checking', () => {
    it('should verify checksums against executed migrations', async () => {
      // Execute a test migration first
      const testMigration = {
        version: 'test_checksum_verification',
        filename: 'checksum_test.sql',
        description: 'Test checksum verification',
        checksum: migrationManager.calculateChecksum('CREATE TABLE checksum_test (id INTEGER);'),
        statements: ['CREATE TABLE checksum_test (id INTEGER)']
      };
      
      await migrationManager.executeMigration(testMigration);
      
      // Add it to the manager's migrations for verification
      migrationManager.migrations.push(testMigration);
      
      const verificationResult = await migrationManager.verifyChecksums();
      
      expect(verificationResult.verified).toBeInstanceOf(Array);
      expect(verificationResult.modified).toBeInstanceOf(Array);
      expect(verificationResult.missing).toBeInstanceOf(Array);
      expect(verificationResult.errors).toBeInstanceOf(Array);
      
      // Should find the test migration as verified
      const verifiedMigration = verificationResult.verified.find(m => m.version === testMigration.version);
      expect(verifiedMigration).toBeDefined();
      
      // Clean up
      await db.execute('DROP TABLE IF EXISTS checksum_test');
      await db.execute('DELETE FROM migrations WHERE version = ?', [testMigration.version]);
      migrationManager.migrations = migrationManager.migrations.filter(m => m.version !== testMigration.version);
    });

    it('should detect modified migrations through checksum mismatches', async () => {
      // Record a migration with one checksum
      const originalMigration = {
        version: 'test_modified_detection',
        filename: 'modified_test.sql',
        description: 'Test modified detection',
        checksum: 'original_checksum',
        statements: ['CREATE TABLE modified_test (id INTEGER)']
      };
      
      await migrationManager.recordMigration(originalMigration);
      
      // Create a modified version with different checksum
      const modifiedMigration = {
        ...originalMigration,
        checksum: 'modified_checksum'
      };
      
      migrationManager.migrations.push(modifiedMigration);
      
      const verificationResult = await migrationManager.verifyChecksums();
      
      const modifiedDetection = verificationResult.modified.find(m => m.version === originalMigration.version);
      expect(modifiedDetection).toBeDefined();
      expect(modifiedDetection.expectedChecksum).toBe('modified_checksum');
      expect(modifiedDetection.actualChecksum).toBe('original_checksum');
      
      // Clean up
      await db.execute('DELETE FROM migrations WHERE version = ?', [originalMigration.version]);
      migrationManager.migrations = migrationManager.migrations.filter(m => m.version !== originalMigration.version);
    });

    it('should identify missing migration files', async () => {
      // Record a migration in database without corresponding file
      const orphanMigration = {
        version: 'test_orphan_migration',
        filename: 'orphan_test.sql',
        description: 'Orphan migration test',
        checksum: 'orphan_checksum'
      };
      
      await migrationManager.recordMigration(orphanMigration);
      
      const verificationResult = await migrationManager.verifyChecksums();
      
      const missingFile = verificationResult.missing.find(m => 
        m.version === orphanMigration.version && m.reason === 'Migration file not found'
      );
      expect(missingFile).toBeDefined();
      
      // Clean up
      await db.execute('DELETE FROM migrations WHERE version = ?', [orphanMigration.version]);
    });
  });

  describe('Migration Reporting and Statistics', () => {
    it('should generate comprehensive migration reports', () => {
      const report = migrationManager.generateReport();
      
      expect(report).toHaveProperty('totalMigrations');
      expect(report).toHaveProperty('migrationsByType');
      expect(report).toHaveProperty('sizeStats');
      expect(report).toHaveProperty('checksumStats');
      expect(report).toHaveProperty('chronology');
      
      expect(typeof report.totalMigrations).toBe('number');
      expect(report.migrationsByType).toHaveProperty('schema');
      expect(report.sizeStats).toHaveProperty('total');
      expect(report.checksumStats).toHaveProperty('totalChecksums');
      expect(Array.isArray(report.chronology)).toBe(true);
    });

    it('should calculate accurate size statistics', () => {
      const sizeStats = migrationManager.calculateSizeStats();
      
      expect(sizeStats.total).toBeGreaterThan(0);
      expect(sizeStats.average).toBeGreaterThan(0);
      expect(sizeStats.min).toBeGreaterThanOrEqual(0);
      expect(sizeStats.max).toBeGreaterThanOrEqual(sizeStats.min);
      expect(sizeStats.average).toBeLessThanOrEqual(sizeStats.max);
    });

    it('should analyze checksum uniqueness', () => {
      const checksumStats = migrationManager.calculateChecksumStats();
      
      expect(checksumStats.totalChecksums).toBe(migrationManager.migrations.length);
      expect(checksumStats.uniqueChecksums).toBeGreaterThan(0);
      expect(checksumStats.uniqueChecksums).toBeLessThanOrEqual(checksumStats.totalChecksums);
      expect(checksumStats.duplicates).toBeGreaterThanOrEqual(0);
      expect(checksumStats.avgChecksumLength).toBe(64); // SHA-256 hex length
    });

    it('should provide chronological migration order', () => {
      const chronology = migrationManager.getChronologicalOrder();
      
      expect(Array.isArray(chronology)).toBe(true);
      expect(chronology.length).toBe(migrationManager.migrations.length);
      
      // Verify chronological ordering
      for (let i = 1; i < chronology.length; i++) {
        expect(chronology[i].version >= chronology[i-1].version).toBe(true);
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of migrations efficiently', async () => {
      const startTime = Date.now();
      
      // Create many test migrations
      const largeMigrationSet = Array.from({ length: 100 }, (_, i) => ({
        filename: `test_bulk_${i.toString().padStart(4, '0')}.sql`,
        version: `2025_01_01_${i.toString().padStart(6, '0')}`,
        description: `Bulk test migration ${i}`,
        checksum: migrationManager.calculateChecksum(`CREATE TABLE bulk_test_${i} (id INTEGER);`),
        statements: [`CREATE TABLE bulk_test_${i} (id INTEGER)`],
        size: 50,
        createdAt: new Date().toISOString()
      }));
      
      // Test checksum calculation performance
      const checksumTime = Date.now();
      largeMigrationSet.forEach(migration => {
        migrationManager.calculateChecksum(migration.statements.join('\n'));
      });
      const checksumDuration = Date.now() - checksumTime;
      
      // Test verification performance
      const tempManager = new MigrationManager(db);
      tempManager.migrations = largeMigrationSet;
      
      const verifyTime = Date.now();
      await tempManager.verifyChecksums();
      const verifyDuration = Date.now() - verifyTime;
      
      const totalTime = Date.now() - startTime;
      
      expect(checksumDuration).toBeLessThan(1000); // < 1 second for 100 checksums
      expect(verifyDuration).toBeLessThan(2000); // < 2 seconds for verification
      expect(totalTime).toBeLessThan(5000); // < 5 seconds total
    });

    it('should maintain memory efficiency with large migration files', () => {
      const largeContent = 'CREATE TABLE test (id INTEGER);\n'.repeat(10000);
      const startMemory = process.memoryUsage().heapUsed;
      
      // Process large content multiple times
      for (let i = 0; i < 10; i++) {
        migrationManager.calculateChecksum(largeContent);
        migrationManager.parseMigration(`large_${i}.sql`, largeContent);
      }
      
      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted migration files gracefully', () => {
      const corruptedContent = '\x00\x01\x02\x03INVALID_BINARY_DATA\xFF\xFE';
      
      expect(() => {
        migrationManager.calculateChecksum(corruptedContent);
      }).not.toThrow();
      
      const checksum = migrationManager.calculateChecksum(corruptedContent);
      expect(typeof checksum).toBe('string');
      expect(checksum).toHaveLength(64);
    });

    it('should handle empty migration files', () => {
      const emptyMigration = migrationManager.parseMigration('empty.sql', '');
      
      expect(emptyMigration.checksum).toBeDefined();
      expect(emptyMigration.statements).toHaveLength(0);
      expect(emptyMigration.size).toBe(0);
    });

    it('should handle database connection errors during verification', async () => {
      const faultyManager = new MigrationManager(null); // No database connection
      
      const result = await faultyManager.verifyChecksums();
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('error');
      expect(result.errors[0]).toHaveProperty('type', 'verification_error');
    });

    it('should handle very long migration descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      const content = `-- Migration: ${longDescription}\nCREATE TABLE test (id INTEGER);`;
      
      const migration = migrationManager.parseMigration('long_desc.sql', content);
      
      expect(migration.description).toBe(longDescription);
      expect(migration.checksum).toBeDefined();
    });
  });
});