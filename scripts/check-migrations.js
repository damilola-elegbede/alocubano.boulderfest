import { getDatabase } from '../api/lib/database.js';

async function checkMigrations() {
  const db = getDatabase();
  
  try {
    // Check migrations table
    const migrations = await db.execute('SELECT * FROM migrations ORDER BY executed_at DESC');
    console.log('Applied migrations:');
    migrations.rows.forEach(m => {
      console.log(`  - ${m.filename} (executed: ${m.executed_at})`);
    });
    
    // Check if wallet fields exist
    console.log('\nChecking wallet fields in tickets table...');
    try {
      await db.execute('SELECT apple_pass_serial, google_pass_id FROM tickets LIMIT 1');
      console.log('✅ Wallet fields exist in tickets table');
    } catch (error) {
      console.log('❌ Wallet fields do not exist in tickets table');
    }
    
    // Check if wallet_pass_events table exists
    console.log('\nChecking wallet_pass_events table...');
    try {
      await db.execute('SELECT COUNT(*) FROM wallet_pass_events');
      console.log('✅ wallet_pass_events table exists');
    } catch (error) {
      console.log('❌ wallet_pass_events table does not exist');
    }
    
  } catch (error) {
    console.error('Error checking migrations:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

checkMigrations();