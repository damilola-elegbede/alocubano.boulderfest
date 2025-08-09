/**
 * Database Backup Manager
 * Provides automated backup, verification, and restore functionality for SQLite databases
 * with compression and retention management
 */

import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { promisify } from 'util';
import { getDatabase } from '../lib/database.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class BackupManager {
  constructor(databasePath = null, backupDir = './backups') {
    this.databasePath = databasePath;
    this.backupDir = backupDir;
    this.database = getDatabase();
  }

  /**
   * Ensure backup directory exists
   */
  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create backup directory: ${error.message}`);
    }
  }

  /**
   * Generate backup filename with timestamp
   */
  generateBackupFilename(description = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
    const descPart = description ? `_${description.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    return `backup_${timestamp}${descPart}.db.gz`;
  }

  /**
   * Calculate checksum for data integrity
   */
  calculateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create a backup of the database
   */
  async createBackup(description = '') {
    await this.ensureBackupDirectory();
    
    const backupFilename = this.generateBackupFilename(description);
    const backupPath = path.join(this.backupDir, backupFilename);
    const metadataPath = `${backupPath}.json`;
    
    try {
      // Execute VACUUM INTO to create a clean backup
      const tempBackupPath = path.join(this.backupDir, `temp_${Date.now()}.db`);
      
      // For Turso/LibSQL, we need to export the database
      const result = await this.database.execute("SELECT sql FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')");
      const schemas = result.rows.map(row => row.sql).filter(sql => sql);
      
      // Get all table data
      const tables = await this.database.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const backupData = {
        schemas,
        tables: {}
      };
      
      for (const table of tables.rows) {
        const tableName = table.name;
        const tableData = await this.database.execute(`SELECT * FROM ${tableName}`);
        backupData.tables[tableName] = tableData.rows;
      }
      
      // Serialize backup data
      const backupJson = JSON.stringify(backupData, null, 2);
      const backupBuffer = Buffer.from(backupJson);
      
      // Compress the backup
      const compressedData = await gzip(backupBuffer);
      
      // Calculate checksums
      const originalChecksum = this.calculateChecksum(backupBuffer);
      const compressedChecksum = this.calculateChecksum(compressedData);
      
      // Write compressed backup
      await fs.writeFile(backupPath, compressedData);
      
      // Create metadata file
      const metadata = {
        filename: backupFilename,
        path: backupPath,
        description,
        createdAt: new Date().toISOString(),
        originalSize: backupBuffer.length,
        compressedSize: compressedData.length,
        compressionRatio: ((1 - compressedData.length / backupBuffer.length) * 100).toFixed(2) + '%',
        checksums: {
          original: originalChecksum,
          compressed: compressedChecksum
        },
        tableCount: Object.keys(backupData.tables).length,
        rowCounts: {}
      };
      
      // Add row counts for each table
      for (const [tableName, rows] of Object.entries(backupData.tables)) {
        metadata.rowCounts[tableName] = rows.length;
      }
      
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`Backup created successfully: ${backupFilename}`);
      console.log(`Compression ratio: ${metadata.compressionRatio}`);
      
      return metadata;
    } catch (error) {
      // Clean up partial backup if creation failed
      try {
        await fs.unlink(backupPath);
        await fs.unlink(metadataPath);
      } catch {}
      
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackupIntegrity(backupPath) {
    try {
      const metadataPath = `${backupPath}.json`;
      
      // Read metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // Read and verify compressed backup
      const compressedData = await fs.readFile(backupPath);
      const compressedChecksum = this.calculateChecksum(compressedData);
      
      if (compressedChecksum !== metadata.checksums.compressed) {
        throw new Error('Compressed backup checksum mismatch');
      }
      
      // Decompress and verify original checksum
      const decompressedData = await gunzip(compressedData);
      const originalChecksum = this.calculateChecksum(decompressedData);
      
      if (originalChecksum !== metadata.checksums.original) {
        throw new Error('Decompressed backup checksum mismatch');
      }
      
      // Parse and validate backup structure
      const backupData = JSON.parse(decompressedData.toString());
      
      if (!backupData.schemas || !backupData.tables) {
        throw new Error('Invalid backup structure');
      }
      
      // Verify table integrity
      const integrityResults = {
        valid: true,
        checksumValid: true,
        structureValid: true,
        tableCount: Object.keys(backupData.tables).length,
        totalRows: 0,
        tables: {}
      };
      
      for (const [tableName, rows] of Object.entries(backupData.tables)) {
        integrityResults.tables[tableName] = {
          rowCount: rows.length,
          valid: Array.isArray(rows)
        };
        integrityResults.totalRows += rows.length;
        
        if (!Array.isArray(rows)) {
          integrityResults.valid = false;
          integrityResults.structureValid = false;
        }
      }
      
      console.log(`Backup integrity verified: ${path.basename(backupPath)}`);
      return integrityResults;
    } catch (error) {
      throw new Error(`Backup integrity verification failed: ${error.message}`);
    }
  }

  /**
   * Restore database from backup
   */
  async restoreFromBackup(backupPath) {
    try {
      // Verify backup integrity first
      await this.verifyBackupIntegrity(backupPath);
      
      // Read and decompress backup
      const compressedData = await fs.readFile(backupPath);
      const decompressedData = await gunzip(compressedData);
      const backupData = JSON.parse(decompressedData.toString());
      
      // Begin transaction for atomic restore
      const statements = [];
      
      // Drop existing tables (careful!)
      for (const tableName of Object.keys(backupData.tables)) {
        statements.push({
          sql: `DROP TABLE IF EXISTS ${tableName}`,
          args: []
        });
      }
      
      // Recreate schemas
      for (const schema of backupData.schemas) {
        if (schema) {
          statements.push({
            sql: schema,
            args: []
          });
        }
      }
      
      // Restore data
      for (const [tableName, rows] of Object.entries(backupData.tables)) {
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map(() => '?').join(', ');
          
          statements.push({
            sql: `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
            args: values
          });
        }
      }
      
      // Execute restore in batch
      await this.database.batch(statements);
      
      console.log(`Database restored successfully from: ${path.basename(backupPath)}`);
      
      // Verify restoration
      const verifyResult = await this.database.execute("SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table'");
      const tableCount = verifyResult.rows[0].table_count;
      
      return {
        success: true,
        restoredTables: Object.keys(backupData.tables).length,
        verifiedTableCount: tableCount,
        restoredRows: Object.values(backupData.tables).reduce((sum, rows) => sum + rows.length, 0)
      };
    } catch (error) {
      throw new Error(`Database restoration failed: ${error.message}`);
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(retentionDays = 30) {
    try {
      await this.ensureBackupDirectory();
      
      const files = await fs.readdir(this.backupDir);
      const now = Date.now();
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      
      const deletedBackups = [];
      
      for (const file of files) {
        if (!file.startsWith('backup_') || !file.endsWith('.db.gz')) {
          continue;
        }
        
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > retentionMs) {
          // Delete backup and its metadata
          await fs.unlink(filePath);
          try {
            await fs.unlink(`${filePath}.json`);
          } catch {}
          
          deletedBackups.push({
            filename: file,
            age: Math.floor((now - stats.mtime.getTime()) / (24 * 60 * 60 * 1000))
          });
        }
      }
      
      if (deletedBackups.length > 0) {
        console.log(`Cleaned up ${deletedBackups.length} old backups`);
      }
      
      return {
        deletedCount: deletedBackups.length,
        deletedBackups
      };
    } catch (error) {
      throw new Error(`Backup cleanup failed: ${error.message}`);
    }
  }

  /**
   * List available backups
   */
  async listAvailableBackups() {
    try {
      await this.ensureBackupDirectory();
      
      const files = await fs.readdir(this.backupDir);
      const backups = [];
      
      for (const file of files) {
        if (!file.startsWith('backup_') || !file.endsWith('.db.gz')) {
          continue;
        }
        
        const filePath = path.join(this.backupDir, file);
        const metadataPath = `${filePath}.json`;
        
        try {
          const stats = await fs.stat(filePath);
          let metadata = {
            filename: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime.toISOString()
          };
          
          // Try to read metadata file if it exists
          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            const fullMetadata = JSON.parse(metadataContent);
            metadata = { ...metadata, ...fullMetadata };
          } catch {}
          
          backups.push(metadata);
        } catch (error) {
          console.error(`Error reading backup ${file}: ${error.message}`);
        }
      }
      
      // Sort by creation date (newest first)
      backups.sort((a, b) => new Date(b.created) - new Date(a.created));
      
      return backups;
    } catch (error) {
      throw new Error(`Failed to list backups: ${error.message}`);
    }
  }

  /**
   * Validate backup data consistency
   */
  async validateBackupData(backupPath) {
    try {
      // Read and decompress backup
      const compressedData = await fs.readFile(backupPath);
      const decompressedData = await gunzip(compressedData);
      const backupData = JSON.parse(decompressedData.toString());
      
      const validationResults = {
        valid: true,
        errors: [],
        warnings: [],
        statistics: {
          tableCount: Object.keys(backupData.tables).length,
          totalRows: 0,
          tables: {}
        }
      };
      
      // Validate each table
      for (const [tableName, rows] of Object.entries(backupData.tables)) {
        validationResults.statistics.tables[tableName] = {
          rowCount: rows.length,
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
          issues: []
        };
        
        validationResults.statistics.totalRows += rows.length;
        
        // Check for data consistency
        if (rows.length > 0) {
          const firstRowKeys = Object.keys(rows[0]);
          
          for (let i = 1; i < rows.length; i++) {
            const currentKeys = Object.keys(rows[i]);
            
            if (currentKeys.length !== firstRowKeys.length ||
                !currentKeys.every(key => firstRowKeys.includes(key))) {
              validationResults.valid = false;
              validationResults.errors.push(
                `Inconsistent row structure in table ${tableName} at row ${i}`
              );
              validationResults.statistics.tables[tableName].issues.push(
                `Row ${i} has inconsistent structure`
              );
            }
          }
        }
        
        // Check for critical tables
        const criticalTables = ['tickets', 'transactions', 'subscribers'];
        if (criticalTables.includes(tableName) && rows.length === 0) {
          validationResults.warnings.push(
            `Critical table ${tableName} is empty`
          );
        }
      }
      
      console.log(`Backup data validation completed: ${path.basename(backupPath)}`);
      return validationResults;
    } catch (error) {
      throw new Error(`Backup data validation failed: ${error.message}`);
    }
  }
}

export default BackupManager;
export { BackupManager };