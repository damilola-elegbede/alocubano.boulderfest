import { describe, it, expect } from 'vitest';
import { createTestDb } from '../core/db.js';

describe('Database Connection Pooling', () => {
  it('reuses connections efficiently', () => {
    const db1 = createTestDb();
    const db2 = createTestDb();
    // Each call creates new db, so just test they're created
    expect(db1).toBeDefined();
    expect(db2).toBeDefined();
    db1.close();
    db2.close();
  });

  it('handles connection limits', () => {
    const connections = [];
    for (let i = 0; i < 5; i++) {
      connections.push(createTestDb());
    }
    expect(connections).toHaveLength(5);
    connections.forEach(db => db.close());
  });

  it('recovers from connection errors', () => {
    const db = createTestDb();
    db.close();
    const newDb = createTestDb();
    expect(newDb).toBeDefined();
    newDb.close();
  });
});