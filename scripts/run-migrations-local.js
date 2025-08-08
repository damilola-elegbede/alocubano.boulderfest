import { getDatabase } from "../api/lib/database.js";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(dirname(__dirname), ".env.local") });

/**
 * Splits SQL statements intelligently, handling:
 * - Strings with embedded semicolons
 * - Triggers, stored procedures, and other blocks
 * - Comments (both line and block style)
 * - Custom delimiter: -- migrate:break
 */
function splitSqlStatements(sql) {
  // First check for custom delimiter approach
  if (sql.includes("-- migrate:break")) {
    return sql
      .split(/--\s*migrate:break/i)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // Otherwise use SQL-aware splitting
  const statements = [];
  let currentStatement = "";
  let inString = false;
  let stringDelimiter = null;
  let inLineComment = false;
  let inBlockComment = false;
  let inTrigger = false;
  
  const lines = sql.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;
    
    while (j < line.length) {
      const char = line[j];
      const nextChar = line[j + 1];
      
      // Handle line comments
      if (!inString && !inBlockComment && char === "-" && nextChar === "-") {
        inLineComment = true;
        currentStatement += line.substring(j);
        j = line.length;
        continue;
      }
      
      // Handle block comments
      if (!inString && !inLineComment && char === "/" && nextChar === "*") {
        inBlockComment = true;
        currentStatement += char + nextChar;
        j += 2;
        continue;
      }
      
      if (inBlockComment && char === "*" && nextChar === "/") {
        inBlockComment = false;
        currentStatement += char + nextChar;
        j += 2;
        continue;
      }
      
      // Handle strings
      if (!inLineComment && !inBlockComment) {
        if ((char === "'" || char === '"') && !inString) {
          inString = true;
          stringDelimiter = char;
        } else if (inString && char === stringDelimiter) {
          // Check for escaped quotes
          if (nextChar === stringDelimiter) {
            currentStatement += char + nextChar;
            j += 2;
            continue;
          }
          inString = false;
          stringDelimiter = null;
        }
      }
      
      // Check for trigger/procedure keywords (case-insensitive)
      if (!inString && !inLineComment && !inBlockComment) {
        const upperLine = line.toUpperCase();
        const remainingLine = upperLine.substring(j);
        
        if (remainingLine.startsWith("CREATE TRIGGER") || 
            remainingLine.startsWith("CREATE PROCEDURE") ||
            remainingLine.startsWith("CREATE FUNCTION")) {
          inTrigger = true;
        } else if (inTrigger && remainingLine.startsWith("END;")) {
          inTrigger = false;
        }
      }
      
      // Handle statement terminator
      if (!inString && !inLineComment && !inBlockComment && !inTrigger && char === ";") {
        currentStatement = currentStatement.trim();
        if (currentStatement.length > 0) {
          statements.push(currentStatement);
        }
        currentStatement = "";
        j++;
        continue;
      }
      
      currentStatement += char;
      j++;
    }
    
    // Add newline if not at end
    if (i < lines.length - 1) {
      currentStatement += "\n";
    }
    
    // Reset line comment flag at end of line
    inLineComment = false;
  }
  
  // Add any remaining statement
  currentStatement = currentStatement.trim();
  if (currentStatement.length > 0) {
    statements.push(currentStatement);
  }
  
  return statements;
}

async function runMigrations() {
  const db = getDatabase();

  try {
    // Create migrations table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = join(dirname(__dirname), "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration files`);

    for (const file of files) {
      // Check if migration was already executed
      const result = await db.execute({
        sql: "SELECT * FROM migrations WHERE filename = ?",
        args: [file],
      });

      if (result.rows.length > 0) {
        console.log(`✓ Already executed: ${file}`);
        continue;
      }

      // Read and execute migration
      const sql = readFileSync(join(migrationsDir, file), "utf-8");

      // Smart SQL statement splitting that handles complex cases
      // Uses a custom delimiter approach for safety
      const statements = splitSqlStatements(sql);

      console.log(
        `Running migration: ${file} (${statements.length} statements)`,
      );

      // Use transaction for atomic migration execution
      let transactionStarted = false;
      try {
        await db.execute("BEGIN TRANSACTION");
        transactionStarted = true;
        
        for (const statement of statements) {
          await db.execute(statement);
        }
        
        // Record migration as executed within transaction
        await db.execute({
          sql: `INSERT OR IGNORE INTO migrations (filename, executed_at) VALUES (?, CURRENT_TIMESTAMP)`,
          args: [file],
        });
        
        await db.execute("COMMIT");
        transactionStarted = false;
        console.log(`✅ Migration ${file} completed successfully`);
        
      } catch (error) {
        console.error(`Error executing migration ${file}:`, error.message);
        if (error.statement) {
          console.error("Statement:", error.statement.substring(0, 100) + "...");
        }
        
        // Always attempt rollback if transaction was started
        if (transactionStarted) {
          try {
            await db.execute("ROLLBACK");
            console.log("Transaction rolled back successfully");
          } catch (rollbackError) {
            console.error("Failed to rollback transaction:", rollbackError.message);
          }
        }
        
        throw error;
      }
    }

    console.log("\n✅ All migrations completed successfully");

    // Show table structure
    const tables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);

    console.log("\n📊 Database tables:");
    for (const table of tables.rows) {
      console.log(`  - ${table.name}`);
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

runMigrations().catch(console.error);
