#!/usr/bin/env node

/**
 * Database Setup Script
 * Initializes the database for development and testing
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { getDatabaseClient } from '../api/lib/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  console.log('🔧 Setting up database...');
  
  try {
    // Initialize database client
    const client = await getDatabaseClient();
    console.log('✅ Database client initialized');
    
    // Run migrations
    const migrationsDir = join(__dirname, '..', 'migrations');
    const migrationFiles = await fs.readdir(migrationsDir);
    const sqlFiles = migrationFiles
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    console.log(`📝 Found ${sqlFiles.length} migration files`);
    
    for (const file of sqlFiles) {
      const sql = await fs.readFile(join(migrationsDir, file), 'utf-8');
      
      // Parse SQL statements more carefully
      const statements = [];
      let currentStatement = '';
      let inTrigger = false;
      
      const lines = sql.split('\n');
      for (const line of lines) {
        // Skip comment lines
        if (line.trim().startsWith('--')) {
          continue;
        }
        
        const upperLine = line.toUpperCase().trim();
        
        // Detect trigger start
        if (upperLine.startsWith('CREATE TRIGGER')) {
          inTrigger = true;
        }
        
        // Add line to current statement
        if (line.trim()) {
          currentStatement += line + '\n';
        }
        
        // Check if statement is complete
        if (inTrigger) {
          // For triggers, wait for END; statement
          if (upperLine === 'END;' || upperLine === 'END') {
            statements.push(currentStatement.trim());
            currentStatement = '';
            inTrigger = false;
          }
        } else {
          // For normal statements, split by semicolon at end of line
          if (line.trim().endsWith(';')) {
            statements.push(currentStatement.trim());
            currentStatement = '';
          }
        }
      }
      
      // Add any remaining statement
      if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
      }
      
      // Execute each statement
      let statementCount = 0;
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await client.execute(statement);
            statementCount++;
          } catch (err) {
            // Ignore errors for existing tables/columns
            if (!err.message.includes('already exists') && 
                !err.message.includes('duplicate column name')) {
              console.warn(`⚠️ Warning in ${file}: ${err.message}`);
            }
          }
        }
      }
      
      if (statementCount > 0) {
        console.log(`✅ Applied ${file} (${statementCount} statements)`);
      }
    }
    
    console.log('✅ Database setup complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase();
}

export { setupDatabase };