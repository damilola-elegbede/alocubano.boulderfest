/**
 * SuperTest App Creation Helper
 * 
 * Provides properly configured Express apps for integration testing
 * with SuperTest, addressing hostname normalization issues and ensuring
 * consistent request handling.
 */

import express from 'express';
import { vi } from 'vitest';

/**
 * Create a properly configured Express app for SuperTest integration tests
 * @param {Object} options - Configuration options
 * @param {Array<Object>} options.routes - Array of route definitions
 * @param {Array<Function>} options.middleware - Additional middleware functions
 * @returns {Object} Express app configured for SuperTest
 */
export function createTestApp(options = {}) {
  const { routes = [], middleware = [] } = options;
  
  const app = express();
  
  // Essential middleware for API testing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.raw({ type: 'application/json' }));
  
  // Set explicit server configuration for SuperTest compatibility
  app.set('host', '127.0.0.1');
  app.set('port', 0); // Let SuperTest assign port
  app.set('trust proxy', false); // Disable proxy trust for tests
  
  // Apply custom middleware
  middleware.forEach(mw => app.use(mw));
  
  // Add routes
  routes.forEach(route => {
    const { method = 'post', path, handler } = route;
    app[method.toLowerCase()](path, handler);
  });
  
  // Default error handler to prevent SuperTest issues
  app.use((err, req, res, next) => {
    console.error('Test app error:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ 
      error: 'Test server error',
      message: err.message 
    });
  });
  
  // Default 404 handler
  app.use((req, res) => {
    res.status(404).json({ 
      error: 'Not found',
      path: req.path,
      method: req.method 
    });
  });
  
  return app;
}

/**
 * Create webhook request handler wrapper for proper body streaming in tests
 * @param {Function} webhookHandler - The actual webhook handler function
 * @returns {Function} Wrapped handler that works with SuperTest
 */
export function createWebhookHandler(webhookHandler) {
  return (req, res, next) => {
    try {
      // Store the original body if it was parsed
      const parsedBody = req.body;

      // Remove the parsed body so the handler reads from stream
      delete req.body;

      // Convert parsed body back to string for raw body reading
      const bodyString = typeof parsedBody === 'string' 
        ? parsedBody 
        : JSON.stringify(parsedBody);
      let dataEmitted = false;

      // Mock the stream interface safely
      const originalSetEncoding = req.setEncoding;
      const originalOn = req.on;
      
      req.setEncoding = (encoding) => {
        // Mock implementation for tests
        return req;
      };
      
      req.on = (event, callback) => {
        if (event === "data") {
          if (!dataEmitted) {
            dataEmitted = true;
            // Use setImmediate to ensure async behavior
            setImmediate(() => {
              try {
                callback(bodyString);
              } catch (err) {
                next(err);
              }
            });
          }
        } else if (event === "end") {
          setImmediate(() => {
            try {
              callback();
            } catch (err) {
              next(err);
            }
          });
        } else if (event === "error") {
          // Store error handler for potential use
          req._errorHandler = callback;
        } else {
          // Call original handler for other events
          if (originalOn) {
            return originalOn.call(req, event, callback);
          }
        }
        return req;
      };

      // Call the original handler with error handling
      return Promise.resolve(webhookHandler(req, res))
        .catch(err => next(err));
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a mock service container for consistent service mocking
 * @param {Object} serviceMocks - Object containing service mock configurations
 * @returns {Object} Service container with properly configured mocks
 */
export function createMockServiceContainer(serviceMocks = {}) {
  const container = {};
  
  // Email Service Mock
  if (serviceMocks.email !== false) {
    container.emailService = {
      createSubscriber: vi.fn().mockImplementation(async (data) => ({
        id: Math.floor(Math.random() * 10000),
        email: data.email,
        first_name: data.firstName,
        last_name: data.lastName,
        status: data.status || 'active',
        created_at: new Date().toISOString(),
        ...data
      })),
      processWebhookEvent: vi.fn().mockImplementation(async (webhookData) => ({
        eventType: webhookData.event,
        email: webhookData.email,
        occurredAt: webhookData.date || new Date().toISOString(),
        data: { messageId: webhookData.messageId }
      })),
      getSubscriber: vi.fn().mockResolvedValue(null),
      updateSubscriber: vi.fn().mockResolvedValue(true),
      ...serviceMocks.email
    };
    
    // Add ensureInitialized method that returns the service itself
    container.emailService.ensureInitialized = vi.fn().mockResolvedValue(container.emailService);
  }
  
  // Brevo Service Mock  
  if (serviceMocks.brevo !== false) {
    container.brevoService = {
      validateWebhookSignature: vi.fn().mockReturnValue(true),
      createContact: vi.fn().mockResolvedValue({ id: 12345 }),
      updateContact: vi.fn().mockResolvedValue(true),
      ...serviceMocks.brevo
    };
  }
  
  // Database Mock
  if (serviceMocks.database !== false) {
    container.databaseClient = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      close: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(container.databaseClient);
      }),
      ...serviceMocks.database
    };
  }
  
  return container;
}

/**
 * Apply service mocks to the global scope for test isolation
 * @param {Object} mocks - Service mocks to apply
 */
export function applyServiceMocks(mocks) {
  // Mock database service
  if (mocks.databaseClient) {
    vi.doMock('../../api/lib/database.js', () => ({
      getDatabase: () => ({
        ensureInitialized: vi.fn().mockResolvedValue(mocks.databaseClient),
        testConnection: vi.fn().mockResolvedValue(true),
        execute: mocks.databaseClient.execute,
        close: mocks.databaseClient.close,
        client: mocks.databaseClient,
        initialized: true,
      }),
      getDatabaseClient: vi.fn().mockResolvedValue(mocks.databaseClient),
      testConnection: vi.fn().mockResolvedValue(true),
      resetDatabaseInstance: vi.fn().mockResolvedValue(undefined),
    }));
  }

  // Mock email subscriber service
  if (mocks.emailService) {
    const mockEmailService = {
      ensureInitialized: vi.fn().mockResolvedValue(mocks.emailService),
      ...mocks.emailService
    };
    
    vi.doMock('../../api/lib/email-subscriber-service.js', () => ({
      getEmailSubscriberService: vi.fn().mockReturnValue(mockEmailService),
      resetEmailSubscriberService: vi.fn(),
      EmailSubscriberService: vi.fn().mockImplementation(() => mockEmailService)
    }));
  }

  // Mock Brevo service
  if (mocks.brevoService) {
    vi.doMock('../../api/lib/brevo-service.js', () => ({
      getBrevoService: () => mocks.brevoService,
      resetBrevoService: vi.fn(),
    }));
  }
}