/**
 * Connection State Machine
 *
 * Provides explicit state management for database connections with atomic transitions,
 * operation validation, and error recovery. Designed to work with ConnectionManager
 * for comprehensive connection pool management.
 */

export class ConnectionStateMachine {
  constructor(connectionId, connection, options = {}) {
    this.id = connectionId;
    this.connection = connection;
    this.state = 'INITIALIZING';
    this.previousState = null;
    this.stateHistory = [];
    this.observers = new Set();
    this.operationQueue = [];
    this.lastActivity = Date.now();
    this.created = Date.now();
    this.transitionLock = false;
    this.maxHistorySize = options.maxHistorySize || 50;
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
    this.maxRetries = options.maxRetries || 3;
    this.retryCount = 0;

    // Valid state transitions
    this.transitions = new Map([
      ['INITIALIZING', ['CONNECTED', 'FAILED']],
      ['CONNECTED', ['IN_USE', 'IDLE', 'CLOSING', 'FAILED']],
      ['IN_USE', ['IDLE', 'CLOSING', 'FAILED']],
      ['IDLE', ['IN_USE', 'CLOSING', 'FAILED', 'DRAINING']],
      ['DRAINING', ['CLOSING', 'FAILED']],
      ['CLOSING', ['CLOSED', 'FAILED']],
      ['FAILED', ['INITIALIZING', 'CLOSED']],
      ['CLOSED', ['INITIALIZING']]
    ]);

    // Operations allowed in each state
    this.allowedOperations = new Map([
      ['INITIALIZING', []],
      ['CONNECTED', ['execute', 'prepare']],
      ['IN_USE', ['execute', 'prepare', 'commit', 'rollback']],
      ['IDLE', ['execute', 'prepare']],
      ['DRAINING', []],
      ['CLOSING', []],
      ['FAILED', []],
      ['CLOSED', []]
    ]);

    // Start idle timeout monitoring
    this._startIdleMonitoring();
  }

  /**
   * Transition to a new state with atomic locking and validation
   */
  async transition(targetState, reason = 'operation', metadata = {}) {
    // Wait for any pending transitions
    while (this.transitionLock) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    this.transitionLock = true;

    try {
      const currentState = this.state;

      // Validate transition
      if (!this._isValidTransition(currentState, targetState)) {
        throw new Error(
          `Invalid transition from ${currentState} to ${targetState} for connection ${this.id}`
        );
      }

      // Update state
      this.previousState = currentState;
      this.state = targetState;
      this.lastActivity = Date.now();

      // Add to history
      this._addToHistory({
        from: currentState,
        to: targetState,
        timestamp: Date.now(),
        reason,
        metadata
      });

      // Handle state-specific logic
      await this._handleStateEnter(targetState, reason, metadata);

      // Notify observers
      this._notifyObservers({
        connectionId: this.id,
        from: currentState,
        to: targetState,
        timestamp: Date.now(),
        reason,
        metadata
      });

      return true;
    } catch (error) {
      // If transition fails, ensure we don't get stuck in transitioning state
      this.transitionLock = false;
      throw error;
    } finally {
      this.transitionLock = false;
    }
  }

  /**
   * Check if an operation can be executed in the current state
   */
  canExecuteOperation(operation = 'execute') {
    const allowedOps = this.allowedOperations.get(this.state) || [];
    return allowedOps.includes(operation);
  }

  /**
   * Execute an operation if the state allows it
   */
  async executeOperation(operation, callback) {
    if (!this.canExecuteOperation(operation)) {
      throw new Error(
        `Operation ${operation} not allowed in state ${this.state} for connection ${this.id}`
      );
    }

    // Transition to IN_USE if currently IDLE or CONNECTED
    if (this.state === 'IDLE' || this.state === 'CONNECTED') {
      await this.transition('IN_USE', `start_${operation}`);
    }

    try {
      const result = await callback();

      // Transition back to IDLE after successful operation
      if (this.state === 'IN_USE') {
        await this.transition('IDLE', `end_${operation}`);
      }

      return result;
    } catch (error) {
      // Handle operation error - might need to mark connection as failed
      if (this._isConnectionError(error)) {
        await this.transition('FAILED', 'operation_error', { error: error.message });
      } else if (this.state === 'IN_USE') {
        await this.transition('IDLE', `end_${operation}_with_error`);
      }

      throw error;
    }
  }

  /**
   * Add observer for state changes
   */
  addObserver(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Observer callback must be a function');
    }
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  /**
   * Remove observer
   */
  removeObserver(callback) {
    return this.observers.delete(callback);
  }

  /**
   * Get current state information
   */
  getState() {
    return {
      id: this.id,
      state: this.state,
      previousState: this.previousState,
      lastActivity: this.lastActivity,
      created: this.created,
      idleDuration: this.state === 'IDLE' ? Date.now() - this.lastActivity : 0,
      retryCount: this.retryCount,
      isHealthy: this._isHealthy()
    };
  }

  /**
   * Get state history
   */
  getHistory(limit = 10) {
    return this.stateHistory.slice(-limit);
  }

  /**
   * Check if connection is healthy
   */
  isHealthy() {
    return this._isHealthy();
  }

  /**
   * Check if connection is idle and can be cleaned up
   */
  isIdleExpired() {
    return this.state === 'IDLE' &&
           (Date.now() - this.lastActivity) > this.idleTimeout;
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(reason = 'shutdown') {
    if (this.state === 'CLOSED' || this.state === 'CLOSING') {
      return;
    }

    // If connection is in use, wait for it to become idle
    if (this.state === 'IN_USE') {
      await this.transition('DRAINING', reason);
      // Wait for current operations to complete
      await this._waitForIdle();
    }

    await this.transition('CLOSING', reason);

    try {
      if (this.connection && typeof this.connection.close === 'function') {
        await this.connection.close();
      }
      await this.transition('CLOSED', reason);
    } catch (error) {
      await this.transition('FAILED', 'shutdown_error', { error: error.message });
      throw error;
    }
  }

  /**
   * Attempt to recover a failed connection
   */
  async recover() {
    if (this.state !== 'FAILED') {
      throw new Error(`Cannot recover connection in state ${this.state}`);
    }

    if (this.retryCount >= this.maxRetries) {
      throw new Error(`Maximum retry attempts (${this.maxRetries}) exceeded for connection ${this.id}`);
    }

    this.retryCount++;

    try {
      await this.transition('INITIALIZING', 'recovery_attempt', { retryCount: this.retryCount });

      // Attempt to reinitialize connection
      if (this.connection && typeof this.connection.reconnect === 'function') {
        await this.connection.reconnect();
      }

      await this.transition('CONNECTED', 'recovery_success');
      await this.transition('IDLE', 'recovery_complete');

      // Reset retry count on successful recovery
      this.retryCount = 0;

      return true;
    } catch (error) {
      await this.transition('FAILED', 'recovery_failed', {
        error: error.message,
        retryCount: this.retryCount
      });
      throw error;
    }
  }

  /**
   * Force destroy the connection (emergency cleanup)
   */
  async destroy(reason = 'force_destroy') {
    try {
      if (this.connection && typeof this.connection.destroy === 'function') {
        await this.connection.destroy();
      }
    } catch (error) {
      // Ignore destruction errors
    }

    await this.transition('CLOSED', reason);
    this._stopIdleMonitoring();
  }

  // Private methods

  _isValidTransition(from, to) {
    const validTargets = this.transitions.get(from);
    return validTargets && validTargets.includes(to);
  }

  _addToHistory(entry) {
    this.stateHistory.push(entry);

    // Maintain history size limit
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  async _handleStateEnter(state, reason, metadata) {
    switch (state) {
      case 'CONNECTED':
        // Connection is ready for use
        break;

      case 'IDLE':
        // Start idle timeout
        this._resetIdleTimeout();
        break;

      case 'FAILED':
        // Log failure and potentially schedule recovery
        this._handleFailureState(reason, metadata);
        break;

      case 'CLOSED':
        // Clean up resources
        this._stopIdleMonitoring();
        break;
    }
  }

  _notifyObservers(event) {
    for (const observer of this.observers) {
      try {
        observer(event);
      } catch (error) {
        // Log observer error but don't fail the transition
        console.error(`Observer error for connection ${this.id}:`, error);
      }
    }
  }

  _isHealthy() {
    const unhealthyStates = ['FAILED', 'CLOSING', 'CLOSED'];
    return !unhealthyStates.includes(this.state);
  }

  _isConnectionError(error) {
    // Common patterns for connection errors
    const connectionErrorPatterns = [
      /connection.*closed/i,
      /connection.*lost/i,
      /connection.*refused/i,
      /connection.*timeout/i,
      /database.*disconnected/i
    ];

    const message = error.message || error.toString();
    return connectionErrorPatterns.some(pattern => pattern.test(message));
  }

  _startIdleMonitoring() {
    this._idleCheckInterval = setInterval(() => {
      if (this.isIdleExpired()) {
        this.transition('CLOSING', 'idle_timeout')
          .then(() => this.transition('CLOSED', 'idle_cleanup'))
          .catch(error => {
            console.error(`Error during idle cleanup for connection ${this.id}:`, error);
          });
      }
    }, 30000); // Check every 30 seconds
  }

  _stopIdleMonitoring() {
    if (this._idleCheckInterval) {
      clearInterval(this._idleCheckInterval);
      this._idleCheckInterval = null;
    }
  }

  _resetIdleTimeout() {
    this.lastActivity = Date.now();
  }

  async _waitForIdle(timeout = 30000) {
    const startTime = Date.now();

    while (this.state === 'DRAINING' && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.state === 'DRAINING') {
      throw new Error(`Timeout waiting for connection ${this.id} to become idle`);
    }
  }

  _handleFailureState(reason, metadata) {
    // Log the failure for monitoring
    console.error(`Connection ${this.id} failed:`, { reason, metadata });

    // Could implement automatic recovery scheduling here
    if (this.retryCount < this.maxRetries) {
      // Schedule automatic recovery attempt
      setTimeout(() => {
        this.recover().catch(error => {
          console.error(`Auto-recovery failed for connection ${this.id}:`, error);
        });
      }, Math.min(1000 * Math.pow(2, this.retryCount), 30000)); // Exponential backoff
    }
  }
}

/**
 * Factory function to create connection state machines
 */
export function createConnectionStateMachine(connectionId, connection, options = {}) {
  return new ConnectionStateMachine(connectionId, connection, options);
}

/**
 * Connection state constants
 */
export const CONNECTION_STATES = {
  INITIALIZING: 'INITIALIZING',
  CONNECTED: 'CONNECTED',
  IN_USE: 'IN_USE',
  IDLE: 'IDLE',
  DRAINING: 'DRAINING',
  CLOSING: 'CLOSING',
  FAILED: 'FAILED',
  CLOSED: 'CLOSED'
};

/**
 * Connection operations
 */
export const CONNECTION_OPERATIONS = {
  EXECUTE: 'execute',
  PREPARE: 'prepare',
  COMMIT: 'commit',
  ROLLBACK: 'rollback'
};