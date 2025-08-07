import { getDatabase } from '../api/lib/database.js';

async function checkColumns() {
  const db = getDatabase();
  
  try {
    // Get table info
    const result = await db.execute("PRAGMA table_info(tickets)");
    console.log('Tickets table columns:');
    result.rows.forEach(col => {
      console.log(`  - ${col.name} (${col.type})`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

checkColumns();