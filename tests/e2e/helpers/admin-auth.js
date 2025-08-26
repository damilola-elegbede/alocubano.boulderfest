/**
 * Admin Authentication Utilities for E2E Testing
 * Provides comprehensive admin login, session management, and security testing helpers
 */

import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Admin Authentication Helper
 * Handles login flows, session management, and JWT operations
 */
export class AdminAuthHelper {
  constructor(page, options = {}) {
    this.page = page;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.adminPassword = options.adminPassword || process.env.TEST_ADMIN_PASSWORD || this.generateSecureTestPassword();
    this.adminSecret = this.validateAndGetAdminSecret(options.adminSecret);
    this.sessionDuration = options.sessionDuration || 3600000; // 1 hour
    this.currentSession = null;
    this.logger = this.initializeLogger();
  }

  /**
   * Validate and retrieve admin secret with proper error handling
   * @param {string} providedSecret - Optional secret provided in options
   * @returns {string} Validated admin secret
   * @throws {Error} If no valid secret is available
   */
  validateAndGetAdminSecret(providedSecret) {
    const secret = providedSecret || process.env.ADMIN_SECRET;
    
    if (!secret) {
      const error = new Error(
        'ADMIN_SECRET environment variable is required for authentication tests. ' +
        'Please set ADMIN_SECRET with a secure 32+ character key.'
      );
      this.logSecurityEvent('MISSING_ADMIN_SECRET', 'critical', { 
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    if (secret.length < 32) {
      const error = new Error(
        'ADMIN_SECRET must be at least 32 characters long for security compliance. ' +
        `Current length: ${secret.length} characters.`
      );
      this.logSecurityEvent('WEAK_ADMIN_SECRET', 'high', {
        error: error.message,
        secretLength: secret.length,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    // Validate secret doesn't contain obvious test patterns
    const forbiddenPatterns = [
      /test-secret/i,
      /example/i,
      /default/i,
      /placeholder/i,
      /changeme/i
    ];
    
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(secret)) {
        const error = new Error(
          'ADMIN_SECRET appears to be a test or example value. ' +
          'Please use a cryptographically secure random string.'
        );
        this.logSecurityEvent('INSECURE_ADMIN_SECRET_PATTERN', 'critical', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    }
    
    this.logSecurityEvent('ADMIN_SECRET_VALIDATED', 'info', {
      secretLength: secret.length,
      timestamp: new Date().toISOString()
    });
    
    return secret;
  }

  /**
   * Generate a secure test password when environment variables are not available
   * @returns {string} Cryptographically secure password
   */
  generateSecureTestPassword() {
    // Generate a secure 16-character random password with required complexity
    const randomBytes = crypto.randomBytes(12).toString('hex');
    const specialChars = '!@#$%^&*';
    const randomSpecial = specialChars[crypto.randomInt(0, specialChars.length)];
    const randomNumber = crypto.randomInt(0, 10);
    
    // Combine to create a secure password: randomBytes + number + special + uppercase
    return randomBytes + randomNumber + randomSpecial + 'A';
  }

  /**
   * Initialize security event logger
   * @returns {Object} Logger instance
   */
  initializeLogger() {
    return {
      events: [],
      log: (level, message, data = {}) => {
        const event = {
          timestamp: new Date().toISOString(),
          level,
          message,
          data,
          testId: process.env.E2E_TEST_RUN_ID || 'unknown'
        };
        events.push(event);
        
        // Only log to console in development or if explicitly enabled
        if (process.env.NODE_ENV !== 'production' || process.env.LOG_SECURITY_EVENTS === 'true') {
          console.log(`[SECURITY-${level.toUpperCase()}]`, message, data);
        }
      }
    };
  }

  /**
   * Log security events for audit trail
   * @param {string} eventType - Type of security event
   * @param {string} severity - Severity level (info, warning, high, critical)
   * @param {Object} details - Additional event details
   */
  logSecurityEvent(eventType, severity, details = {}) {
    const event = {
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      userAgent: 'playwright-browser' || 'unknown',
      testEnvironment: process.env.NODE_ENV || 'development',
      ...details
    };
    
    if (this.logger) {
      this.logger.log(severity, `Security Event: ${eventType}`, event);
    }
    
    // Store in global security audit log if available
    if (global.securityAuditLog) {
      global.securityAuditLog.push(event);
    }
  }

  /**
   * Perform admin login with full flow support and security validation
   */
  async login(credentials = {}) {
    const loginStartTime = Date.now();
    
    try {
      const {
        password = this.adminPassword,
        mfaCode = null,
        expectMfa = false,
        skipNavigation = false,
        validateSecurity = true,
      } = credentials;

      this.logSecurityEvent('LOGIN_ATTEMPT_START', 'info', {
        skipNavigation,
        expectMfa,
        passwordLength: password?.length || 0
      });

      if (!password) {
        const error = new Error('Password is required for admin login');
        this.logSecurityEvent('LOGIN_MISSING_PASSWORD', 'high', { 
          error: error.message 
        });
        throw error;
      }

      if (!skipNavigation) {
        await this.page.goto('/admin/login');
        await this.page.waitForLoadState('networkidle', { timeout: 10000 });
      }

      // Step 1: Password authentication with security monitoring
      await this.performSecurePasswordEntry(password);

      // Wait for response with timeout
      const loginResponse = await Promise.race([
        this.waitForLoginResponse(),
        this.createTimeoutPromise(15000, 'Login response timeout')
      ]);

      // Check if MFA is required
      const currentUrl = this.page.url();
      const pageContent = await this.page.textContent('body');

      if (expectMfa || pageContent.includes('MFA') || pageContent.includes('authentication code')) {
        if (!mfaCode) {
          const error = new Error('MFA code required but not provided');
          this.logSecurityEvent('LOGIN_MFA_REQUIRED', 'warning', { 
            error: error.message 
          });
          throw error;
        }

        // Step 2: MFA authentication with validation
        await this.performSecureMfaEntry(mfaCode);
      }

      // Verify successful login with security checks
      await this.verifySecureLoginSuccess(validateSecurity);
      
      // Store session information with validation
      this.currentSession = await this.getCurrentSessionWithValidation();
      
      const loginDuration = Date.now() - loginStartTime;
      this.logSecurityEvent('LOGIN_SUCCESS', 'info', {
        duration: loginDuration,
        mfaUsed: !!mfaCode,
        sessionId: this.currentSession?.token?.substring(0, 8) + '...'
      });
      
      return this.currentSession;
    } catch (error) {
      const loginDuration = Date.now() - loginStartTime;
      this.logSecurityEvent('LOGIN_FAILURE', 'high', {
        error: error.message,
        duration: loginDuration,
        stackTrace: error.stack
      });
      throw error;
    }
  }

  /**
   * Perform secure password entry with monitoring
   */
  async performSecurePasswordEntry(password) {
    try {
      // Fill password field securely
      const passwordField = await this.page.waitForSelector('input[type="password"]', { timeout: 5000 });
      if (!passwordField) {
        throw new Error('Password field not found');
      }
      
      await passwordField.fill(password);
      
      // Verify field was filled (without logging the actual password)
      const fieldValue = await passwordField.inputValue();
      if (!fieldValue || fieldValue.length === 0) {
        throw new Error('Password field could not be filled');
      }
      
      // Click submit button
      await this.page.click('button[type="submit"]');
      
    } catch (error) {
      this.logSecurityEvent('PASSWORD_ENTRY_FAILED', 'high', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Wait for login response with proper error handling
   */
  async waitForLoginResponse() {
    return new Promise((resolve, reject) => {
      let responseReceived = false;
      
      const responseHandler = (response) => {
        if (response.url().includes('/api/admin/login') && !responseReceived) {
          responseReceived = true;
          resolve(response);
        }
      };
      
      const timeoutHandler = setTimeout(() => {
        if (!responseReceived) {
          this.page.off('response', responseHandler);
          reject(new Error('No login response received within timeout'));
        }
      }, 10000);
      
      this.page.on('response', responseHandler);
      
      // Clean up after response
      setTimeout(() => {
        this.page.off('response', responseHandler);
        clearTimeout(timeoutHandler);
      }, 15000);
    });
  }

  /**
   * Create timeout promise helper
   */
  createTimeoutPromise(timeout, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }

  /**
   * Perform secure MFA entry with validation
   */
  async performSecureMfaEntry(mfaCode) {
    try {
      if (!mfaCode || !/^\d{6}$/.test(mfaCode)) {
        const error = new Error('MFA code must be exactly 6 digits');
        this.logSecurityEvent('INVALID_MFA_FORMAT', 'high', { 
          error: error.message 
        });
        throw error;
      }

      // Step 2: MFA authentication
      await this.enterMfaCode(mfaCode);
      
      this.logSecurityEvent('MFA_CODE_ENTERED', 'info', {
        codeLength: mfaCode.length
      });
      
    } catch (error) {
      this.logSecurityEvent('MFA_ENTRY_FAILED', 'high', {
        error: error.message
      });
      throw error;
    }
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

    await mfaInput.fill(code);
    
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
   * Verify login was successful with enhanced security validation
   */
  async verifySecureLoginSuccess(validateSecurity = true) {
    const verificationStart = Date.now();
    
    try {
      this.logSecurityEvent('LOGIN_VERIFICATION_START', 'info');
      
      // Wait for navigation to admin dashboard or success indicators
      await Promise.race([
        this.page.waitForURL('**/admin/dashboard', { timeout: 8000 }),
        this.page.waitForSelector('.admin-dashboard', { timeout: 8000 }),
        this.page.waitForSelector('[data-testid="admin-content"]', { timeout: 8000 }),
      ]);
      
      if (validateSecurity) {
        await this.performSecurityValidation();
      }
      
      const verificationDuration = Date.now() - verificationStart;
      this.logSecurityEvent('LOGIN_VERIFICATION_SUCCESS', 'info', {
        duration: verificationDuration,
        finalUrl: this.page.url()
      });
      
    } catch (error) {
      // Enhanced error detection and logging
      await this.handleLoginVerificationError(error, verificationStart);
    }
  }

  /**
   * Perform additional security validation after login
   */
  async performSecurityValidation() {
    try {
      // Check for security headers
      const response = await this.page.request.get('/api/admin/dashboard');
      const headers = response.headers();
      
      const requiredHeaders = [
        'x-frame-options',
        'x-content-type-options',
        'strict-transport-security'
      ];
      
      const missingHeaders = requiredHeaders.filter(header => !headers[header]);
      if (missingHeaders.length > 0) {
        this.logSecurityEvent('MISSING_SECURITY_HEADERS', 'warning', {
          missingHeaders
        });
      }
      
      // Validate session cookie security
      const cookies = await this.page.context().cookies();
      const sessionCookie = cookies.find(cookie => cookie.name === 'admin_session');
      
      if (sessionCookie) {
        if (!sessionCookie.httpOnly) {
          this.logSecurityEvent('INSECURE_SESSION_COOKIE', 'high', {
            issue: 'Session cookie not marked HttpOnly'
          });
        }
        
        if (!sessionCookie.secure && this.page.url().startsWith('https:')) {
          this.logSecurityEvent('INSECURE_SESSION_COOKIE', 'high', {
            issue: 'Session cookie not marked Secure for HTTPS'
          });
        }
      }
      
    } catch (error) {
      this.logSecurityEvent('SECURITY_VALIDATION_ERROR', 'warning', {
        error: error.message
      });
    }
  }

  /**
   * Handle login verification errors with detailed logging
   */
  async handleLoginVerificationError(originalError, verificationStart) {
    const verificationDuration = Date.now() - verificationStart;
    
    try {
      // Check for error messages
      const errorElement = await this.page.$('.error, .alert-error, [data-testid="error"]');
      if (errorElement) {
        const errorText = await errorElement.textContent();
        const error = new Error(`Login failed: ${errorText}`);
        this.logSecurityEvent('LOGIN_ERROR_DETECTED', 'high', {
          errorText,
          duration: verificationDuration,
          url: this.page.url()
        });
        throw error;
      }
      
      // Check current URL for login failure
      const currentUrl = this.page.url();
      if (currentUrl.includes('/admin/login')) {
        const error = new Error('Login failed: Still on login page');
        this.logSecurityEvent('LOGIN_REDIRECT_FAILED', 'high', {
          currentUrl,
          duration: verificationDuration
        });
        throw error;
      }
      
      // Check for potential security blocks
      if (currentUrl.includes('blocked') || currentUrl.includes('unauthorized')) {
        const error = new Error('Login blocked by security policy');
        this.logSecurityEvent('LOGIN_SECURITY_BLOCKED', 'critical', {
          currentUrl,
          duration: verificationDuration
        });
        throw error;
      }
      
    } catch (detailedError) {
      this.logSecurityEvent('LOGIN_VERIFICATION_FAILED', 'high', {
        originalError: originalError.message,
        detailedError: detailedError.message,
        duration: verificationDuration,
        url: this.page.url()
      });
      throw detailedError;
    }
    
    // If no specific error found, throw original with enhanced context
    const error = new Error(`Login verification failed: ${originalError.message}`);
    this.logSecurityEvent('LOGIN_VERIFICATION_TIMEOUT', 'high', {
      originalError: originalError.message,
      duration: verificationDuration,
      url: this.page.url()
    });
    throw error;
  }

  /**
   * Get current session information with comprehensive validation
   */
  async getCurrentSessionWithValidation() {
    try {
      this.logSecurityEvent('SESSION_RETRIEVAL_START', 'info');
      
      const cookies = await this.page.context().cookies();
      const sessionCookie = cookies.find(cookie => cookie.name === 'admin_session');
      
      if (!sessionCookie) {
        this.logSecurityEvent('SESSION_COOKIE_MISSING', 'warning');
        return null;
      }

      // Validate cookie properties
      this.validateSessionCookieProperties(sessionCookie);

      try {
        const decoded = jwt.verify(sessionCookie.value, this.adminSecret, {
          issuer: 'alocubano-admin',
          algorithms: ['HS256'], // Explicitly specify allowed algorithms
          maxAge: '24h' // Maximum session age
        });
        
        const session = {
          token: sessionCookie.value,
          admin: decoded,
          expiresAt: new Date(decoded.exp * 1000),
          isValid: Date.now() < (decoded.exp * 1000),
          securityValidated: true
        };
        
        this.logSecurityEvent('SESSION_VALIDATED', 'info', {
          adminId: decoded.id,
          expiresAt: session.expiresAt,
          isValid: session.isValid,
          issuer: decoded.iss
        });
        
        return session;
        
      } catch (jwtError) {
        this.logSecurityEvent('SESSION_TOKEN_INVALID', 'high', {
          error: jwtError.message,
          tokenLength: sessionCookie.value?.length || 0
        });
        
        return {
          token: sessionCookie.value,
          admin: null,
          expiresAt: null,
          isValid: false,
          error: jwtError.message,
          securityValidated: false
        };
      }
    } catch (error) {
      this.logSecurityEvent('SESSION_RETRIEVAL_ERROR', 'high', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate session cookie security properties
   */
  validateSessionCookieProperties(sessionCookie) {
    const securityIssues = [];
    
    if (!sessionCookie.httpOnly) {
      securityIssues.push('Cookie not marked HttpOnly');
    }
    
    if (!sessionCookie.secure && this.page.url().startsWith('https:')) {
      securityIssues.push('Cookie not marked Secure for HTTPS');
    }
    
    if (!sessionCookie.sameSite || sessionCookie.sameSite === 'None') {
      securityIssues.push('Cookie SameSite policy not restrictive enough');
    }
    
    if (securityIssues.length > 0) {
      this.logSecurityEvent('SESSION_COOKIE_SECURITY_ISSUES', 'warning', {
        issues: securityIssues
      });
    }
  }

  /**
   * Fallback method for backward compatibility
   */
  async getCurrentSession() {
    return await this.getCurrentSessionWithValidation();
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
   * Create mock session token for testing with security validation
   * WARNING: This method should only be used in test environments
   */
  createMockSessionToken(adminData = {}) {
    // Security check: Only allow in test environments
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Mock authentication is not allowed in production environment');
      this.logSecurityEvent('MOCK_AUTH_PRODUCTION_BLOCK', 'critical', {
        error: error.message,
        environment: process.env.NODE_ENV
      });
      throw error;
    }

    this.logSecurityEvent('MOCK_SESSION_TOKEN_CREATED', 'warning', {
      adminId: adminData.id || 'admin',
      environment: process.env.NODE_ENV,
      testMode: true
    });

    const payload = {
      id: adminData.id || 'admin',
      role: 'admin',
      loginTime: Date.now(),
      testMode: true, // Mark as test token
      mockSession: true,
      ...adminData,
    };

    return jwt.sign(payload, this.adminSecret, {
      expiresIn: Math.floor(this.sessionDuration / 1000) + 's',
      issuer: 'alocubano-admin',
      algorithm: 'HS256'
    });
  }

  /**
   * Set mock authentication state with security constraints
   * WARNING: This method bypasses normal authentication - use only for testing
   */
  async setMockAuthState(sessionData = {}) {
    // Enhanced security checks
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Mock authentication state cannot be set in production environment');
      this.logSecurityEvent('MOCK_AUTH_STATE_PRODUCTION_BLOCK', 'critical', {
        error: error.message,
        environment: process.env.NODE_ENV
      });
      throw error;
    }

    // Log security warning
    this.logSecurityEvent('MOCK_AUTH_STATE_SET', 'warning', {
      adminId: sessionData.id || 'admin',
      sessionDuration: this.sessionDuration,
      testEnvironment: process.env.NODE_ENV,
      warning: 'Authentication security bypassed for testing'
    });

    try {
      const token = this.createMockSessionToken(sessionData);
      
      // Set secure cookie properties based on environment
      const isHttps = this.baseUrl.startsWith('https:');
      
      await this.page.context().addCookies([{
        name: 'admin_session',
        value: token,
        domain: new URL(this.baseUrl).hostname,
        path: '/',
        httpOnly: true,
        secure: isHttps, // Use HTTPS detection instead of hardcoded false
        sameSite: 'Strict', // Enhanced security
        expires: Math.floor((Date.now() + this.sessionDuration) / 1000)
      }]);

      this.currentSession = {
        token,
        admin: {
          ...sessionData,
          testMode: true,
          mockSession: true
        },
        expiresAt: new Date(Date.now() + this.sessionDuration),
        isValid: true,
        securityValidated: false, // Mark as mock
        mockSession: true
      };

      this.logSecurityEvent('MOCK_AUTH_STATE_SUCCESS', 'info', {
        sessionSet: true,
        expiresAt: this.currentSession.expiresAt,
        cookieSecure: isHttps
      });

      return this.currentSession;
    } catch (error) {
      this.logSecurityEvent('MOCK_AUTH_STATE_FAILED', 'high', {
        error: error.message
      });
      throw error;
    }
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
    this.adminPassword = options.adminPassword || process.env.TEST_ADMIN_PASSWORD || this.generateSecureTestPassword();
  }

  /**
   * Generate a secure test password when environment variables are not available
   * @returns {string} Cryptographically secure password
   */
  generateSecureTestPassword() {
    // Generate a secure 16-character random password with required complexity
    const randomBytes = crypto.randomBytes(12).toString('hex');
    const specialChars = '!@#$%^&*';
    const randomSpecial = specialChars[crypto.randomInt(0, specialChars.length)];
    const randomNumber = crypto.randomInt(0, 10);
    
    // Combine to create a secure password: randomBytes + number + special + uppercase
    return randomBytes + randomNumber + randomSpecial + 'A';
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
    this.adminSecret = this.validateAdminSecret(options.adminSecret);
    this.logger = this.initializeLogger();
  }

  /**
   * Validate admin secret with the same security standards
   */
  validateAdminSecret(providedSecret) {
    const secret = providedSecret || process.env.ADMIN_SECRET;
    
    if (!secret) {
      throw new Error(
        'ADMIN_SECRET environment variable is required for JWT testing. ' +
        'Please set ADMIN_SECRET with a secure 32+ character key.'
      );
    }
    
    if (secret.length < 32) {
      throw new Error(
        'ADMIN_SECRET must be at least 32 characters long for security compliance. ' +
        `Current length: ${secret.length} characters.`
      );
    }
    
    // Validate secret doesn't contain obvious test patterns
    const forbiddenPatterns = [
      /test-secret/i,
      /example/i,
      /default/i,
      /placeholder/i,
      /changeme/i
    ];
    
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(secret)) {
        throw new Error(
          'ADMIN_SECRET appears to be a test or example value. ' +
          'Please use a cryptographically secure random string.'
        );
      }
    }
    
    return secret;
  }

  /**
   * Initialize logger for JWT operations
   */
  initializeLogger() {
    return {
      events: [],
      log: (level, message, data = {}) => {
        if (process.env.NODE_ENV !== 'production' || process.env.LOG_SECURITY_EVENTS === 'true') {
          console.log(`[JWT-${level.toUpperCase()}]`, message, data);
        }
      }
    };
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

export default function createAdminAuth(page, options = {}) {
  return new AdminAuthHelper(page, options);
}

/**
 * Global security audit log for cross-test tracking
 */
if (typeof global !== 'undefined') {
  global.securityAuditLog = global.securityAuditLog || [];
}

// All utility classes are already exported with 'export class' above