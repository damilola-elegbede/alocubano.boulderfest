/**
 * Database Utilities for Integration Tests
 * Handles test database setup, cleanup, and Turso connection management
 */
import { getDatabaseClient, resetDatabaseInstance } from '../../api/lib/database.js';
import { calculateMigrationChecksum } from '../helpers/migration-helpers.js';

class DatabaseHelper {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.testDatabaseUrl = null;
    this.mutex = Promise.resolve(); // Simple mutex using promises
    this.activeMutexCount = 0;
  }

  /**
   * Acquire mutex lock for database operations
   */
  async acquireMutex() {
    const previousMutex = this.mutex;
    let releaseMutex;
    
    this.mutex = new Promise(resolve => {
      releaseMutex = resolve;
    });
    
    this.activeMutexCount++;
    
    // Wait for previous operation to complete
    await previousMutex;
    
    return () => {
      this.activeMutexCount--;
      releaseMutex();
    };
  }

  /**
   * Initialize database for testing
   */
  async initialize() {
    if (this.initialized) {
      return this.client;
    }

    console.log('🗄️ Initializing test database...');

    try {
      // Set up test database URL - use in-memory for concurrent transaction tests to avoid locking
      this.testDatabaseUrl = process.env.TURSO_DATABASE_URL || ':memory:';
      
      // Important: Make sure the main database service uses our test database
      // by resetting it first to pick up our test environment variables
      await resetDatabaseInstance();
      
      // Get database client - ensure we use the shared instance
      this.client = await getDatabaseClient();
      
      // Verify connection
      await this.verifyConnection();
      
      // Run basic migrations if needed
      await this.ensureBasicSchema();
      
      this.initialized = true;
      console.log('✅ Test database initialized');
      
      return this.client;
    } catch (error) {
      console.error('❌ Failed to initialize test database:', error);
      throw error;
    }
  }

  /**
   * Verify database connection
   */
  async verifyConnection() {
    try {
      const result = await this.client.execute('SELECT 1 as test');
      if (!result.rows || result.rows.length === 0) {
        throw new Error('Database connection test failed');
      }
      console.log('✅ Database connection verified');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Ensure basic schema exists for testing
   */
  async ensureBasicSchema() {
    try {
      // Create core tables needed for integration tests
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stripe_payment_intent_id TEXT UNIQUE,
          event_name TEXT NOT NULL,
          ticket_type TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price_cents INTEGER NOT NULL,
          total_amount_cents INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'usd',
          buyer_name TEXT NOT NULL,
          buyer_email TEXT NOT NULL,
          buyer_phone TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          qr_token TEXT UNIQUE,
          scanned_count INTEGER DEFAULT 0,
          max_scans INTEGER DEFAULT 5,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME
        )
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stripe_payment_intent_id TEXT,
          event_type TEXT NOT NULL,
          event_data TEXT,
          processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS email_subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          source TEXT DEFAULT 'website',
          status TEXT DEFAULT 'active',
          brevo_list_id INTEGER,
          bounce_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create migrations table for checksum tests
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version TEXT UNIQUE NOT NULL,
          filename TEXT NOT NULL,
          description TEXT,
          checksum TEXT NOT NULL,
          executed_at TEXT NOT NULL,
          execution_time_ms INTEGER DEFAULT 0
        )
      `);

      // Create additional tables needed for transaction tests
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'active'
        )
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS registrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stripe_session_id TEXT,
          email TEXT NOT NULL,
          ticket_type TEXT NOT NULL,
          quantity INTEGER DEFAULT 1,
          amount DECIMAL(10,2),
          payment_status TEXT DEFAULT 'pending',
          paid_at DATETIME,
          refunded_at DATETIME,
          refund_amount DECIMAL(10,2),
          tickets_generated INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Update tickets table schema to match test expectations
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS tickets_transaction (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT UNIQUE,
          registration_id INTEGER,
          email TEXT NOT NULL,
          buyer_email TEXT NOT NULL,
          buyer_name TEXT NOT NULL,
          event_name TEXT NOT NULL,
          ticket_type TEXT NOT NULL,
          event_date TEXT,
          attendee_name TEXT,
          qr_code TEXT UNIQUE,
          qr_token TEXT UNIQUE,
          status TEXT DEFAULT 'valid',
          unit_price_cents INTEGER DEFAULT 0,
          total_amount_cents INTEGER DEFAULT 0,
          currency TEXT DEFAULT 'usd',
          invalidated_at DATETIME,
          scanned_count INTEGER DEFAULT 0,
          max_scans INTEGER DEFAULT 5,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME
        )
      `);

      // Create refunds table for transaction tests
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS refunds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          registration_id INTEGER NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ Basic database schema ensured');
    } catch (error) {
      console.error('⚠️ Error ensuring schema:', error.message);
      // Don't throw - some tables might already exist
    }
  }

  /**
   * Clean database between tests
   */
  async cleanBetweenTests() {
    if (!this.client) {
      await this.initialize();
    }

    try {
      // Clear test data but preserve schema
      await this.client.execute('DELETE FROM tickets WHERE buyer_email LIKE ? OR buyer_email LIKE ?', ['%@test.com', '%@example.com']);
      await this.client.execute('DELETE FROM transactions WHERE event_data LIKE ? OR event_data LIKE ?', ['%test%', '%example%']);
      await this.client.execute('DELETE FROM email_subscribers WHERE email LIKE ? OR email LIKE ?', ['%@test.com', '%@example.com']);
      
      // Clean additional transaction test tables
      try {
        await this.client.execute('DELETE FROM subscribers WHERE email LIKE ? OR email LIKE ?', ['%@test.integration', '%@example.com']);
        await this.client.execute('DELETE FROM registrations WHERE email LIKE ? OR email LIKE ?', ['%@test.integration', '%@example.com']);
      } catch (error) {
        // Tables might not exist, which is fine
      }
      
      console.log('🧹 Test data cleaned');
    } catch (error) {
      console.error('⚠️ Error cleaning test data:', error.message);
      // Don't throw - test should continue
    }
  }

  /**
   * Create test ticket record
   */
  async createTestTicket(ticketData = {}) {
    const defaultTicket = {
      stripe_payment_intent_id: `pi_test_${Date.now()}`,
      event_name: 'Test Event 2026',
      ticket_type: 'Weekend Pass',
      quantity: 1,
      unit_price_cents: 12500, // $125.00
      total_amount_cents: 12500,
      currency: 'usd',
      buyer_name: 'Test User',
      buyer_email: 'test@example.com',
      buyer_phone: '+1234567890',
      status: 'confirmed',
      qr_token: `qr_test_${Date.now()}`,
      scanned_count: 0,
      max_scans: 5
    };

    const ticket = { ...defaultTicket, ...ticketData };
    
    const result = await this.client.execute(`
      INSERT INTO tickets (
        stripe_payment_intent_id, event_name, ticket_type, quantity,
        unit_price_cents, total_amount_cents, currency, buyer_name,
        buyer_email, buyer_phone, status, qr_token, scanned_count, max_scans
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ticket.stripe_payment_intent_id,
      ticket.event_name,
      ticket.ticket_type,
      ticket.quantity,
      ticket.unit_price_cents,
      ticket.total_amount_cents,
      ticket.currency,
      ticket.buyer_name,
      ticket.buyer_email,
      ticket.buyer_phone,
      ticket.status,
      ticket.qr_token,
      ticket.scanned_count,
      ticket.max_scans
    ]);

    return {
      id: result.lastInsertRowid, // Keep as BigInt for ticket operations
      ...ticket
    };
  }

  /**
   * Create test email subscriber
   */
  async createTestSubscriber(subscriberData = {}) {
    const defaultSubscriber = {
      email: `test-${Date.now()}@example.com`,
      source: 'test',
      status: 'active',
      brevo_list_id: 2
    };

    const subscriber = { ...defaultSubscriber, ...subscriberData };
    
    const result = await this.client.execute(`
      INSERT INTO email_subscribers (email, source, status, brevo_list_id)
      VALUES (?, ?, ?, ?)
    `, [
      subscriber.email,
      subscriber.source,
      subscriber.status,
      subscriber.brevo_list_id
    ]);

    return {
      id: Number(result.lastInsertRowid), // Convert BigInt to Number for consistency
      ...subscriber
    };
  }

  /**
   * Get ticket by ID
   */
  async getTicket(ticketId) {
    const result = await this.client.execute('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    return result.rows[0] || null;
  }

  /**
   * Get ticket by QR token
   */
  async getTicketByQrToken(qrToken) {
    const result = await this.client.execute('SELECT * FROM tickets WHERE qr_token = ?', [qrToken]);
    return result.rows[0] || null;
  }

  /**
   * Update ticket scan count
   */
  async updateTicketScanCount(ticketId, scanCount) {
    await this.client.execute(
      'UPDATE tickets SET scanned_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [scanCount, ticketId]
    );
  }

  /**
   * Get subscriber by email
   */
  async getSubscriber(email) {
    const result = await this.client.execute('SELECT * FROM email_subscribers WHERE email = ?', [email]);
    return result.rows[0] || null;
  }

  /**
   * Execute raw SQL query (for advanced test scenarios)
   */
  async query(sql, params = []) {
    if (!this.client) {
      await this.initialize();
    }
    return this.client.execute(sql, params);
  }

  /**
   * Acquire mutex lock for database operations with timeout
   */
  async acquireMutex(timeout = 10000) {
    const previousMutex = this.mutex;
    let releaseMutex;
    
    this.mutex = new Promise(resolve => {
      releaseMutex = resolve;
    });
    
    this.activeMutexCount++;
    
    // Wait for previous operation to complete with timeout
    try {
      await Promise.race([
        previousMutex,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Mutex timeout')), timeout)
        )
      ]);
    } catch (error) {
      this.activeMutexCount--;
      releaseMutex();
      throw error;
    }
    
    return () => {
      this.activeMutexCount--;
      releaseMutex();
    };
  }

  /**
   * Create database transaction for tests with proper ACID properties
   * @returns {Object} Transaction object with execute, commit, and rollback methods
   */
  async createTransaction() {
    if (!this.client || !this.initialized) {
      await this.initialize();
    }

    // Try to use native transaction support if available
    if (typeof this.client.transaction === 'function') {
      try {
        const nativeTx = await this.client.transaction();
        
        // Wrap native transaction to handle closed state gracefully
        return {
          execute: nativeTx.execute.bind(nativeTx),
          commit: nativeTx.commit.bind(nativeTx),
          rollback: async () => {
            try {
              return await nativeTx.rollback();
            } catch (error) {
              if (error.message.includes('TRANSACTION_CLOSED')) {
                // Transaction already closed, this is fine
                return true;
              }
              throw error;
            }
          }
        };
      } catch (error) {
        console.warn('Native transaction failed, using fallback:', error.message);
      }
    }

    // Acquire mutex lock for the entire transaction
    const releaseMutex = await this.acquireMutex();
    
    // Proper SQLite transaction implementation with retry logic
    const statements = [];
    let transactionStarted = false;
    let committed = false;
    let rolledBack = false;
    let transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const executeWithRetry = async (sql, params = [], maxRetries = 3) => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await this.client.execute(sql, params);
        } catch (error) {
          if (error.message.includes('SQLITE_BUSY') && attempt < maxRetries - 1) {
            // Wait with exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            continue;
          }
          throw error;
        }
      }
    };

    return {
      execute: async (sql, params = []) => {
        if (committed || rolledBack) {
          throw new Error('Transaction already completed');
        }
        
        try {
          // Start transaction on first execute with retry
          if (!transactionStarted) {
            await executeWithRetry('BEGIN IMMEDIATE');
            transactionStarted = true;
          }
          
          // Store statement for potential rollback tracking
          statements.push({ sql, params });
          
          // Execute within the transaction with retry
          const result = await executeWithRetry(sql, params);
          return result;
        } catch (error) {
          // Auto-rollback on error
          if (transactionStarted && !rolledBack) {
            try {
              await executeWithRetry('ROLLBACK');
            } catch (rollbackError) {
              console.warn('Error during auto-rollback:', rollbackError.message);
            }
            rolledBack = true;
            releaseMutex();
          }
          throw error;
        }
      },
      commit: async () => {
        if (committed || rolledBack) {
          throw new Error('Transaction already completed');
        }
        
        try {
          if (transactionStarted) {
            await executeWithRetry('COMMIT');
          }
          committed = true;
          return true;
        } finally {
          releaseMutex();
        }
      },
      rollback: async () => {
        if (committed || rolledBack) {
          throw new Error('Transaction already completed');
        }
        
        try {
          if (transactionStarted) {
            await executeWithRetry('ROLLBACK');
          }
          rolledBack = true;
          return true;
        } finally {
          releaseMutex();
        }
      }
    };
  }

  /**
   * Calculate checksum for migration verification
   */
  calculateMigrationChecksum(content) {
    return calculateMigrationChecksum(content);
  }

  /**
   * Get database statistics
   */
  async getStats() {
    if (!this.client) {
      return { error: 'Database not initialized' };
    }

    try {
      const [tickets, subscribers, transactions] = await Promise.all([
        this.client.execute('SELECT COUNT(*) as count FROM tickets'),
        this.client.execute('SELECT COUNT(*) as count FROM email_subscribers'),
        this.client.execute('SELECT COUNT(*) as count FROM transactions')
      ]);

      return {
        tickets: tickets.rows[0]?.count || 0,
        subscribers: subscribers.rows[0]?.count || 0,
        transactions: transactions.rows[0]?.count || 0,
        connectionUrl: this.testDatabaseUrl,
        initialized: this.initialized
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Test transaction support
   */
  async testTransaction() {
    try {
      // Test basic transaction functionality
      const testEmail = `transaction-test-${Date.now()}@example.com`;
      
      // This would be wrapped in a transaction in a real scenario
      const result = await this.client.execute(
        'INSERT INTO email_subscribers (email, source) VALUES (?, ?)',
        [testEmail, 'transaction-test']
      );
      
      // Clean up
      await this.client.execute('DELETE FROM email_subscribers WHERE email = ?', [testEmail]);
      
      return { success: true, insertId: result.lastInsertRowid }; // Keep as BigInt for testTransaction
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup database resources
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }

    try {
      // Clean test data
      await this.cleanBetweenTests();
      
      // Reset database instance
      await resetDatabaseInstance();
      
      this.client = null;
      this.initialized = false;
      
      console.log('✅ Database cleaned up');
    } catch (error) {
      console.error('⚠️ Error during database cleanup:', error.message);
    }
  }
}

// Export singleton instance
export const databaseHelper = new DatabaseHelper();

// Export class for creating additional instances if needed
export { DatabaseHelper };