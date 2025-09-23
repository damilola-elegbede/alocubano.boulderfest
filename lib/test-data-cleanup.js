/**
 * Test Data Cleanup Service
 *
 * Provides automated cleanup functions for test data with comprehensive audit trails,
 * batch deletion optimization, and verification capabilities.
 */

import { getDatabaseClient } from "./database.js";
import { createTestModeMetadata, logTestModeOperation } from "./test-mode-utils.js";

export class TestDataCleanupService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Ensure database client is initialized
   */
  async ensureInitialized() {
    if (this.initialized && this.client) {
      return this.client;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    try {
      this.client = await getDatabaseClient();
      if (!this.client) {
        throw new Error('Failed to get database client - client is null');
      }
      this.initialized = true;
      return this.client;
    } catch (error) {
      this.initialized = false;
      this.client = null;
      throw new Error(`Failed to initialize test data cleanup service: ${error.message}`);
    }
  }

  /**
   * Perform dry run cleanup - identify records without deleting them
   *
   * @param {Object} db - Database client (optional, will use default if not provided)
   * @param {Object} criteria - Cleanup criteria
   * @returns {Object} Dry run results
   */
  async performDryRun(db = null, criteria) {
    const client = db || await this.ensureInitialized();
    const startTime = Date.now();

    try {
      logTestModeOperation('test_data_cleanup_dry_run', { criteria });

      // Build cleanup filter based on criteria
      const cleanupFilter = this.buildCleanupFilter(criteria);

      // Identify test data candidates
      const candidates = await this.identifyCleanupCandidates(client, cleanupFilter);

      // Generate detailed analysis
      const analysis = await this.analyzeCleanupImpact(client, candidates, criteria);

      return {
        success: true,
        dry_run: true,
        records_identified: candidates.total_count,
        records_deleted: 0,
        transactions_deleted: 0,
        tickets_deleted: 0,
        transaction_items_deleted: 0,
        related_records_deleted: 0,
        candidates,
        analysis,
        verification_checksum: this.generateVerificationChecksum(candidates.total_count, Date.now()),
        metadata: {
          operation: 'dry_run',
          duration_ms: Date.now() - startTime,
          criteria,
          impact_assessment: analysis.impact_level
        }
      };

    } catch (error) {
      console.error('Dry run cleanup failed:', error);
      throw new Error(`Dry run cleanup failed: ${error.message}`);
    }
  }

  /**
   * Perform actual cleanup with comprehensive audit trail
   *
   * @param {Object} db - Database client (optional, will use default if not provided)
   * @param {Object} criteria - Cleanup criteria
   * @returns {Object} Cleanup results
   */
  async performCleanup(db = null, criteria) {
    const client = db || await this.ensureInitialized();
    const startTime = Date.now();
    let transactionStarted = false;

    try {
      logTestModeOperation('test_data_cleanup_start', { criteria });

      // Validate cleanup criteria
      this.validateCleanupCriteria(criteria);

      // Build cleanup filter
      const cleanupFilter = this.buildCleanupFilter(criteria);

      // Identify records to be deleted
      const candidates = await this.identifyCleanupCandidates(client, cleanupFilter);

      if (candidates.total_count === 0) {
        return {
          success: true,
          records_identified: 0,
          records_deleted: 0,
          transactions_deleted: 0,
          tickets_deleted: 0,
          transaction_items_deleted: 0,
          related_records_deleted: 0,
          verification_checksum: this.generateVerificationChecksum(0, Date.now()),
          metadata: {
            operation: 'cleanup',
            duration_ms: Date.now() - startTime,
            message: 'No records found matching cleanup criteria'
          }
        };
      }

      // Perform backup if required
      const backupData = criteria.create_backup ?
        await this.createCleanupBackup(client, candidates) : null;

      // Begin atomic cleanup transaction
      await client.execute('BEGIN TRANSACTION');
      transactionStarted = true;

      // Perform cleanup in batches for large datasets
      const batchSize = criteria.batch_size || 100;
      const cleanupResults = await this.performBatchCleanup(client, candidates, batchSize);

      // Verify cleanup results
      const verification = await this.verifyCleanupResults(client, candidates, cleanupResults);

      if (!verification.success && !criteria.force) {
        await client.execute('ROLLBACK');
        throw new Error(`Cleanup verification failed: ${verification.error}`);
      }

      // Commit transaction
      await client.execute('COMMIT');
      transactionStarted = false;

      logTestModeOperation('test_data_cleanup_completed', {
        ...cleanupResults,
        verification
      });

      return {
        success: true,
        records_identified: candidates.total_count,
        records_deleted: cleanupResults.total_deleted,
        transactions_deleted: cleanupResults.transactions_deleted,
        tickets_deleted: cleanupResults.tickets_deleted,
        transaction_items_deleted: cleanupResults.transaction_items_deleted,
        related_records_deleted: cleanupResults.related_records_deleted,
        verification_checksum: this.generateVerificationChecksum(
          cleanupResults.total_deleted,
          Date.now()
        ),
        verification,
        backup_data: backupData,
        metadata: {
          operation: 'cleanup',
          duration_ms: Date.now() - startTime,
          batch_size: batchSize,
          batches_processed: cleanupResults.batches_processed,
          criteria
        }
      };

    } catch (error) {
      if (transactionStarted) {
        try {
          await client.execute('ROLLBACK');
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError);
        }
      }

      logTestModeOperation('test_data_cleanup_failed', {
        error: error.message,
        criteria
      });

      throw new Error(`Test data cleanup failed: ${error.message}`);
    }
  }

  /**
   * Build cleanup filter SQL based on criteria
   */
  buildCleanupFilter(criteria) {
    const conditions = ['is_test = 1'];
    const params = [];

    // Age-based filtering
    if (criteria.max_age_days && criteria.max_age_days > 0) {
      conditions.push(`created_at < datetime('now', '-${criteria.max_age_days} days')`);
    }

    // Exclude recent data
    if (criteria.exclude_recent_hours && criteria.exclude_recent_hours > 0) {
      conditions.push(`created_at < datetime('now', '-${criteria.exclude_recent_hours} hours')`);
    }

    // Status-based filtering
    if (criteria.status_filter) {
      const statusConditions = criteria.status_filter.map(() => '?').join(',');
      conditions.push(`status IN (${statusConditions})`);
      params.push(...criteria.status_filter);
    }

    // Customer email filtering (for specific test user cleanup)
    if (criteria.customer_email_pattern) {
      conditions.push('customer_email LIKE ?');
      params.push(criteria.customer_email_pattern);
    }

    return {
      where_clause: conditions.join(' AND '),
      params
    };
  }

  /**
   * Identify records that match cleanup criteria
   */
  async identifyCleanupCandidates(client, cleanupFilter) {
    try {
      // Get transaction candidates
      const transactionCandidatesQuery = `
        SELECT
          id,
          transaction_id,
          status,
          amount_cents,
          customer_email,
          created_at,
          julianday('now') - julianday(created_at) as age_days
        FROM transactions
        WHERE ${cleanupFilter.where_clause}
        ORDER BY created_at ASC
      `;

      const transactionCandidates = await client.execute(
        transactionCandidatesQuery,
        cleanupFilter.params
      );

      // Get related tickets and transaction items counts
      const transactionIds = transactionCandidates.rows.map(t => t.id);

      let ticketCandidates = { rows: [] };
      let transactionItemCandidates = { rows: [] };

      if (transactionIds.length > 0) {
        const placeholders = transactionIds.map(() => '?').join(',');

        const ticketQuery = `
          SELECT id, ticket_id, transaction_id, ticket_type, price_cents, attendee_email, created_at
          FROM tickets
          WHERE transaction_id IN (${placeholders}) AND is_test = 1
        `;

        const transactionItemQuery = `
          SELECT id, transaction_id, item_type, total_price_cents, created_at
          FROM transaction_items
          WHERE transaction_id IN (${placeholders}) AND is_test = 1
        `;

        [ticketCandidates, transactionItemCandidates] = await Promise.all([
          client.execute(ticketQuery, transactionIds),
          client.execute(transactionItemQuery, transactionIds)
        ]);
      }

      // Calculate summary statistics
      const summary = {
        transactions: {
          count: transactionCandidates.rows.length,
          total_amount_cents: transactionCandidates.rows.reduce((sum, t) => sum + (t.amount_cents || 0), 0),
          status_breakdown: this.calculateStatusBreakdown(transactionCandidates.rows),
          age_distribution: this.calculateAgeDistribution(transactionCandidates.rows)
        },
        tickets: {
          count: ticketCandidates.rows.length,
          total_amount_cents: ticketCandidates.rows.reduce((sum, t) => sum + (t.price_cents || 0), 0),
          ticket_type_breakdown: this.calculateTicketTypeBreakdown(ticketCandidates.rows)
        },
        transaction_items: {
          count: transactionItemCandidates.rows.length,
          total_amount_cents: transactionItemCandidates.rows.reduce((sum, t) => sum + (t.total_price_cents || 0), 0)
        }
      };

      return {
        transactions: transactionCandidates.rows,
        tickets: ticketCandidates.rows,
        transaction_items: transactionItemCandidates.rows,
        total_count: summary.transactions.count + summary.tickets.count + summary.transaction_items.count,
        summary
      };

    } catch (error) {
      throw new Error(`Failed to identify cleanup candidates: ${error.message}`);
    }
  }

  /**
   * Analyze the impact of proposed cleanup
   */
  async analyzeCleanupImpact(client, candidates, criteria) {
    try {
      // Calculate data volume impact
      const dataVolumeImpact = {
        transactions_to_delete: candidates.transactions.length,
        tickets_to_delete: candidates.tickets.length,
        transaction_items_to_delete: candidates.transaction_items.length,
        total_records_to_delete: candidates.total_count
      };

      // Calculate financial impact
      const financialImpact = {
        total_test_amount_cents:
          candidates.summary.transactions.total_amount_cents +
          candidates.summary.tickets.total_amount_cents +
          candidates.summary.transaction_items.total_amount_cents
      };

      // Calculate time range impact
      const timeRangeImpact = {
        oldest_record: candidates.transactions.length > 0 ?
          Math.min(...candidates.transactions.map(t => new Date(t.created_at).getTime())) : null,
        newest_record: candidates.transactions.length > 0 ?
          Math.max(...candidates.transactions.map(t => new Date(t.created_at).getTime())) : null
      };

      // Determine impact level
      let impact_level = 'low';
      if (dataVolumeImpact.total_records_to_delete > 1000) {
        impact_level = 'high';
      } else if (dataVolumeImpact.total_records_to_delete > 100) {
        impact_level = 'medium';
      }

      // Check for potential issues
      const warnings = [];
      if (candidates.summary.transactions.status_breakdown.completed > 0) {
        warnings.push('Some completed test transactions will be deleted');
      }
      if (candidates.summary.tickets.count > candidates.summary.transactions.count * 2) {
        warnings.push('High ticket-to-transaction ratio detected');
      }

      return {
        data_volume: dataVolumeImpact,
        financial_impact: financialImpact,
        time_range: timeRangeImpact,
        impact_level,
        warnings,
        recommendations: this.generateCleanupRecommendations(candidates, criteria)
      };

    } catch (error) {
      throw new Error(`Failed to analyze cleanup impact: ${error.message}`);
    }
  }

  /**
   * Perform cleanup in batches for optimal performance
   */
  async performBatchCleanup(client, candidates, batchSize) {
    let totalDeleted = 0;
    let transactionsDeleted = 0;
    let ticketsDeleted = 0;
    let transactionItemsDeleted = 0;
    let relatedRecordsDeleted = 0;
    let batchesProcessed = 0;

    try {
      // Process transactions in batches
      const transactionBatches = this.createBatches(candidates.transactions, batchSize);

      for (const batch of transactionBatches) {
        const transactionIds = batch.map(t => t.id);
        const placeholders = transactionIds.map(() => '?').join(',');

        // Delete related tickets first
        const ticketDeleteResult = await client.execute(
          `DELETE FROM tickets WHERE transaction_id IN (${placeholders}) AND is_test = 1`,
          transactionIds
        );
        ticketsDeleted += ticketDeleteResult.changes || 0;

        // Delete related transaction items
        const itemDeleteResult = await client.execute(
          `DELETE FROM transaction_items WHERE transaction_id IN (${placeholders}) AND is_test = 1`,
          transactionIds
        );
        transactionItemsDeleted += itemDeleteResult.changes || 0;

        // Delete transactions
        const transactionDeleteResult = await client.execute(
          `DELETE FROM transactions WHERE id IN (${placeholders}) AND is_test = 1`,
          transactionIds
        );
        transactionsDeleted += transactionDeleteResult.changes || 0;

        batchesProcessed++;

        // Add small delay between batches to prevent database overload
        if (batchesProcessed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Clean up related audit logs
      const auditCleanupResult = await client.execute(`
        DELETE FROM audit_logs
        WHERE metadata IS NOT NULL
          AND json_extract(metadata, '$.test_mode') = 1
          AND created_at < datetime('now', '-7 days')
      `);
      relatedRecordsDeleted = auditCleanupResult.changes || 0;

      totalDeleted = transactionsDeleted + ticketsDeleted + transactionItemsDeleted;

      return {
        total_deleted: totalDeleted,
        transactions_deleted: transactionsDeleted,
        tickets_deleted: ticketsDeleted,
        transaction_items_deleted: transactionItemsDeleted,
        related_records_deleted: relatedRecordsDeleted,
        batches_processed: batchesProcessed
      };

    } catch (error) {
      throw new Error(`Batch cleanup failed at batch ${batchesProcessed}: ${error.message}`);
    }
  }

  /**
   * Create backup of data being deleted (for rollback purposes)
   */
  async createCleanupBackup(client, candidates) {
    try {
      // For large datasets, only backup critical transaction data
      const criticalTransactions = candidates.transactions
        .filter(t => t.status === 'completed' || t.amount_cents > 0)
        .slice(0, 100); // Limit backup size

      return {
        timestamp: new Date().toISOString(),
        critical_transactions: criticalTransactions,
        backup_size: criticalTransactions.length,
        full_backup: false,
        note: 'Limited backup of critical test data for verification purposes'
      };

    } catch (error) {
      console.warn('Failed to create cleanup backup:', error);
      return null;
    }
  }

  /**
   * Verify cleanup results
   */
  async verifyCleanupResults(client, candidates, cleanupResults) {
    try {
      // Check that expected number of records were deleted
      const expectedDeleted = candidates.total_count;
      const actualDeleted = cleanupResults.total_deleted;

      if (Math.abs(expectedDeleted - actualDeleted) > expectedDeleted * 0.1) {
        return {
          success: false,
          error: `Deletion count mismatch: expected ${expectedDeleted}, actual ${actualDeleted}`,
          expected: expectedDeleted,
          actual: actualDeleted
        };
      }

      // Verify no test data remains that should have been deleted
      const remainingTestData = await client.execute(`
        SELECT COUNT(*) as count FROM transactions
        WHERE is_test = 1 AND created_at < datetime('now', '-30 days')
      `);

      const remainingCount = remainingTestData.rows[0].count;

      return {
        success: true,
        verification_passed: true,
        expected_deleted: expectedDeleted,
        actual_deleted: actualDeleted,
        remaining_old_test_data: remainingCount,
        verification_timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Verification failed: ${error.message}`
      };
    }
  }

  /**
   * Validate cleanup criteria
   */
  validateCleanupCriteria(criteria) {
    if (!criteria) {
      throw new Error('Cleanup criteria is required');
    }

    if (criteria.max_records && (criteria.max_records < 1 || criteria.max_records > 10000)) {
      throw new Error('max_records must be between 1 and 10000');
    }

    if (criteria.max_age_days && criteria.max_age_days < 0) {
      throw new Error('max_age_days cannot be negative');
    }

    if (!criteria.force && (!criteria.max_age_days || criteria.max_age_days < 1)) {
      throw new Error('max_age_days must be at least 1 unless force=true');
    }
  }

  /**
   * Helper method to create batches from array
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Calculate status breakdown for transactions
   */
  calculateStatusBreakdown(transactions) {
    const breakdown = {};
    transactions.forEach(t => {
      breakdown[t.status] = (breakdown[t.status] || 0) + 1;
    });
    return breakdown;
  }

  /**
   * Calculate age distribution for records
   */
  calculateAgeDistribution(records) {
    const distribution = {
      very_recent: 0,  // < 1 day
      recent: 0,       // 1-7 days
      old: 0,          // 7-30 days
      very_old: 0      // > 30 days
    };

    records.forEach(record => {
      const age = record.age_days || 0;
      if (age < 1) distribution.very_recent++;
      else if (age < 7) distribution.recent++;
      else if (age < 30) distribution.old++;
      else distribution.very_old++;
    });

    return distribution;
  }

  /**
   * Calculate ticket type breakdown
   */
  calculateTicketTypeBreakdown(tickets) {
    const breakdown = {};
    tickets.forEach(t => {
      breakdown[t.ticket_type] = (breakdown[t.ticket_type] || 0) + 1;
    });
    return breakdown;
  }

  /**
   * Generate cleanup recommendations
   */
  generateCleanupRecommendations(candidates, criteria) {
    const recommendations = [];

    if (candidates.summary.transactions.status_breakdown.pending > 0) {
      recommendations.push('Consider shorter retention for pending test transactions');
    }

    if (candidates.summary.transactions.status_breakdown.failed > 10) {
      recommendations.push('High number of failed transactions - consider cleanup process optimization');
    }

    if (candidates.total_count > 1000) {
      recommendations.push('Large cleanup operation - consider running during low-traffic hours');
    }

    if (!criteria.exclude_recent_hours || criteria.exclude_recent_hours < 24) {
      recommendations.push('Consider excluding recent test data (last 24 hours) to avoid interfering with active tests');
    }

    return recommendations;
  }

  /**
   * Generate verification checksum
   */
  generateVerificationChecksum(recordCount, timestamp) {
    const data = `${recordCount}_${timestamp}_test_cleanup_verification`;
    return Buffer.from(data).toString('base64').substring(0, 16);
  }
}

// Create and export singleton instance
export default new TestDataCleanupService();