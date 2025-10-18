import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

// Load .env.vercel manually
const envFile = readFileSync('.env.vercel', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
});

const client = createClient({
  url: envVars.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL,
  authToken: envVars.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
});

try {
  console.log('🔍 Checking database schema and Test Weekender data...\n');

  // Check if transactions table has event_id column
  const tableInfo = await client.execute("PRAGMA table_info(transactions)");
  console.log('Transactions table columns:');
  tableInfo.rows.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  const hasEventId = tableInfo.rows.some(col => col.name === 'event_id');
  console.log(`\n❌ Transactions table ${hasEventId ? 'HAS' : 'DOES NOT HAVE'} event_id column\n`);

  console.log('---\n');
  console.log('🔍 Checking all events and their tickets...\n');

  // Check all events
  const events = await client.execute('SELECT id, name, slug FROM events ORDER BY created_at DESC LIMIT 10');
  console.log(`Found ${events.rows.length} events:\n`);
  events.rows.forEach(event => {
    console.log(`  - ${event.name} (id: ${event.id}, slug: ${event.slug})`);
  });

  console.log('\n---\n');

  // Count tickets by event
  const ticketCounts = await client.execute(`
    SELECT
      t.event_id,
      COUNT(*) as count,
      SUM(t.price_cents) as total_price_cents,
      GROUP_CONCAT(DISTINCT tr.payment_processor) as processors
    FROM tickets t
    JOIN transactions tr ON t.transaction_id = tr.id
    GROUP BY t.event_id
  `);

  console.log('Tickets by event:');
  ticketCounts.rows.forEach(row => {
    console.log(`  ${row.event_id}: ${row.count} tickets, $${row.total_price_cents / 100} total, processors: ${row.processors}`);
  });

  console.log('\n---\n');

  // Check transaction event_id values for Test Weekender tickets
  console.log('🔍 Checking transaction.event_id values for Test Weekender tickets:\n');
  const trCheck = await client.execute(`
    SELECT
      tr.id as transaction_id,
      tr.event_id as transaction_event_id,
      tr.payment_processor,
      tr.amount_cents,
      tr.status,
      COUNT(t.ticket_id) as ticket_count,
      GROUP_CONCAT(t.event_id) as ticket_event_ids
    FROM transactions tr
    LEFT JOIN tickets t ON t.transaction_id = tr.id
    WHERE t.event_id = -1
    GROUP BY tr.id
  `);

  trCheck.rows.forEach(row => {
    console.log(`  Transaction #${row.transaction_id}:`);
    console.log(`    transaction.event_id = ${row.transaction_event_id} ${row.transaction_event_id === null ? '❌ NULL!' : row.transaction_event_id === -1 ? '✅' : '❌ MISMATCH!'}`);
    console.log(`    tickets.event_id = ${row.ticket_event_ids}`);
    console.log(`    processor = ${row.payment_processor}, amount = $${row.amount_cents/100}, status = ${row.status}`);
    console.log('');
  });

  console.log('---\n');

  // Show Test Weekender tickets specifically (event_id = -1)
  const result = await client.execute({
    sql: `SELECT
      t.ticket_id,
      t.event_id as ticket_event_id,
      t.ticket_type,
      t.price_cents,
      t.status as ticket_status,
      tr.event_id as transaction_event_id,
      tr.payment_processor,
      tr.amount_cents,
      tr.status as transaction_status,
      tr.source
    FROM tickets t
    JOIN transactions tr ON t.transaction_id = tr.id
    WHERE t.event_id = -1
    ORDER BY t.created_at DESC
    LIMIT 10`
  });

  console.log(`Found ${result.rows.length} "weekender" tickets:\n`);
  result.rows.forEach((row, i) => {
    console.log(`Ticket ${i + 1}:`);
    console.log(`  Event ID: ${row.event_id}`);
    console.log(`  ID: ${row.ticket_id}`);
    console.log(`  Type: ${row.ticket_type}`);
    console.log(`  Price: $${row.price_cents / 100}`);
    console.log(`  Status: ${row.ticket_status}`);
    console.log(`  Payment Processor: ${row.payment_processor}`);
    console.log(`  Transaction Amount: $${row.amount_cents / 100}`);
    console.log(`  Transaction Status: ${row.transaction_status}`);
    console.log(`  Source: ${row.source || 'online'}`);
    console.log('');
  });

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
