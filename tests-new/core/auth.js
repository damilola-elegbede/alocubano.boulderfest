/**
 * Authentication Helpers for Integration Tests
 * Handles admin login, JWT token generation, and authentication state
 */
import { httpClient } from './http.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

class AuthHelper {
  constructor() {
    this.adminToken = null;
    // Do not snapshot secrets here; read from process.env when needed
    this.sessionDuration = 3600000; // 1 hour
  }
  
  get adminSecret() {
    return process.env.ADMIN_SECRET;
  }
  
  get adminPassword() {
    return process.env.ADMIN_PASSWORD;
  }

  /**
   * Login as admin and get authentication token
   */
  async loginAdmin(password = null) {
    try {
      // Use provided password or default test password
      const loginPassword = password || 'test-admin-password';
      
      console.log('🔐 Attempting admin login...');
      
      const response = await httpClient.post('/api/admin/login', {
        password: loginPassword
      });

      if (!response.ok) {
        throw new Error(`Admin login failed: ${response.status} - ${response.data?.error || response.statusText}`);
      }

      // Extract token from response
      this.adminToken = response.data.token;
      console.log('✅ Admin login successful');
      
      return this.adminToken;
    } catch (error) {
      console.error('❌ Admin login failed:', error);
      throw error;
    }
  }

  /**
   * Generate a test admin JWT token directly (for testing)
   */
  generateTestAdminToken() {
    if (!this.adminSecret) {
      throw new Error('ADMIN_SECRET environment variable required for test token generation');
    }

    const payload = {
      admin: true,
      type: 'admin',
      test: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (this.sessionDuration / 1000)
    };

    this.adminToken = jwt.sign(payload, this.adminSecret);
    console.log('✅ Test admin token generated');
    
    return this.adminToken;
  }

  /**
   * Get current admin token
   */
  getAdminToken() {
    if (!this.adminToken) {
      throw new Error('No admin token available. Call loginAdmin() first.');
    }
    return this.adminToken;
  }

  /**
   * Clear authentication state
   */
  clearAuth() {
    this.adminToken = null;
    console.log('🧹 Authentication state cleared');
  }

  /**
   * Verify if current token is valid
   */
  async verifyToken(token = null) {
    const tokenToVerify = token || this.adminToken;
    
    if (!tokenToVerify) {
      return { valid: false, error: 'No token provided' };
    }

    try {
      const decoded = jwt.verify(tokenToVerify, this.adminSecret);
      return { valid: true, decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Make an authenticated request using stored admin token
   */
  async authenticatedRequest(method, path, data, options = {}) {
    if (!this.adminToken) {
      throw new Error('No admin token available. Call loginAdmin() first.');
    }

    return httpClient.authenticatedRequest(method, path, data, this.adminToken, options);
  }

  /**
   * Create test user credentials
   */
  createTestCredentials() {
    return {
      password: 'test-admin-password',
      hashedPassword: bcrypt.hashSync('test-admin-password', 10)
    };
  }

  /**
   * Generate API key for testing external services
   */
  generateTestApiKey(service = 'test') {
    const payload = {
      service,
      test: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    return jwt.sign(payload, this.adminSecret);
  }

  /**
   * Generate QR token for ticket validation testing
   */
  generateTestQrToken(ticketId, maxScans = 5) {
    const qrSecret = process.env.QR_SECRET_KEY;
    if (!qrSecret) {
      throw new Error('QR_SECRET_KEY environment variable required');
    }

    const payload = {
      ticketId,
      maxScans,
      test: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (180 * 24 * 60 * 60) // 180 days
    };

    return jwt.sign(payload, qrSecret);
  }

  /**
   * Setup authentication for a test suite
   */
  async setupTestAuth() {
    try {
      // Try to generate test token first (faster)
      this.generateTestAdminToken();
      
      // Verify token works by making a test request
      const response = await this.authenticatedRequest('GET', '/api/admin/dashboard');
      
      if (response.ok) {
        console.log('✅ Test authentication setup complete');
        return this.adminToken;
      } else {
        console.log('⚠️ Test token failed, falling back to login...');
        return await this.loginAdmin();
      }
    } catch (error) {
      console.log('⚠️ Token generation failed, falling back to login...');
      return await this.loginAdmin();
    }
  }

  /**
   * Get authentication headers for direct use
   */
  getAuthHeaders() {
    if (!this.adminToken) {
      throw new Error('No admin token available. Call setupTestAuth() first.');
    }

    return {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Check if admin password environment variable is properly configured
   */
  validateAdminConfig() {
    const issues = [];
    
    if (!this.adminSecret) {
      issues.push('ADMIN_SECRET environment variable missing');
    } else if (this.adminSecret.length < 32) {
      issues.push('ADMIN_SECRET should be at least 32 characters long');
    }

    if (!this.adminPassword) {
      issues.push('ADMIN_PASSWORD environment variable missing');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// Export singleton instance
export const authHelper = new AuthHelper();

// Export class for creating additional instances if needed
export { AuthHelper };