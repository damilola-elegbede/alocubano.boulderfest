/**
 * Unit Tests for Logger Utility
 * Tests conditional logging based on environment variables
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../../../lib/logger.js';

describe('Logger - Unit Tests', () => {
  let originalEnv;
  let consoleSpies;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create spies for all console methods
    consoleSpies = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;

    // Restore all console methods
    Object.values(consoleSpies).forEach(spy => spy.mockRestore());
  });

  describe('log method', () => {
    describe('Debug Mode Enabled', () => {
      beforeEach(() => {
        process.env.DEBUG = 'true';
      });

      it('should log messages when DEBUG is true', () => {
        logger.log('Test message');

        expect(consoleSpies.log).toHaveBeenCalledWith('Test message');
      });

      it('should log multiple arguments', () => {
        logger.log('Message', 'arg2', 'arg3');

        expect(consoleSpies.log).toHaveBeenCalledWith('Message', 'arg2', 'arg3');
      });

      it('should log objects', () => {
        const obj = { key: 'value', nested: { data: 123 } };
        logger.log('Object:', obj);

        expect(consoleSpies.log).toHaveBeenCalledWith('Object:', obj);
      });

      it('should log arrays', () => {
        const arr = [1, 2, 3, 'test'];
        logger.log('Array:', arr);

        expect(consoleSpies.log).toHaveBeenCalledWith('Array:', arr);
      });
    });

    describe('Development Environment', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'development';
      });

      it('should log messages in development mode', () => {
        logger.log('Dev message');

        expect(consoleSpies.log).toHaveBeenCalledWith('Dev message');
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'production';
      });

      it('should not log messages in production', () => {
        logger.log('Production message');

        expect(consoleSpies.log).not.toHaveBeenCalled();
      });

      it('should not log even with multiple arguments', () => {
        logger.log('Msg', { data: 'test' }, [1, 2, 3]);

        expect(consoleSpies.log).not.toHaveBeenCalled();
      });
    });

    describe('Test Mode', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'test';
      });

      it('should not log messages in test mode', () => {
        logger.log('Test message');

        expect(consoleSpies.log).not.toHaveBeenCalled();
      });
    });
  });

  describe('error method', () => {
    it('should always log errors regardless of environment', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DEBUG;

      logger.error('Error message');

      expect(consoleSpies.error).toHaveBeenCalledWith('Error message');
    });

    it('should log errors in development', () => {
      process.env.NODE_ENV = 'development';

      logger.error('Dev error');

      expect(consoleSpies.error).toHaveBeenCalledWith('Dev error');
    });

    it('should log errors in test mode', () => {
      process.env.NODE_ENV = 'test';

      logger.error('Test error');

      expect(consoleSpies.error).toHaveBeenCalledWith('Test error');
    });

    it('should log Error objects', () => {
      const error = new Error('Test error');
      logger.error('Error occurred:', error);

      expect(consoleSpies.error).toHaveBeenCalledWith('Error occurred:', error);
    });

    it('should log error with stack trace', () => {
      const error = new Error('Stack trace test');
      logger.error(error);

      expect(consoleSpies.error).toHaveBeenCalledWith(error);
    });

    it('should log multiple error arguments', () => {
      logger.error('Error:', 'code:', 500, 'message:', 'Server error');

      expect(consoleSpies.error).toHaveBeenCalledWith('Error:', 'code:', 500, 'message:', 'Server error');
    });
  });

  describe('debug method', () => {
    describe('Debug Mode Enabled', () => {
      beforeEach(() => {
        process.env.DEBUG = 'true';
      });

      it('should log debug messages with [DEBUG] prefix', () => {
        logger.debug('Debug info');

        expect(consoleSpies.log).toHaveBeenCalledWith('[DEBUG]', 'Debug info');
      });

      it('should include [DEBUG] prefix with multiple arguments', () => {
        logger.debug('Info:', { data: 'test' });

        expect(consoleSpies.log).toHaveBeenCalledWith('[DEBUG]', 'Info:', { data: 'test' });
      });

      it('should log debug data structures', () => {
        const data = { request: 'GET', path: '/api/test', status: 200 };
        logger.debug('Request:', data);

        expect(consoleSpies.log).toHaveBeenCalledWith('[DEBUG]', 'Request:', data);
      });
    });

    describe('Development Environment', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'development';
      });

      it('should log debug messages in development', () => {
        logger.debug('Dev debug');

        expect(consoleSpies.log).toHaveBeenCalledWith('[DEBUG]', 'Dev debug');
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'production';
      });

      it('should not log debug messages in production', () => {
        logger.debug('Production debug');

        expect(consoleSpies.log).not.toHaveBeenCalled();
      });
    });
  });

  describe('warn method', () => {
    describe('Standard Warning Behavior', () => {
      it('should log warnings in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DEBUG;

        logger.warn('Warning message');

        expect(consoleSpies.warn).toHaveBeenCalledWith('Warning message');
      });

      it('should log warnings in development', () => {
        process.env.NODE_ENV = 'development';

        logger.warn('Dev warning');

        expect(consoleSpies.warn).toHaveBeenCalledWith('Dev warning');
      });

      it('should log multiple warning arguments', () => {
        logger.warn('Warning:', 'deprecated API', 'version:', '1.0');

        expect(consoleSpies.warn).toHaveBeenCalledWith('Warning:', 'deprecated API', 'version:', '1.0');
      });
    });

    describe('SessionMonitor Suppression in Test Mode', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'test';
        delete process.env.ENABLE_TEST_MONITORING;
      });

      it('should suppress SessionMonitor warnings in test mode', () => {
        logger.warn('[SessionMonitor] Session expired');

        expect(consoleSpies.warn).not.toHaveBeenCalled();
      });

      it('should suppress any warning containing [SessionMonitor]', () => {
        logger.warn('Some text [SessionMonitor] more text');

        expect(consoleSpies.warn).not.toHaveBeenCalled();
      });

      it('should log non-SessionMonitor warnings in test mode', () => {
        logger.warn('Regular test warning');

        expect(consoleSpies.warn).toHaveBeenCalledWith('Regular test warning');
      });

      it('should log SessionMonitor warnings when ENABLE_TEST_MONITORING is set', () => {
        process.env.ENABLE_TEST_MONITORING = 'true';

        logger.warn('[SessionMonitor] Test monitoring enabled');

        expect(consoleSpies.warn).toHaveBeenCalledWith('[SessionMonitor] Test monitoring enabled');
      });
    });

    describe('Edge Cases', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'test';
        delete process.env.ENABLE_TEST_MONITORING;
      });

      it('should handle warning with undefined first argument', () => {
        logger.warn(undefined, 'second arg');

        expect(consoleSpies.warn).toHaveBeenCalled();
      });

      it('should handle warning with null first argument', () => {
        logger.warn(null, 'second arg');

        expect(consoleSpies.warn).toHaveBeenCalled();
      });

      it('should handle warning with number first argument', () => {
        logger.warn(123, 'warning code');

        expect(consoleSpies.warn).toHaveBeenCalled();
      });

      it('should handle warning with object without includes method', () => {
        const obj = { message: 'test' };
        logger.warn(obj);

        expect(consoleSpies.warn).toHaveBeenCalled();
      });

      it('should suppress case-sensitive [SessionMonitor]', () => {
        logger.warn('[sessionmonitor] lowercase');

        expect(consoleSpies.warn).toHaveBeenCalled(); // Not suppressed
      });

      it('should suppress exact [SessionMonitor] match', () => {
        logger.warn('[SessionMonitor]');

        expect(consoleSpies.warn).not.toHaveBeenCalled();
      });
    });
  });

  describe('info method', () => {
    describe('Debug Mode Enabled', () => {
      beforeEach(() => {
        process.env.DEBUG = 'true';
      });

      it('should log info messages when DEBUG is true', () => {
        logger.info('Info message');

        expect(consoleSpies.info).toHaveBeenCalledWith('Info message');
      });

      it('should log multiple info arguments', () => {
        logger.info('Server started on port', 3000);

        expect(consoleSpies.info).toHaveBeenCalledWith('Server started on port', 3000);
      });
    });

    describe('Development Environment', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'development';
      });

      it('should log info messages in development', () => {
        logger.info('Dev info');

        expect(consoleSpies.info).toHaveBeenCalledWith('Dev info');
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'production';
      });

      it('should not log info messages in production', () => {
        logger.info('Production info');

        expect(consoleSpies.info).not.toHaveBeenCalled();
      });
    });
  });

  describe('logWithLevel method', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true';
    });

    describe('Level Routing', () => {
      it('should route to debug method for debug level', () => {
        logger.logWithLevel('debug', 'Debug message');

        expect(consoleSpies.log).toHaveBeenCalledWith('[DEBUG]', 'Debug message');
      });

      it('should route to info method for info level', () => {
        logger.logWithLevel('info', 'Info message');

        expect(consoleSpies.info).toHaveBeenCalledWith('Info message');
      });

      it('should route to log method for log level', () => {
        logger.logWithLevel('log', 'Log message');

        expect(consoleSpies.log).toHaveBeenCalledWith('Log message');
      });

      it('should route to warn method for warn level', () => {
        logger.logWithLevel('warn', 'Warning message');

        expect(consoleSpies.warn).toHaveBeenCalledWith('Warning message');
      });

      it('should route to error method for error level', () => {
        logger.logWithLevel('error', 'Error message');

        expect(consoleSpies.error).toHaveBeenCalledWith('Error message');
      });
    });

    describe('Unknown Levels', () => {
      it('should fallback to log for unknown level', () => {
        logger.logWithLevel('unknown', 'Message');

        expect(consoleSpies.log).toHaveBeenCalledWith('Message');
      });

      it('should handle custom level names', () => {
        logger.logWithLevel('custom', 'Custom message');

        expect(consoleSpies.log).toHaveBeenCalledWith('Custom message');
      });

      it('should handle uppercase levels', () => {
        logger.logWithLevel('ERROR', 'Uppercase error');

        expect(consoleSpies.log).toHaveBeenCalledWith('Uppercase error');
      });
    });

    describe('Multiple Arguments', () => {
      it('should pass all arguments to target method', () => {
        logger.logWithLevel('info', 'Message', { data: 'test' }, 123);

        expect(consoleSpies.info).toHaveBeenCalledWith('Message', { data: 'test' }, 123);
      });

      it('should handle zero arguments', () => {
        logger.logWithLevel('log');

        expect(consoleSpies.log).toHaveBeenCalledWith();
      });
    });

    describe('Environment Respect', () => {
      beforeEach(() => {
        delete process.env.DEBUG;
        process.env.NODE_ENV = 'production';
      });

      it('should respect environment for info level', () => {
        logger.logWithLevel('info', 'Production info');

        expect(consoleSpies.info).not.toHaveBeenCalled();
      });

      it('should always log error level', () => {
        logger.logWithLevel('error', 'Production error');

        expect(consoleSpies.error).toHaveBeenCalledWith('Production error');
      });

      it('should always log warn level', () => {
        logger.logWithLevel('warn', 'Production warning');

        expect(consoleSpies.warn).toHaveBeenCalledWith('Production warning');
      });
    });
  });

  describe('Proxy Behavior', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true';
    });

    describe('Dynamic Property Access', () => {
      it('should support bracket notation for log levels', () => {
        logger['log']('Bracket notation');

        expect(consoleSpies.log).toHaveBeenCalledWith('Bracket notation');
      });

      it('should support bracket notation for debug', () => {
        logger['debug']('Debug bracket');

        expect(consoleSpies.log).toHaveBeenCalledWith('[DEBUG]', 'Debug bracket');
      });

      it('should support bracket notation for error', () => {
        logger['error']('Error bracket');

        expect(consoleSpies.error).toHaveBeenCalledWith('Error bracket');
      });
    });

    describe('Known Properties', () => {
      it('should have log method', () => {
        expect(typeof logger.log).toBe('function');
      });

      it('should have error method', () => {
        expect(typeof logger.error).toBe('function');
      });

      it('should have debug method', () => {
        expect(typeof logger.debug).toBe('function');
      });

      it('should have warn method', () => {
        expect(typeof logger.warn).toBe('function');
      });

      it('should have info method', () => {
        expect(typeof logger.info).toBe('function');
      });

      it('should have logWithLevel method', () => {
        expect(typeof logger.logWithLevel).toBe('function');
      });
    });

    describe('Length Property', () => {
      it('should have length property', () => {
        expect(logger).toHaveProperty('length');
      });

      it('should have length value of 0', () => {
        expect(logger.length).toBe(0);
      });

      it('should not allow length modification', () => {
        const originalLength = logger.length;
        try {
          logger.length = 5;
        } catch (e) {
          // Expected in strict mode
        }
        expect(logger.length).toBe(originalLength);
      });
    });

    describe('Unknown Properties', () => {
      it('should fallback to log for unknown string properties', () => {
        const unknownLevel = logger['customLevel'];
        expect(typeof unknownLevel).toBe('function');
      });

      it('should return log method for valid level names', () => {
        ['debug', 'info', 'log', 'warn', 'error'].forEach(level => {
          expect(typeof logger[level]).toBe('function');
        });
      });
    });
  });

  describe('Real-World Usage', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true';
    });

    it('should log API request details', () => {
      const request = { method: 'GET', path: '/api/tickets', status: 200 };
      logger.info('API Request:', request);

      expect(consoleSpies.info).toHaveBeenCalledWith('API Request:', request);
    });

    it('should log database queries in debug mode', () => {
      const query = 'SELECT * FROM tickets WHERE id = ?';
      const params = ['TKT-001'];
      logger.debug('Database query:', query, params);

      expect(consoleSpies.log).toHaveBeenCalledWith('[DEBUG]', 'Database query:', query, params);
    });

    it('should log error stack traces', () => {
      const error = new Error('Database connection failed');
      logger.error('Database error:', error);

      expect(consoleSpies.error).toHaveBeenCalledWith('Database error:', error);
    });

    it('should log performance metrics', () => {
      const metrics = { endpoint: '/api/tickets', duration: 45, memory: 128 };
      logger.info('Performance:', metrics);

      expect(consoleSpies.info).toHaveBeenCalledWith('Performance:', metrics);
    });

    it('should log configuration on startup', () => {
      const config = { port: 3000, env: 'development', database: 'connected' };
      logger.info('Server configuration:', config);

      expect(consoleSpies.info).toHaveBeenCalledWith('Server configuration:', config);
    });

    it('should warn about deprecated features', () => {
      logger.warn('DEPRECATED: Old API endpoint used. Migrate to v2.');

      expect(consoleSpies.warn).toHaveBeenCalledWith('DEPRECATED: Old API endpoint used. Migrate to v2.');
    });
  });

  describe('Environment Combinations', () => {
    it('should prioritize DEBUG over NODE_ENV', () => {
      process.env.DEBUG = 'true';
      process.env.NODE_ENV = 'production';

      logger.log('Should log');

      expect(consoleSpies.log).toHaveBeenCalledWith('Should log');
    });

    it('should handle missing environment variables', () => {
      delete process.env.DEBUG;
      delete process.env.NODE_ENV;

      logger.log('Default environment');

      expect(consoleSpies.log).not.toHaveBeenCalled();
    });

    it('should handle DEBUG=false explicitly', () => {
      process.env.DEBUG = 'false';
      process.env.NODE_ENV = 'development';

      logger.log('Should still log in development');

      expect(consoleSpies.log).toHaveBeenCalledWith('Should still log in development');
    });

    it('should handle empty DEBUG variable', () => {
      process.env.DEBUG = '';
      process.env.NODE_ENV = 'development';

      logger.log('Development mode');

      expect(consoleSpies.log).toHaveBeenCalledWith('Development mode');
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency logging in debug mode', () => {
      process.env.DEBUG = 'true';

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        logger.log('Message', i);
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // 1000 logs in < 1 second
      expect(consoleSpies.log).toHaveBeenCalledTimes(1000);
    });

    it('should have minimal overhead when logging is disabled', () => {
      delete process.env.DEBUG;
      process.env.NODE_ENV = 'production';

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        logger.log('Suppressed message', i);
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // 10000 suppressed logs in < 100ms
      expect(consoleSpies.log).not.toHaveBeenCalled();
    });
  });
});
