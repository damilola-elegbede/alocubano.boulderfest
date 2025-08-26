/**
 * Admin Authentication Utilities for E2E Testing
 * Provides comprehensive admin login, session management, and security testing helpers
 */

import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

/**
 * Admin Authentication Helper
 * Handles login flows, session management, and JWT operations
 */
export class AdminAuthHelper {
  constructor(page, options = {}) {
    this.page = page;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.adminPassword = options.adminPassword || process.env.TEST_ADMIN_PASSWORD || 'test-admin-password';
    this.adminSecret = options.adminSecret || process.env.ADMIN_SECRET || 'test-secret-key-that-is-at-least-32-characters-long';
    this.sessionDuration = options.sessionDuration || 3600000; // 1 hour
    this.currentSession = null;
  }

  /**
   * Perform admin login with full flow support
   */
  async login(credentials = {}) {
    const {
      password = this.adminPassword,
      mfaCode = null,
      expectMfa = false,
      skipNavigation = false,
    } = credentials;

    if (!skipNavigation) {
      await this.page.goto('/admin/login');
      await this.page.waitForLoadState('networkidle');
    }

    // Step 1: Password authentication
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');

    // Wait for response
    await this.page.waitForTimeout(1000);

    // Check if MFA is required
    const currentUrl = this.page.url();
    const pageContent = await this.page.textContent('body');

    if (expectMfa || pageContent.includes('MFA') || pageContent.includes('authentication code')) {
      if (!mfaCode) {
        throw new Error('MFA code required but not provided');
      }

      // Step 2: MFA authentication
      await this.enterMfaCode(mfaCode);
    }

    // Verify successful login
    await this.verifyLoginSuccess();
    
    // Store session information
    this.currentSession = await this.getCurrentSession();
    
    return this.currentSession;
  }

  /**
   * Enter MFA code during login flow
   */
  async enterMfaCode(code) {
    // Look for MFA input field
    const mfaSelectors = [
      'input[name="mfaCode"]',
      'input[placeholder*="authentication code" i]',
      'input[placeholder*="MFA" i]',
      'input[type="text"][maxlength="6"]',
      'input[pattern="[0-9]{6}"]',
    ];

    let mfaInput = null;
    for (const selector of mfaSelectors) {
      mfaInput = await this.page.$(selector);
      if (mfaInput) break;
    }

    if (!mfaInput) {
      throw new Error('MFA input field not found');
    }

    await this.page.fill(mfaInput, code);
    
    // Find and click submit button
    const submitButton = await this.page.$('button[type="submit"]') || 
                         await this.page.$('button:has-text("Verify")') ||
                         await this.page.$('button:has-text("Submit")');
    
    if (submitButton) {
      await submitButton.click();
    }

    await this.page.waitForTimeout(1000);
  }

  /**
   * Verify login was successful
   */
  async verifyLoginSuccess() {
    // Wait for navigation to admin dashboard or success indicators
    try {
      await Promise.race([
        this.page.waitForURL('**/admin/dashboard', { timeout: 5000 }),
        this.page.waitForSelector('.admin-dashboard', { timeout: 5000 }),
        this.page.waitForSelector('[data-testid="admin-content"]', { timeout: 5000 }),
      ]);
    } catch (error) {
      // Check for error messages
      const errorElement = await this.page.$('.error, .alert-error, [data-testid="error"]');
      if (errorElement) {
        const errorText = await errorElement.textContent();
        throw new Error(`Login failed: ${errorText}`);
      }
      
      // Check current URL for login failure
      if (this.page.url().includes('/admin/login')) {
        throw new Error('Login failed: Still on login page');
      }
      
      throw new Error('Login verification failed: Could not confirm successful login');
    }
  }

  /**
   * Get current session information from cookies and localStorage
   */
  async getCurrentSession() {
    const cookies = await this.page.context().cookies();
    const sessionCookie = cookies.find(cookie => cookie.name === 'admin_session');
    
    if (!sessionCookie) {
      return null;
    }

    try {
      const decoded = jwt.verify(sessionCookie.value, this.adminSecret);
      return {
        token: sessionCookie.value,
        admin: decoded,
        expiresAt: new Date(decoded.exp * 1000),
        isValid: Date.now() < (decoded.exp * 1000),
      };
    } catch (error) {
      console.warn('Failed to decode session token:', error.message);
      return {
        token: sessionCookie.value,
        admin: null,
        expiresAt: null,
        isValid: false,
        error: error.message,
      };
    }
  }

  /**
   * Logout admin user
   */
  async logout() {
    try {
      // Try to use logout button if available
      const logoutButton = await this.page.$('button:has-text("Logout")') ||
                           await this.page.$('a:has-text("Logout")') ||
                           await this.page.$('[data-testid="logout"]');

      if (logoutButton) {
        await logoutButton.click();
        await this.page.waitForURL('**/admin/login', { timeout: 3000 });
      } else {
        // Manual logout via API
        await this.page.request.delete(`${this.baseUrl}/api/admin/login`);
        await this.page.goto('/admin/login');
      }
    } catch (error) {
      // Force logout by clearing cookies
      await this.clearAuthCookies();
      await this.page.goto('/admin/login');
    }

    this.currentSession = null;
  }

  /**
   * Clear authentication cookies
   */
  async clearAuthCookies() {
    const context = this.page.context();
    const cookies = await context.cookies();
    
    const authCookies = cookies.filter(cookie => 
      cookie.name === 'admin_session' || 
      cookie.name.startsWith('admin_')
    );

    for (const cookie of authCookies) {
      await context.clearCookies({
        name: cookie.name,
        domain: cookie.domain,
      });
    }
  }

  /**
   * Check if currently logged in
   */
  async isLoggedIn() {
    const session = await this.getCurrentSession();
    return session && session.isValid;
  }

  /**
   * Ensure admin is logged in (login if not)
   */
  async ensureLoggedIn(credentials = {}) {
    if (await this.isLoggedIn()) {
      return this.currentSession;
    }
    
    return await this.login(credentials);
  }

  /**
   * Create mock session token for testing
   */
  createMockSessionToken(adminData = {}) {
    const payload = {
      id: adminData.id || 'admin',
      role: 'admin',
      loginTime: Date.now(),
      ...adminData,
    };

    return jwt.sign(payload, this.adminSecret, {
      expiresIn: Math.floor(this.sessionDuration / 1000) + 's',
      issuer: 'alocubano-admin',
    });
  }

  /**
   * Set mock authentication state
   */
  async setMockAuthState(sessionData = {}) {
    const token = this.createMockSessionToken(sessionData);
    
    await this.page.context().addCookies([{
      name: 'admin_session',
      value: token,
      domain: new URL(this.baseUrl).hostname,
      path: '/',
      httpOnly: true,
      secure: false, // Set to true for HTTPS in production
    }]);

    this.currentSession = {
      token,
      admin: sessionData,
      expiresAt: new Date(Date.now() + this.sessionDuration),
      isValid: true,
    };

    return this.currentSession;
  }
}

/**
 * Security Testing Utilities
 * Provides helpers for testing authentication security features
 */
export class SecurityTestHelper {
  constructor(page, options = {}) {
    this.page = page;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.adminPassword = options.adminPassword || process.env.TEST_ADMIN_PASSWORD || 'test-admin-password';
  }

  /**
   * Test rate limiting protection
   */
  async testRateLimiting(maxAttempts = 5) {
    await this.page.goto('/admin/login');
    
    const attempts = [];
    const wrongPassword = 'definitely-wrong-password';

    // Make failed attempts
    for (let i = 0; i < maxAttempts + 2; i++) {
      const startTime = Date.now();
      
      await this.page.fill('input[type="password"]', wrongPassword);
      await this.page.click('button[type="submit"]');
      await this.page.waitForTimeout(500);
      
      const response = await this.page.waitForResponse(
        response => response.url().includes('/api/admin/login'),
        { timeout: 3000 }
      ).catch(() => null);

      const endTime = Date.now();
      const pageContent = await this.page.textContent('body');
      
      attempts.push({
        attempt: i + 1,
        responseTime: endTime - startTime,
        status: response?.status() || 'unknown',
        isRateLimited: pageContent.includes('Too many') || pageContent.includes('rate limit'),
        pageContent: pageContent.substring(0, 200), // First 200 chars for debugging
      });

      // If we're rate limited, record when it started
      if (attempts[i].isRateLimited && i === 0) {
        attempts[i].rateLimitStarted = true;
      }
    }

    return {
      attempts,
      wasRateLimited: attempts.some(a => a.isRateLimited),
      rateLimitTriggeredAt: attempts.findIndex(a => a.isRateLimited) + 1,
      totalAttempts: attempts.length,
    };
  }

  /**
   * Test brute force protection
   */
  async testBruteForceProtection() {
    const passwords = [
      'password123',
      'admin123',
      'test123',
      'password',
      'admin',
      'root',
      '123456',
      'qwerty',
    ];

    const results = [];

    await this.page.goto('/admin/login');

    for (const password of passwords) {
      const startTime = Date.now();
      
      await this.page.fill('input[type="password"]', password);
      await this.page.click('button[type="submit"]');
      
      const response = await this.page.waitForResponse(
        response => response.url().includes('/api/admin/login'),
        { timeout: 3000 }
      ).catch(() => null);

      const endTime = Date.now();
      const pageContent = await this.page.textContent('body');
      
      results.push({
        password,
        responseTime: endTime - startTime,
        status: response?.status() || 'unknown',
        success: response?.status() === 200 && !pageContent.includes('Invalid'),
        isBlocked: pageContent.includes('blocked') || pageContent.includes('locked'),
      });

      // Stop if we get blocked
      if (results[results.length - 1].isBlocked) {
        break;
      }

      await this.page.waitForTimeout(100); // Small delay between attempts
    }

    return {
      results,
      successfulAttempts: results.filter(r => r.success).length,
      blockedAttempts: results.filter(r => r.isBlocked).length,
      averageResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
    };
  }

  /**
   * Test session security
   */
  async testSessionSecurity() {
    const auth = new AdminAuthHelper(this.page);
    
    // Test 1: Valid session
    await auth.login({ password: this.adminPassword });
    const validSession = await auth.getCurrentSession();

    // Test 2: Session after logout
    await auth.logout();
    const loggedOutSession = await auth.getCurrentSession();

    // Test 3: Expired session (mock)
    const expiredToken = jwt.sign(
      { id: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) - 3600 },
      auth.adminSecret
    );

    await this.page.context().addCookies([{
      name: 'admin_session',
      value: expiredToken,
      domain: new URL(this.baseUrl).hostname,
      path: '/',
    }]);

    await this.page.goto('/admin/dashboard');
    const isRedirectedToLogin = this.page.url().includes('/admin/login');

    return {
      validSession: {
        exists: !!validSession,
        isValid: validSession?.isValid || false,
        hasAdminData: !!validSession?.admin,
      },
      loggedOutSession: {
        exists: !!loggedOutSession,
        isValid: loggedOutSession?.isValid || false,
      },
      expiredSession: {
        redirectedToLogin: isRedirectedToLogin,
      },
    };
  }

  /**
   * Test MFA security
   */
  async testMfaSecurity() {
    const testCodes = [
      '000000', // Common weak code
      '123456', // Sequential
      '111111', // Repeated
      '000001', // Almost common
      'abcdef', // Invalid format
      '12345',  // Too short
      '1234567', // Too long
    ];

    const results = [];
    await this.page.goto('/admin/login');

    // First login with password to get to MFA step
    await this.page.fill('input[type="password"]', this.adminPassword);
    await this.page.click('button[type="submit"]');
    await this.page.waitForTimeout(1000);

    // Check if MFA is required
    const pageContent = await this.page.textContent('body');
    if (!pageContent.includes('MFA') && !pageContent.includes('authentication code')) {
      return {
        mfaEnabled: false,
        message: 'MFA is not enabled for this admin account',
      };
    }

    // Test various MFA codes
    for (const code of testCodes) {
      const startTime = Date.now();
      
      const mfaInput = await this.page.$('input[name="mfaCode"]') ||
                       await this.page.$('input[placeholder*="authentication code" i]');
      
      if (mfaInput) {
        await mfaInput.fill(code);
        await this.page.click('button[type="submit"]');
        
        const response = await this.page.waitForResponse(
          response => response.url().includes('/api/admin/login'),
          { timeout: 3000 }
        ).catch(() => null);

        const endTime = Date.now();
        const responseContent = await this.page.textContent('body');
        
        results.push({
          code,
          responseTime: endTime - startTime,
          status: response?.status() || 'unknown',
          success: response?.status() === 200 && !responseContent.includes('Invalid'),
          errorMessage: responseContent.includes('Invalid') ? 'Invalid code' : null,
        });
      }

      await this.page.waitForTimeout(100);
    }

    return {
      mfaEnabled: true,
      results,
      successfulAttempts: results.filter(r => r.success).length,
      averageResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
    };
  }

  /**
   * Test CSRF protection
   */
  async testCSRFProtection() {
    const results = [];

    // Test 1: Login without CSRF token
    try {
      const response = await this.page.request.post(`${this.baseUrl}/api/admin/login`, {
        data: { password: this.adminPassword },
        headers: { 'Content-Type': 'application/json' },
      });
      
      results.push({
        test: 'login_without_csrf',
        status: response.status(),
        success: response.status() === 200,
        hasCSRFProtection: response.status() === 403 || response.status() === 400,
      });
    } catch (error) {
      results.push({
        test: 'login_without_csrf',
        error: error.message,
        hasCSRFProtection: true,
      });
    }

    // Test 2: Login with invalid origin
    try {
      const response = await this.page.request.post(`${this.baseUrl}/api/admin/login`, {
        data: { password: this.adminPassword },
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://malicious-site.com',
        },
      });
      
      results.push({
        test: 'login_invalid_origin',
        status: response.status(),
        success: response.status() === 200,
        hasOriginProtection: response.status() !== 200,
      });
    } catch (error) {
      results.push({
        test: 'login_invalid_origin',
        error: error.message,
        hasOriginProtection: true,
      });
    }

    return {
      results,
      hasCSRFProtection: results.some(r => r.hasCSRFProtection),
      hasOriginProtection: results.some(r => r.hasOriginProtection),
    };
  }
}

/**
 * JWT Testing Utilities
 * Provides helpers for testing JWT token handling
 */
export class JWTTestHelper {
  constructor(options = {}) {
    this.adminSecret = options.adminSecret || process.env.ADMIN_SECRET || 'test-secret-key-that-is-at-least-32-characters-long';
  }

  /**
   * Generate test JWT tokens
   */
  generateToken(payload = {}, options = {}) {
    const defaultPayload = {
      id: 'admin',
      role: 'admin',
      loginTime: Date.now(),
    };

    const tokenPayload = { ...defaultPayload, ...payload };
    
    return jwt.sign(tokenPayload, this.adminSecret, {
      expiresIn: options.expiresIn || '1h',
      issuer: 'alocubano-admin',
      ...options,
    });
  }

  /**
   * Generate expired token
   */
  generateExpiredToken(payload = {}) {
    return this.generateToken(payload, {
      expiresIn: '-1h', // Expired 1 hour ago
    });
  }

  /**
   * Generate malformed token
   */
  generateMalformedToken() {
    return 'malformed.jwt.token';
  }

  /**
   * Generate token with invalid signature
   */
  generateInvalidSignatureToken(payload = {}) {
    return jwt.sign(payload, 'wrong-secret-key', {
      expiresIn: '1h',
      issuer: 'alocubano-admin',
    });
  }

  /**
   * Verify token
   */
  verifyToken(token) {
    try {
      return {
        valid: true,
        payload: jwt.verify(token, this.adminSecret, {
          issuer: 'alocubano-admin',
        }),
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Decode token without verification (for testing)
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      return null;
    }
  }
}

/**
 * Session Management Utilities
 */
export class SessionTestHelper {
  constructor(page, options = {}) {
    this.page = page;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
  }

  /**
   * Test session persistence across page reloads
   */
  async testSessionPersistence() {
    const auth = new AdminAuthHelper(this.page);
    
    // Login
    await auth.login();
    const initialSession = await auth.getCurrentSession();

    // Reload page
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
    
    // Check if still logged in
    const afterReloadSession = await auth.getCurrentSession();
    const stillLoggedIn = await auth.isLoggedIn();

    return {
      initialSession: !!initialSession,
      afterReload: {
        hasSession: !!afterReloadSession,
        isValid: afterReloadSession?.isValid || false,
        stillLoggedIn,
      },
      sessionPersisted: stillLoggedIn,
    };
  }

  /**
   * Test concurrent sessions
   */
  async testConcurrentSessions() {
    // This would require multiple browser contexts
    // For now, we'll test session invalidation
    const auth = new AdminAuthHelper(this.page);
    
    await auth.login();
    const session1 = await auth.getCurrentSession();

    // Simulate another login (which might invalidate the first session)
    await auth.logout();
    await auth.login();
    const session2 = await auth.getCurrentSession();

    return {
      session1: {
        token: session1?.token || null,
        isValid: session1?.isValid || false,
      },
      session2: {
        token: session2?.token || null,
        isValid: session2?.isValid || false,
      },
      tokensAreDifferent: session1?.token !== session2?.token,
    };
  }

  /**
   * Test session timeout
   */
  async testSessionTimeout(timeoutMs = 5000) {
    const auth = new AdminAuthHelper(this.page, {
      sessionDuration: timeoutMs,
    });

    // Create a short-lived session
    await auth.setMockAuthState({
      id: 'admin',
      exp: Math.floor((Date.now() + timeoutMs) / 1000),
    });

    const initialSession = await auth.getCurrentSession();
    
    // Wait for session to expire
    await this.page.waitForTimeout(timeoutMs + 1000);
    
    // Try to access protected resource
    await this.page.goto('/admin/dashboard');
    const finalUrl = this.page.url();
    
    return {
      initialSession: {
        exists: !!initialSession,
        isValid: initialSession?.isValid || false,
      },
      afterTimeout: {
        redirectedToLogin: finalUrl.includes('/admin/login'),
      },
      sessionExpiredProperly: finalUrl.includes('/admin/login'),
    };
  }
}

// Export default factory function
export default function createAdminAuth(page, options = {}) {
  return new AdminAuthHelper(page, options);
}

// All utility classes are already exported with 'export class' above