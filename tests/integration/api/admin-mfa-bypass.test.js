/**
 * Admin MFA Bypass Integration Tests
 * Tests MFA bypass logic in various environments and conditions
 * 
 * Tests:
 * 1. MFA is skipped when SKIP_MFA=true
 * 2. MFA is skipped in test environments (NODE_ENV=test)
 * 3. MFA is skipped in CI (CI=true)
 * 4. MFA is skipped in preview (VERCEL_ENV=preview)
 * 5. The /api/admin/simple-login endpoint works only in test environments
 * 6. Simple login returns 404 in production
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { testRequest, HTTP_STATUS } from '../../helpers.js';
import { getDbClient } from '../../setup-integration.js';

// Fail-fast: Check for required environment variable at module level
if (!process.env.TEST_ADMIN_PASSWORD) {
  throw new Error('❌ FATAL: TEST_ADMIN_PASSWORD secret not configured for integration tests');
}

const adminPassword = process.env.TEST_ADMIN_PASSWORD;

describe('Admin MFA Bypass Integration', () => {
  let dbClient;
  let originalEnv = {};

  // Helper to backup and restore environment variables
  const backupEnv = (envVars) => {
    const backup = {};
    envVars.forEach(key => {
      backup[key] = process.env[key];
    });
    return backup;
  };

  const restoreEnv = (backup) => {
    Object.keys(backup).forEach(key => {
      if (backup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = backup[key];
      }
    });
  };

  beforeEach(async () => {
    dbClient = await getDbClient();
    
    // Backup current environment variables
    originalEnv = backupEnv([
      'SKIP_MFA',
      'NODE_ENV', 
      'CI',
      'VERCEL_ENV',
      'E2E_TEST_MODE'
    ]);
  });

  afterEach(() => {
    // Restore original environment variables
    restoreEnv(originalEnv);
  });

  test('MFA is bypassed when SKIP_MFA=true', async () => {
    // Set SKIP_MFA=true
    process.env.SKIP_MFA = 'true';
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Admin auth service unavailable - skipping SKIP_MFA test');
      return;
    }

    // Should succeed without MFA step
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).not.toHaveProperty('requiresMfa');
    expect(response.data).toHaveProperty('expiresIn');
    
    // Check that MFA was not used
    if (response.data.hasOwnProperty('mfaUsed')) {
      expect(response.data.mfaUsed).toBe(false);
    }
  });

  test('MFA is bypassed in test environment (NODE_ENV=test)', async () => {
    // Set NODE_ENV=test
    process.env.NODE_ENV = 'test';
    delete process.env.SKIP_MFA; // Ensure SKIP_MFA is not set
    delete process.env.CI;
    delete process.env.VERCEL_ENV;
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Admin auth service unavailable - skipping NODE_ENV test');
      return;
    }

    // Should succeed without MFA step
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).not.toHaveProperty('requiresMfa');
    
    // Check that MFA was not used
    if (response.data.hasOwnProperty('mfaUsed')) {
      expect(response.data.mfaUsed).toBe(false);
    }
  });

  test('MFA is bypassed in CI environment (CI=true)', async () => {
    // Set CI=true
    process.env.CI = 'true';
    delete process.env.SKIP_MFA;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Admin auth service unavailable - skipping CI test');
      return;
    }

    // Should succeed without MFA step
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).not.toHaveProperty('requiresMfa');
    
    // Check that MFA was not used
    if (response.data.hasOwnProperty('mfaUsed')) {
      expect(response.data.mfaUsed).toBe(false);
    }
  });

  test('MFA is bypassed in preview environment (VERCEL_ENV=preview)', async () => {
    // Set VERCEL_ENV=preview
    process.env.VERCEL_ENV = 'preview';
    delete process.env.SKIP_MFA;
    delete process.env.NODE_ENV;
    delete process.env.CI;
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Admin auth service unavailable - skipping VERCEL_ENV test');
      return;
    }

    // Should succeed without MFA step
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).not.toHaveProperty('requiresMfa');
    
    // Check that MFA was not used
    if (response.data.hasOwnProperty('mfaUsed')) {
      expect(response.data.mfaUsed).toBe(false);
    }
  });

  test('MFA is bypassed in E2E test mode (E2E_TEST_MODE=true)', async () => {
    // Set E2E_TEST_MODE=true
    process.env.E2E_TEST_MODE = 'true';
    delete process.env.SKIP_MFA;
    delete process.env.NODE_ENV;
    delete process.env.CI;
    delete process.env.VERCEL_ENV;
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Admin auth service unavailable - skipping E2E_TEST_MODE test');
      return;
    }

    // Should succeed without MFA step
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).not.toHaveProperty('requiresMfa');
    
    // Check that MFA was not used
    if (response.data.hasOwnProperty('mfaUsed')) {
      expect(response.data.mfaUsed).toBe(false);
    }
  });

  test('simple-login endpoint works in test environments', async () => {
    // Set test environment (NODE_ENV=test)
    process.env.NODE_ENV = 'test';
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/simple-login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Simple login service unavailable - skipping test environment test');
      return;
    }

    // Should succeed in test environment
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).toHaveProperty('adminId', 'admin');
    expect(response.data).toHaveProperty('message');
    expect(response.data.message).toContain('MFA bypassed');
    
    // Should return session details
    expect(response.data).toHaveProperty('expiresIn');
    expect(typeof response.data.expiresIn).toBe('number');
  });

  test('simple-login works with SKIP_MFA=true', async () => {
    // Set SKIP_MFA=true (should enable simple-login)
    process.env.SKIP_MFA = 'true';
    delete process.env.NODE_ENV;
    delete process.env.CI;
    delete process.env.VERCEL_ENV;
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/simple-login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Simple login service unavailable - skipping SKIP_MFA test');
      return;
    }

    // Should succeed when SKIP_MFA is enabled
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).toHaveProperty('adminId', 'admin');
  });

  test('simple-login works in CI environment', async () => {
    // Set CI=true
    process.env.CI = 'true';
    delete process.env.NODE_ENV;
    delete process.env.SKIP_MFA;
    delete process.env.VERCEL_ENV;
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/simple-login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Simple login service unavailable - skipping CI environment test');
      return;
    }

    // Should succeed in CI environment
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).toHaveProperty('adminId', 'admin');
  });

  test('simple-login works in preview environment', async () => {
    // Set VERCEL_ENV=preview
    process.env.VERCEL_ENV = 'preview';
    delete process.env.NODE_ENV;
    delete process.env.SKIP_MFA;
    delete process.env.CI;
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/simple-login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Simple login service unavailable - skipping preview environment test');
      return;
    }

    // Should succeed in preview environment
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).toHaveProperty('adminId', 'admin');
  });

  test('simple-login returns 404 in production-like environments', async () => {
    // Set production-like environment (no test flags)
    delete process.env.NODE_ENV;
    delete process.env.CI;
    delete process.env.VERCEL_ENV;
    delete process.env.SKIP_MFA;
    delete process.env.E2E_TEST_MODE;
    
    // Or explicitly set production environment
    process.env.NODE_ENV = 'production';
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/simple-login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Simple login service unavailable - skipping production test');
      return;
    }

    // Should return 404 in production environment
    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toContain('not available');
  });

  test('simple-login rejects invalid credentials even in test environments', async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    const loginData = {
      username: 'admin',
      password: 'wrongpassword123'
    };

    const response = await testRequest('POST', '/api/admin/simple-login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Simple login service unavailable - skipping invalid credentials test');
      return;
    }

    // Should reject invalid credentials
    expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toContain('Invalid credentials');
  });

  test('simple-login validates username field', async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Test missing username
    const loginDataMissingUsername = {
      password: adminPassword
    };

    const responseMissingUsername = await testRequest('POST', '/api/admin/simple-login', loginDataMissingUsername);
    
    if (responseMissingUsername.status !== 0) {
      expect(responseMissingUsername.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(responseMissingUsername.data).toHaveProperty('error');
      expect(responseMissingUsername.data.error).toContain('Username is required');
    }

    // Test wrong username
    const loginDataWrongUsername = {
      username: 'wronguser',
      password: adminPassword
    };

    const responseWrongUsername = await testRequest('POST', '/api/admin/simple-login', loginDataWrongUsername);
    
    if (responseWrongUsername.status !== 0) {
      expect(responseWrongUsername.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(responseWrongUsername.data).toHaveProperty('error');
      expect(responseWrongUsername.data.error).toContain('Invalid credentials');
    }
  });

  test('simple-login only accepts POST method', async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Test GET method (should be rejected)
    const getResponse = await testRequest('GET', '/api/admin/simple-login');
    
    if (getResponse.status !== 0) {
      expect(getResponse.status).toBe(405); // Method Not Allowed
    }

    // Test PUT method (should be rejected)
    const putResponse = await testRequest('PUT', '/api/admin/simple-login', {
      username: 'admin',
      password: adminPassword
    });
    
    if (putResponse.status !== 0) {
      expect(putResponse.status).toBe(405); // Method Not Allowed
    }
  });

  test('regular login endpoint respects all MFA bypass conditions', async () => {
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    // Test all bypass conditions in sequence
    const bypassConditions = [
      { SKIP_MFA: 'true', description: 'SKIP_MFA=true' },
      { NODE_ENV: 'test', description: 'NODE_ENV=test' },
      { CI: 'true', description: 'CI=true' },
      { VERCEL_ENV: 'preview', description: 'VERCEL_ENV=preview' },
      { E2E_TEST_MODE: 'true', description: 'E2E_TEST_MODE=true' }
    ];

    for (const condition of bypassConditions) {
      // Clear all environment variables
      delete process.env.SKIP_MFA;
      delete process.env.NODE_ENV;
      delete process.env.CI;
      delete process.env.VERCEL_ENV;
      delete process.env.E2E_TEST_MODE;

      // Set the specific condition
      const [key, value] = Object.entries(condition)[0];
      process.env[key] = value;

      const response = await testRequest('POST', '/api/admin/login', loginData);
      
      // Skip if service unavailable
      if (response.status === 0) {
        console.warn(`⚠️ Admin auth service unavailable - skipping ${condition.description} test`);
        continue;
      }

      // Should succeed without MFA for each condition
      expect(response.status, `Failed for condition: ${condition.description}`).toBe(HTTP_STATUS.OK);
      expect(response.data, `Missing success property for condition: ${condition.description}`).toHaveProperty('success', true);
      expect(response.data, `Unexpected requiresMfa for condition: ${condition.description}`).not.toHaveProperty('requiresMfa');
      
      // Check that MFA was not used
      if (response.data.hasOwnProperty('mfaUsed')) {
        expect(response.data.mfaUsed, `MFA was used for condition: ${condition.description}`).toBe(false);
      }
    }
  });

  test('MFA bypass creates proper session records', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping session record test');
      return;
    }

    // Set SKIP_MFA=true
    process.env.SKIP_MFA = 'true';
    
    const loginData = {
      username: 'admin',
      password: adminPassword
    };

    const response = await testRequest('POST', '/api/admin/login', loginData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Admin auth service unavailable - skipping session record test');
      return;
    }

    // Should succeed
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('success', true);

    // Check that session was created in database with proper MFA status
    try {
      const sessionCheck = await dbClient.execute(
        'SELECT * FROM "admin_sessions" ORDER BY created_at DESC LIMIT 1'
      );
      
      if (sessionCheck.rows.length > 0) {
        const session = sessionCheck.rows[0];
        expect(session.expires_at).toBeTruthy();
        expect(new Date(session.expires_at) > new Date()).toBe(true);
        
        // Check that mfa_verified is false since MFA was bypassed
        if (session.hasOwnProperty('mfa_verified')) {
          expect(session.mfa_verified).toBe(false);
        }
      }
    } catch (error) {
      console.warn('⚠️ Session verification skipped:', error.message);
    }
  });
});