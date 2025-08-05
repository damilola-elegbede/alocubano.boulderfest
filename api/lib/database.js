/**
 * SQLite Database Connection Utility
 * Provides database connection and initialization for the application
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - use environment variable or default location
const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../../data/alocubano.db');
const MIGRATIONS_PATH = join(__dirname, '../../migrations');

let db = null;

/**
 * Open database connection
 * @returns {Promise} Database connection
 */
export async function openDb() {
    if (db) {
        return db;
    }

    // Open the database
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');

    // Initialize database with migrations
    await runMigrations(db);

    return db;
}

/**
 * Run database migrations
 * @param {Database} database - SQLite database instance
 */
async function runMigrations(database) {
    // Create migrations tracking table if it doesn't exist
    await database.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            applied_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Get list of applied migrations
    const appliedMigrations = await database.all(
        'SELECT filename FROM migrations'
    );
    const appliedSet = new Set(appliedMigrations.map(m => m.filename));

    // Get migration files
    const migrationFiles = [
        '20240130_create_email_subscribers.sql',
        '20250105_add_orders_table.sql'
    ];

    // Run pending migrations
    for (const filename of migrationFiles) {
        if (!appliedSet.has(filename)) {
            const migrationPath = join(MIGRATIONS_PATH, filename);
            
            if (existsSync(migrationPath)) {
                console.log(`Running migration: ${filename}`);
                
                try {
                    // Convert PostgreSQL syntax to SQLite if needed
                    let sql = readFileSync(migrationPath, 'utf8');
                    sql = convertPostgreSQLToSQLite(sql);
                    
                    // Execute migration
                    await database.exec(sql);
                    
                    // Record migration as applied
                    await database.run(
                        'INSERT INTO migrations (filename) VALUES (?)',
                        [filename]
                    );
                    
                    console.log(`Migration ${filename} applied successfully`);
                } catch (error) {
                    console.error(`Error applying migration ${filename}:`, error);
                    throw error;
                }
            }
        }
    }
}

/**
 * Convert PostgreSQL syntax to SQLite
 * @param {string} sql - PostgreSQL SQL string
 * @returns {string} SQLite-compatible SQL
 */
function convertPostgreSQLToSQLite(sql) {
    // Skip conversion for already SQLite-compatible files
    if (sql.includes('datetime(\'now\')') || sql.includes('TEXT PRIMARY KEY')) {
        return sql;
    }

    // Remove PostgreSQL-specific syntax
    let sqliteSQL = sql
        // Replace SERIAL with INTEGER PRIMARY KEY AUTOINCREMENT
        .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        // Replace VARCHAR(n) with TEXT
        .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
        // Replace TIMESTAMP WITH TIME ZONE with TEXT
        .replace(/TIMESTAMP WITH TIME ZONE/gi, 'TEXT')
        // Replace JSONB with TEXT
        .replace(/JSONB/gi, 'TEXT')
        // Replace INTEGER[] with TEXT (store as JSON)
        .replace(/INTEGER\[\]/gi, 'TEXT')
        // Replace any remaining array syntax
        .replace(/\[\]/gi, '')
        // Replace JSONB default values
        .replace(/DEFAULT '{}'/gi, "DEFAULT '[]'")
        // Replace CURRENT_TIMESTAMP with datetime('now')
        .replace(/CURRENT_TIMESTAMP/gi, 'datetime(\'now\')')
        // Remove or replace plpgsql functions
        .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$ language 'plpgsql';/gi, '')
        // Remove function-based triggers
        .replace(/FOR EACH ROW EXECUTE FUNCTION \w+\(\);/gi, '');

    // Add SQLite-specific trigger for updated_at if needed
    if (sql.includes('updated_at') && !sql.includes('update_orders_updated_at')) {
        const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1];
        if (tableName && tableName !== 'orders') {
            sqliteSQL += `\n\n-- SQLite trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_${tableName}_updated_at 
    AFTER UPDATE ON ${tableName}
    FOR EACH ROW
    BEGIN
        UPDATE ${tableName} SET updated_at = datetime('now') WHERE id = NEW.id;
    END;`;
        }
    }

    return sqliteSQL;
}

/**
 * Close database connection
 */
export async function closeDb() {
    if (db) {
        await db.close();
        db = null;
    }
}

/**
 * Get database instance (for testing)
 */
export function getDb() {
    return db;
}