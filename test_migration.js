import { MigrationSystem } from './scripts/migrate.js';
import { promises as fs } from "fs";

async function test() {
  const m = new MigrationSystem();
  const content = await fs.readFile('./migrations/001_core_tables.sql', 'utf8');
  const statements = m.parseSQLStatements(content);
  
  // Find the transactions CREATE TABLE statement
  const createTxn = statements.find(s => s.includes('CREATE TABLE IF NOT EXISTS transactions'));
  
  if (createTxn) {
    console.log("Found transactions CREATE TABLE:");
    console.log(createTxn.substring(0, 500));
    console.log("\n\nChecking for CHECK constraint:");
    console.log("Has 'CHECK (type IN':", createTxn.includes('CHECK (type IN'));
  } else {
    console.log("ERROR: Could not find transactions CREATE TABLE");
    console.log("All statements:", statements.map(s => s.substring(0, 50)));
  }
}

test();
