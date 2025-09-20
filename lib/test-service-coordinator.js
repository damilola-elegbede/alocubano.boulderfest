/**
 * Test Service Coordinator
 * Ensures proper initialization and synchronization of services during tests
 * Prevents race conditions and ensures all services use the same database connection
 */

import { logger } from './logger.js';

export class TestServiceCoordinator {
  constructor() {
    this.services = new Map();
    this.initializationOrder = [
      'database',
      'audit',
      'security',
      'session',
      'gdpr',
      'financial',
      'wallet',
      'stripe',
      'ticket',
      'email'
    ];
    this.initialized = false;
    this.sharedDatabase = null;
  }

  /**
   * Register a service with the coordinator
   */
  registerService(name, service) {
    this.services.set(name, {
      instance: service,
      initialized: false,
      dependencies: this.getServiceDependencies(name)
    });

    logger.debug(`[Coordinator] Registered service: ${name}`);
  }

  /**
   * Get service dependencies for initialization order
   */
  getServiceDependencies(serviceName) {
    const dependencies = {
      'audit': ['database'],
      'security': ['database', 'audit'],
      'session': ['database', 'audit'],
      'gdpr': ['database', 'audit'],
      'financial': ['database', 'audit'],
      'wallet': ['database', 'ticket'],
      'stripe': ['database', 'audit', 'financial'],
      'ticket': ['database', 'audit'],
      'email': ['database']
    };
    return dependencies[serviceName] || [];
  }

  /**
   * Initialize all services in correct order
   */
  async initializeAll() {
    if (this.initialized) {
      logger.debug('[Coordinator] Already initialized, skipping');
      return;
    }

    logger.debug('[Coordinator] Starting initialization of all services');

    // Initialize in dependency order
    for (const serviceName of this.initializationOrder) {
      const service = this.services.get(serviceName);
      if (service && !service.initialized) {
        await this.initializeService(serviceName);
      }
    }

    // Ensure all services share the same database
    await this.ensureConsistency();

    this.initialized = true;
    logger.debug('[Coordinator] All services initialized successfully');
  }

  /**
   * Initialize a single service and its dependencies
   */
  async initializeService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      logger.debug(`[Coordinator] Service ${serviceName} not registered, skipping`);
      return;
    }

    if (service.initialized) {
      logger.debug(`[Coordinator] Service ${serviceName} already initialized`);
      return;
    }

    logger.debug(`[Coordinator] Initializing service: ${serviceName}`);

    // Initialize dependencies first
    for (const dep of service.dependencies) {
      const depService = this.services.get(dep);
      if (depService && !depService.initialized) {
        logger.debug(`[Coordinator] Initializing dependency ${dep} for ${serviceName}`);
        await this.initializeService(dep);
      }
    }

    // Special handling for database service
    if (serviceName === 'database') {
      if (!service.instance) {
        throw new Error('Database service instance is required');
      }
      this.sharedDatabase = service.instance;
      service.initialized = true;
      logger.debug('[Coordinator] Database service initialized and cached');
      return;
    }

    // Initialize the service
    const instance = service.instance;

    // Reset service state before initialization
    if (instance) {
      // Force service to use shared database
      if (this.sharedDatabase && instance.db !== undefined) {
        logger.debug(`[Coordinator] Setting shared database for ${serviceName}`);
        instance.db = this.sharedDatabase;
        instance.initialized = false;
        instance.initializationPromise = null;
      }

      // Call initialization method if exists
      if (typeof instance.ensureInitialized === 'function') {
        logger.debug(`[Coordinator] Calling ensureInitialized for ${serviceName}`);
        await instance.ensureInitialized();
      } else if (typeof instance.initialize === 'function') {
        logger.debug(`[Coordinator] Calling initialize for ${serviceName}`);
        await instance.initialize();
      }

      // Ensure service is using shared database after initialization
      if (this.sharedDatabase && instance.db !== undefined && instance.db !== this.sharedDatabase) {
        logger.debug(`[Coordinator] Forcing shared database for ${serviceName} after init`);
        instance.db = this.sharedDatabase;
      }
    }

    service.initialized = true;
    logger.debug(`[Coordinator] Service ${serviceName} initialized successfully`);
  }

  /**
   * Share database connection across all services
   */
  shareDatabase(db) {
    if (!db) {
      throw new Error('Database instance is required');
    }

    this.sharedDatabase = db;
    logger.debug('[Coordinator] Sharing database connection across services');

    for (const [name, service] of this.services) {
      if (name !== 'database' && service.instance) {
        const instance = service.instance;

        // Set database on service instance
        if (instance.db !== undefined) {
          logger.debug(`[Coordinator] Setting database for ${name}`);
          instance.db = db;
        }

        // Also set on any nested database property
        if (instance.database !== undefined) {
          logger.debug(`[Coordinator] Setting database property for ${name}`);
          instance.database = db;
        }

        // Mark as initialized if it has the database
        if (instance.initialized !== undefined) {
          instance.initialized = true;
        }
      }
    }
  }

  /**
   * Reset all services for clean test state
   */
  async resetAll() {
    logger.debug('[Coordinator] Resetting all services');

    // Reset in reverse order
    const reverseOrder = [...this.initializationOrder].reverse();

    for (const serviceName of reverseOrder) {
      const service = this.services.get(serviceName);
      if (service) {
        const instance = service.instance;

        if (instance) {
          // Call reset method if exists
          if (typeof instance.reset === 'function') {
            logger.debug(`[Coordinator] Calling reset for ${serviceName}`);
            await instance.reset();
          }

          // Reset initialization state
          if (instance.initialized !== undefined) {
            instance.initialized = false;
          }
          if (instance.initializationPromise !== undefined) {
            instance.initializationPromise = null;
          }

          // Don't null out the database reference - keep it for next test
          // This prevents CLIENT_CLOSED errors
        }

        service.initialized = false;
      }
    }

    this.initialized = false;
    logger.debug('[Coordinator] All services reset');
  }

  /**
   * Ensure service state consistency
   */
  async ensureConsistency() {
    if (!this.sharedDatabase) {
      const dbService = this.services.get('database');
      if (dbService && dbService.instance) {
        this.sharedDatabase = dbService.instance;
      } else {
        throw new Error('Database service not available');
      }
    }

    logger.debug('[Coordinator] Ensuring service consistency');

    let inconsistencies = 0;

    // Verify all services are using the same database
    for (const [name, service] of this.services) {
      if (name === 'database') continue;

      const instance = service.instance;
      if (instance) {
        // Check db property
        if (instance.db !== undefined && instance.db !== this.sharedDatabase) {
          logger.warn(`[Coordinator] Service ${name} using different database connection`);
          instance.db = this.sharedDatabase;
          inconsistencies++;
        }

        // Check database property
        if (instance.database !== undefined && instance.database !== this.sharedDatabase) {
          logger.warn(`[Coordinator] Service ${name}.database using different connection`);
          instance.database = this.sharedDatabase;
          inconsistencies++;
        }

        // Ensure initialized flag is set
        if (instance.initialized === false && instance.db === this.sharedDatabase) {
          logger.debug(`[Coordinator] Marking ${name} as initialized`);
          instance.initialized = true;
        }
      }
    }

    if (inconsistencies > 0) {
      logger.warn(`[Coordinator] Fixed ${inconsistencies} database inconsistencies`);
    } else {
      logger.debug('[Coordinator] All services are consistent');
    }

    return inconsistencies === 0;
  }

  /**
   * Get a registered service instance
   */
  getService(name) {
    const service = this.services.get(name);
    return service ? service.instance : null;
  }

  /**
   * Check if all services are initialized
   */
  areAllInitialized() {
    for (const [name, service] of this.services) {
      if (!service.initialized) {
        logger.debug(`[Coordinator] Service ${name} is not initialized`);
        return false;
      }
    }
    return true;
  }

  /**
   * Get initialization status of all services
   */
  getStatus() {
    const status = {};
    for (const [name, service] of this.services) {
      status[name] = {
        registered: true,
        initialized: service.initialized,
        hasInstance: !!service.instance,
        hasDatabase: !!(service.instance && (service.instance.db || service.instance.database))
      };
    }
    return status;
  }

  /**
   * Force reinitialize a specific service
   */
  async reinitializeService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    logger.debug(`[Coordinator] Force reinitializing ${serviceName}`);

    // Reset the service
    const instance = service.instance;
    if (instance) {
      if (instance.initialized !== undefined) {
        instance.initialized = false;
      }
      if (instance.initializationPromise !== undefined) {
        instance.initializationPromise = null;
      }
      if (this.sharedDatabase && instance.db !== undefined) {
        instance.db = this.sharedDatabase;
      }
    }

    service.initialized = false;

    // Reinitialize
    await this.initializeService(serviceName);
  }
}

// Singleton instance for test environment
let coordinatorInstance = null;

export function getTestCoordinator() {
  if (!coordinatorInstance) {
    coordinatorInstance = new TestServiceCoordinator();
  }
  return coordinatorInstance;
}

export function resetTestCoordinator() {
  coordinatorInstance = null;
}

export default TestServiceCoordinator;