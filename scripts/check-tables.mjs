import { getDatabaseClient } from '../lib/database.js';

const client = await getDatabaseClient();
const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('\nTables in database:');
result.rows.forEach(r => console.log(' -', r.name));
console.log('');
process.exit(0);