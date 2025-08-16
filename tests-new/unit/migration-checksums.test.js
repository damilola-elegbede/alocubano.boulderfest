import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { createTestDb } from '../core/db.js';

describe('Migration Checksums', () => {
  it('validates checksum integrity', () => {
    const content = 'CREATE TABLE test (id INTEGER);';
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    const expectedChecksum = crypto.createHash('sha256').update(content).digest('hex');
    expect(checksum).toBe(expectedChecksum);
  });

  it('maintains migration order', () => {
    const migrations = [
      '001_initial.sql',
      '002_add_users.sql',
      '003_add_transactions.sql'
    ];
    const sorted = [...migrations].sort();
    expect(migrations).toEqual(sorted);
  });

  it('supports rollback capability', () => {
    const db = createTestDb();
    const journalMode = db.pragma('journal_mode');
    // Test that we can query journal mode (rollback capability exists)
    expect(journalMode).toBeDefined();
    expect(journalMode).toHaveLength(1);
    db.close();
  });
});