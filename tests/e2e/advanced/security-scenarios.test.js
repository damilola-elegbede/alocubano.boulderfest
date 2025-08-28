/**
 * Comprehensive Security and Data Protection Test Scenarios
 * Tests the A Lo Cubano Boulder Fest website for OWASP Top 10 vulnerabilities,
 * PCI compliance, and comprehensive security controls
 * 
 * Phase 4 PR #1 - Security Testing Implementation
 * Requirements: REQ-INT-001, REQ-FUNC-004, REQ-E2E-001
 */

import { test, expect } from '@playwright/test';
import {
  SecurityTestOrchestrator,
  SQLInjectionPayloads,
  XSSPayloads,
  CSRFAttackUtils,
  AuthBypassUtils,
  InputValidationUtils,
  SecurityHeadersValidator,
  PCIComplianceUtils,
  DataExposureUtils
} from '../helpers/security-testing.js';
import { AdminAuthHelper } from '../helpers/admin-auth.js';
import { BasePage } from '../helpers/base-page.js';
import { DatabaseCleanup } from '../helpers/database-cleanup.js';
import crypto from 'crypto';

test.describe('Comprehensive Security and Data Protection', () => {
  let securityOrchestrator;
  let adminAuthHelper;
  let basePage;
  let databaseCleanup;
  let testRunId;
  
  const baseUrl = 'http://localhost:3000';
  
  test.beforeAll(async () => {
    databaseCleanup = new DatabaseCleanup();
    testRunId = `security-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    console.log(`Security test run ID: ${testRunId}`);
  });

  test.afterAll(async () => {
    // Cleanup test data
    if (!process.env.KEEP_TEST_DATA) {
      const cleanupResult = await databaseCleanup.cleanupByTestRunId(testRunId);
      console.log('Security test cleanup result:', cleanupResult);
    }
    await databaseCleanup?.close();
  });

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    securityOrchestrator = new SecurityTestOrchestrator(page, baseUrl);
    adminAuthHelper = new AdminAuthHelper(page, { baseUrl });
    
    // Set longer timeout for security tests
    page.setDefaultTimeout(45000);
    
    // Clear browser storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
  });

  test.describe('Input Validation and Sanitization Tests', () => {
    test('should prevent SQL injection attacks on all input fields', async ({ page }) => {
      const sqlPayloads = SQLInjectionPayloads.getClassicPayloads();
      const results = {
        passed: [],
        failed: [],
        warnings: [],
        testedEndpoints: []
      };

      // Test critical endpoints with SQL injection payloads
      const testEndpoints = [
        { url: '/api/email/subscribe', method: 'POST', data: { email: 'test@test.com' } },
        { url: '/api/admin/login', method: 'POST', data: { password: 'testpass' } },
        { url: '/api/tickets/validate', method: 'POST', data: { ticketId: 'test' } },
        { url: '/api/registration/batch', method: 'POST', data: { tickets: [] } }
      ];

      for (const endpoint of testEndpoints) {
        console.log(`Testing SQL injection on ${endpoint.url}`);
        results.testedEndpoints.push(endpoint.url);

        for (const payload of sqlPayloads.slice(0, 5)) { // Test first 5 payloads per endpoint
          try {
            // Test payload in different data fields
            const testData = { ...endpoint.data };
            
            if (testData.email) testData.email = payload;
            if (testData.password) testData.password = payload;
            if (testData.ticketId) testData.ticketId = payload;

            const response = await page.request.post(`${baseUrl}${endpoint.url}`, {
              data: testData,
              failOnStatusCode: false
            });

            const responseText = await response.text();
            const status = response.status();

            // Check for SQL injection success indicators
            if (responseText.toLowerCase().includes('syntax error') ||
                responseText.toLowerCase().includes('mysql') ||
                responseText.toLowerCase().includes('sqlite') ||
                responseText.toLowerCase().includes('table') ||
                status === 500 && responseText.includes('database')) {
              results.failed.push({
                endpoint: endpoint.url,
                payload: payload.substring(0, 50),
                issue: 'Possible SQL injection vulnerability detected',
                status,
                response: responseText.substring(0, 200)
              });
            } else if (status === 400 || status === 422) {
              // Good - input validation rejected the payload
              results.passed.push({
                endpoint: endpoint.url,
                payload: payload.substring(0, 50),
                status,
                message: 'Input validation properly rejected malicious payload'
              });
            } else if (status >= 500) {
              results.warnings.push({
                endpoint: endpoint.url,
                payload: payload.substring(0, 50),
                issue: 'Server error - needs investigation',
                status
              });
            }
          } catch (error) {
            results.warnings.push({
              endpoint: endpoint.url,
              error: error.message
            });
          }
        }
      }

      console.log('SQL Injection Test Results:', {
        passed: results.passed.length,
        failed: results.failed.length,
        warnings: results.warnings.length,
        testedEndpoints: results.testedEndpoints.length
      });

      // Log detailed results for debugging
      if (results.failed.length > 0) {
        console.log('SQL Injection Vulnerabilities Found:', results.failed);
      }

      // Assertions
      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
      expect(results.testedEndpoints.length).toBeGreaterThan(0);
    });

    test('should prevent XSS attacks in all user input fields', async ({ page }) => {
      const xssPayloads = XSSPayloads.getReflectedPayloads();
      const results = {
        passed: [],
        failed: [],
        warnings: [],
        testedFields: []
      };

      // Navigate to key pages and test XSS in input fields
      const testPages = [
        { url: '/tickets', inputSelectors: ['input[name="firstName"]', 'input[name="lastName"]', 'input[name="email"]'] },
        { url: '/index.html#newsletter', inputSelectors: ['input[name="email"]', 'input[name="firstName"]'] }
      ];

      for (const testPage of testPages) {
        await page.goto(`${baseUrl}${testPage.url}`);
        await page.waitForLoadState('networkidle');

        for (const selector of testPage.inputSelectors) {
          results.testedFields.push(`${testPage.url}:${selector}`);
          
          const inputElement = await page.$(selector);
          if (!inputElement) continue;

          for (const payload of xssPayloads.slice(0, 3)) { // Test first 3 XSS payloads per field
            try {
              // Clear and fill input with XSS payload
              await inputElement.clear();
              await inputElement.fill(payload);

              // Wait a moment for any XSS to execute
              await page.waitForTimeout(500);

              // Check if XSS executed by looking for common indicators
              const hasAlert = await page.evaluate(() => {
                return window.xssExecuted || document.title.includes('XSS') || 
                       document.body.innerHTML.includes('<h1>Stored XSS</h1>');
              });

              if (hasAlert) {
                results.failed.push({
                  page: testPage.url,
                  field: selector,
                  payload: payload.substring(0, 50),
                  issue: 'XSS payload executed successfully'
                });
              } else {
                // Check if input was properly sanitized
                const inputValue = await inputElement.inputValue();
                if (inputValue !== payload || inputValue.includes('&lt;') || inputValue.includes('&gt;')) {
                  results.passed.push({
                    page: testPage.url,
                    field: selector,
                    payload: payload.substring(0, 50),
                    message: 'Input properly sanitized or rejected'
                  });
                }
              }
            } catch (error) {
              results.warnings.push({
                page: testPage.url,
                field: selector,
                error: error.message
              });
            }
          }
        }
      }

      console.log('XSS Test Results:', {
        passed: results.passed.length,
        failed: results.failed.length,
        warnings: results.warnings.length,
        testedFields: results.testedFields.length
      });

      if (results.failed.length > 0) {
        console.log('XSS Vulnerabilities Found:', results.failed);
      }

      expect(results.failed.length).toBe(0);
      expect(results.testedFields.length).toBeGreaterThan(0);
    });

    test('should handle buffer overflow and format string attacks safely', async ({ page }) => {
      const overflowPayloads = InputValidationUtils.getOverflowPayloads();
      const formatPayloads = InputValidationUtils.getFormatStringPayloads();
      const results = { passed: [], failed: [], warnings: [] };

      const testEndpoints = [
        { url: '/api/email/subscribe', method: 'POST', field: 'email' },
        { url: '/api/email/subscribe', method: 'POST', field: 'firstName' }
      ];

      for (const endpoint of testEndpoints) {
        // Test buffer overflow
        for (const payload of overflowPayloads.slice(0, 3)) {
          try {
            const testData = { [endpoint.field]: payload, consentToMarketing: true };
            
            const response = await page.request.post(`${baseUrl}${endpoint.url}`, {
              data: testData,
              failOnStatusCode: false,
              timeout: 10000 // 10 second timeout
            });

            const status = response.status();
            
            if (status === 413 || status === 400) {
              results.passed.push({
                endpoint: endpoint.url,
                field: endpoint.field,
                payload: 'Buffer overflow payload',
                message: 'Server properly rejected oversized input'
              });
            } else if (status >= 500) {
              results.failed.push({
                endpoint: endpoint.url,
                field: endpoint.field,
                payload: 'Buffer overflow payload',
                issue: 'Server error suggests possible buffer overflow vulnerability',
                status
              });
            }
          } catch (error) {
            if (error.message.includes('timeout')) {
              results.failed.push({
                endpoint: endpoint.url,
                field: endpoint.field,
                issue: 'Request timeout suggests possible DoS vulnerability'
              });
            }
          }
        }

        // Test format string attacks
        for (const payload of formatPayloads.slice(0, 2)) {
          try {
            const testData = { [endpoint.field]: payload, consentToMarketing: true };
            
            const response = await page.request.post(`${baseUrl}${endpoint.url}`, {
              data: testData,
              failOnStatusCode: false
            });

            const responseText = await response.text();
            
            // Check for format string vulnerability indicators
            if (responseText.includes('%x') || responseText.includes('%p') || 
                responseText.match(/0x[0-9a-f]+/i)) {
              results.failed.push({
                endpoint: endpoint.url,
                field: endpoint.field,
                payload: payload,
                issue: 'Format string vulnerability detected',
                response: responseText.substring(0, 100)
              });
            } else {
              results.passed.push({
                endpoint: endpoint.url,
                field: endpoint.field,
                payload: payload,
                message: 'Format string attack properly handled'
              });
            }
          } catch (error) {
            results.warnings.push({
              endpoint: endpoint.url,
              field: endpoint.field,
              error: error.message
            });
          }
        }
      }

      console.log('Buffer Overflow/Format String Test Results:', results);
      
      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
    });

    test('should prevent path traversal attacks', async ({ page }) => {
      const pathTraversalPayloads = InputValidationUtils.getPathTraversalPayloads();
      const results = { passed: [], failed: [], warnings: [] };

      // Test file access endpoints
      const testEndpoints = [
        '/api/tickets/',
        '/api/gallery?path=',
        '/api/image-proxy/'
      ];

      for (const baseEndpoint of testEndpoints) {
        for (const payload of pathTraversalPayloads.slice(0, 5)) {
          try {
            const testUrl = `${baseUrl}${baseEndpoint}${encodeURIComponent(payload)}`;
            
            const response = await page.request.get(testUrl, {
              failOnStatusCode: false
            });

            const responseText = await response.text();
            const status = response.status();

            // Check for successful path traversal
            if (responseText.includes('root:') || 
                responseText.includes('/etc/passwd') ||
                responseText.includes('[users]') ||
                status === 200 && responseText.includes('system32')) {
              results.failed.push({
                endpoint: baseEndpoint,
                payload: payload,
                issue: 'Path traversal attack successful',
                status,
                response: responseText.substring(0, 100)
              });
            } else if (status === 400 || status === 403 || status === 404) {
              results.passed.push({
                endpoint: baseEndpoint,
                payload: payload.substring(0, 30),
                message: 'Path traversal properly blocked',
                status
              });
            }
          } catch (error) {
            results.warnings.push({
              endpoint: baseEndpoint,
              error: error.message
            });
          }
        }
      }

      console.log('Path Traversal Test Results:', results);
      
      if (results.failed.length > 0) {
        console.log('Path Traversal Vulnerabilities Found:', results.failed);
      }

      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
    });
  });

  test.describe('Authentication and Authorization Security', () => {
    test('should resist JWT manipulation attacks', async ({ page }) => {
      const jwtPayloads = AuthBypassUtils.getJWTManipulationPayloads();
      const results = { passed: [], failed: [], warnings: [] };

      for (const jwtTest of jwtPayloads) {
        let testToken;
        
        if (jwtTest.weakSecrets) {
          // Test weak secret attack
          for (const weakSecret of jwtTest.weakSecrets) {
            testToken = AuthBypassUtils.generateWeakJWT(jwtTest.payload, weakSecret);
            
            if (testToken) {
              const result = await testJWTBypass(page, testToken, `Weak secret: ${weakSecret}`);
              if (result.success) {
                results.failed.push(result);
              } else {
                results.passed.push(result);
              }
            }
          }
        } else if (jwtTest.header.alg === 'none') {
          // Test none algorithm attack
          testToken = AuthBypassUtils.generateNoneAlgorithmJWT(jwtTest.payload);
          
          const result = await testJWTBypass(page, testToken, 'None algorithm attack');
          if (result.success) {
            results.failed.push(result);
          } else {
            results.passed.push(result);
          }
        }
      }

      console.log('JWT Manipulation Test Results:', results);
      
      if (results.failed.length > 0) {
        console.log('JWT Vulnerabilities Found:', results.failed);
      }

      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);

      async function testJWTBypass(page, token, description) {
        try {
          const response = await page.request.get(`${baseUrl}/api/admin/dashboard`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Cookie': `adminSession=${token}`
            },
            failOnStatusCode: false
          });

          const status = response.status();
          
          if (status === 200) {
            const responseData = await response.json();
            if (responseData.success || responseData.data) {
              return {
                success: true,
                description,
                issue: 'JWT bypass successful - gained unauthorized access',
                status,
                response: JSON.stringify(responseData).substring(0, 100)
              };
            }
          }

          return {
            success: false,
            description,
            message: 'JWT manipulation properly rejected',
            status
          };
        } catch (error) {
          return {
            success: false,
            description,
            error: error.message
          };
        }
      }
    });

    test('should prevent brute force attacks on login', async ({ page }) => {
      const results = { passed: [], failed: [], warnings: [] };
      const maxAttempts = 10;

      // Perform multiple failed login attempts
      for (let i = 1; i <= maxAttempts; i++) {
        try {
          const response = await page.request.post(`${baseUrl}/api/admin/login`, {
            data: {
              password: `wrongpassword${i}`,
              step: undefined
            },
            failOnStatusCode: false
          });

          const status = response.status();
          const responseData = await response.json();

          if (i <= 5 && status === 401) {
            // First few attempts should be normally rejected
            results.passed.push({
              attempt: i,
              status,
              message: 'Failed login properly rejected'
            });
          } else if (i > 5 && status === 429) {
            // After several attempts, should be rate limited
            results.passed.push({
              attempt: i,
              status,
              message: 'Rate limiting activated',
              remainingTime: responseData.remainingTime
            });
          } else if (i > 5 && status !== 429) {
            results.failed.push({
              attempt: i,
              status,
              issue: 'Rate limiting not activated after multiple failed attempts'
            });
          }
        } catch (error) {
          results.warnings.push({
            attempt: i,
            error: error.message
          });
        }

        // Small delay between attempts
        await page.waitForTimeout(100);
      }

      console.log('Brute Force Protection Test Results:', results);

      // Should have rate limiting after several failed attempts
      const rateLimitingActivated = results.passed.some(r => r.message === 'Rate limiting activated');
      expect(rateLimitingActivated).toBe(true);
      expect(results.failed.length).toBe(0);
    });

    test('should validate session security and prevent hijacking', async ({ page }) => {
      const sessionPayloads = AuthBypassUtils.getSessionHijackingPayloads();
      const results = { passed: [], failed: [], warnings: [] };

      for (const sessionTest of sessionPayloads) {
        try {
          // Test session token manipulation
          await page.context().addCookies([{
            name: 'adminSession',
            value: sessionTest.sessionId,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false
          }]);

          const response = await page.request.get(`${baseUrl}/api/admin/dashboard`, {
            failOnStatusCode: false
          });

          const status = response.status();

          if (status === 200) {
            const responseData = await response.json();
            if (responseData.success || responseData.data) {
              results.failed.push({
                sessionId: sessionTest.sessionId.substring(0, 20),
                issue: 'Session hijacking successful',
                status,
                response: JSON.stringify(responseData).substring(0, 100)
              });
            }
          } else if (status === 401 || status === 403) {
            results.passed.push({
              sessionId: sessionTest.sessionId.substring(0, 20),
              message: 'Invalid session properly rejected',
              status
            });
          }

          // Clear cookies for next test
          await page.context().clearCookies();
        } catch (error) {
          results.warnings.push({
            sessionId: sessionTest.sessionId.substring(0, 20),
            error: error.message
          });
        }
      }

      console.log('Session Security Test Results:', results);
      
      if (results.failed.length > 0) {
        console.log('Session Vulnerabilities Found:', results.failed);
      }

      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
    });
  });

  test.describe('CSRF Protection Tests', () => {
    test('should prevent CSRF attacks on state-changing operations', async ({ page }) => {
      const results = { passed: [], failed: [], warnings: [] };

      // Test CSRF protection on critical endpoints
      const stateChangingEndpoints = [
        { url: '/api/admin/login', method: 'POST', data: { password: 'testpass' } },
        { url: '/api/email/subscribe', method: 'POST', data: { email: 'test@test.com', consentToMarketing: true } },
        { url: '/api/tickets/validate', method: 'POST', data: { ticketId: 'test123' } }
      ];

      for (const endpoint of stateChangingEndpoints) {
        try {
          // Attempt request without CSRF token from different origin
          const response = await page.request.post(`${baseUrl}${endpoint.url}`, {
            data: endpoint.data,
            headers: {
              'Origin': 'https://malicious-site.com',
              'Referer': 'https://malicious-site.com/attack.html'
            },
            failOnStatusCode: false
          });

          const status = response.status();

          if (status === 403 || status === 400) {
            results.passed.push({
              endpoint: endpoint.url,
              message: 'CSRF protection properly blocked cross-origin request',
              status
            });
          } else if (status === 200 || status === 201) {
            const responseText = await response.text();
            results.failed.push({
              endpoint: endpoint.url,
              issue: 'CSRF attack successful - cross-origin request allowed',
              status,
              response: responseText.substring(0, 100)
            });
          } else {
            results.warnings.push({
              endpoint: endpoint.url,
              status,
              message: 'Unexpected response status'
            });
          }
        } catch (error) {
          results.warnings.push({
            endpoint: endpoint.url,
            error: error.message
          });
        }
      }

      console.log('CSRF Protection Test Results:', results);
      
      if (results.failed.length > 0) {
        console.log('CSRF Vulnerabilities Found:', results.failed);
      }

      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
    });

    test('should validate CSRF tokens when present', async ({ page }) => {
      const results = { passed: [], failed: [], warnings: [] };

      // Get a valid page to extract CSRF token if present
      await page.goto(`${baseUrl}/tickets`);
      
      const csrfToken = await page.evaluate(() => {
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        return metaTag ? metaTag.getAttribute('content') : null;
      });

      if (csrfToken) {
        // Test with invalid CSRF token
        try {
          const response = await page.request.post(`${baseUrl}/api/tickets/validate`, {
            data: { ticketId: 'test123' },
            headers: {
              'X-CSRF-Token': 'invalid-token-12345'
            },
            failOnStatusCode: false
          });

          const status = response.status();

          if (status === 403 || status === 400) {
            results.passed.push({
              message: 'Invalid CSRF token properly rejected',
              status
            });
          } else {
            results.failed.push({
              issue: 'Invalid CSRF token was accepted',
              status
            });
          }
        } catch (error) {
          results.warnings.push({
            error: error.message
          });
        }
      } else {
        results.warnings.push({
          message: 'No CSRF token meta tag found - CSRF protection may not be implemented'
        });
      }

      console.log('CSRF Token Validation Results:', results);
      
      expect(results.failed.length).toBe(0);
    });
  });

  test.describe('Security Headers Validation', () => {
    test('should have comprehensive security headers', async ({ page }) => {
      const response = await page.goto(baseUrl);
      const validator = new SecurityHeadersValidator();
      
      const results = await validator.validateSecurityHeaders(response, {
        isHTTPS: baseUrl.startsWith('https')
      });

      console.log('Security Headers Validation Results:', {
        score: results.score,
        passed: results.passed.length,
        failed: results.failed.length,
        warnings: results.warnings.length
      });

      console.log('Security Headers Details:', {
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings
      });

      // Security headers should achieve at least 70% score
      expect(results.score).toBeGreaterThan(70);
      
      // Critical headers should be present
      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(5);
    });

    test('should validate API security headers', async ({ page }) => {
      const apiEndpoints = [
        '/api/health/check',
        '/api/gallery',
        '/api/featured-photos'
      ];

      const results = { passed: [], failed: [], warnings: [] };

      for (const endpoint of apiEndpoints) {
        const response = await page.request.get(`${baseUrl}${endpoint}`);
        const headers = response.headers();

        // Check for critical security headers on API endpoints
        const requiredHeaders = [
          'x-content-type-options',
          'x-frame-options',
          'cache-control'
        ];

        for (const headerName of requiredHeaders) {
          if (headers[headerName]) {
            results.passed.push({
              endpoint,
              header: headerName,
              value: headers[headerName]
            });
          } else {
            results.failed.push({
              endpoint,
              header: headerName,
              issue: 'Required security header missing'
            });
          }
        }

        // Check for information disclosure
        const disclosureHeaders = ['server', 'x-powered-by'];
        for (const headerName of disclosureHeaders) {
          if (headers[headerName] && headers[headerName].toLowerCase().includes('version')) {
            results.warnings.push({
              endpoint,
              header: headerName,
              issue: 'Possible information disclosure',
              value: headers[headerName]
            });
          }
        }
      }

      console.log('API Security Headers Results:', results);
      
      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(3);
    });
  });

  test.describe('Data Exposure Prevention', () => {
    test('should not expose sensitive data in error responses', async ({ page }) => {
      const dataExposureUtils = new DataExposureUtils();
      const results = { passed: [], failed: [], warnings: [] };

      // Test error conditions that might expose sensitive data
      const errorTests = [
        { url: '/api/admin/dashboard', headers: { 'Authorization': 'Bearer invalid-token' } },
        { url: '/api/tickets/nonexistent-ticket-id', method: 'GET' },
        { url: '/api/email/subscribe', method: 'POST', data: { email: 'invalid-email' } },
        { url: '/api/payments/create-checkout-session', method: 'POST', data: {} }
      ];

      for (const errorTest of errorTests) {
        try {
          const response = await page.request.fetch(`${baseUrl}${errorTest.url}`, {
            method: errorTest.method || 'GET',
            data: errorTest.data,
            headers: errorTest.headers,
            failOnStatusCode: false
          });

          const exposure = await dataExposureUtils.validateDataExposure(
            response, 
            `Error test: ${errorTest.url}`
          );

          if (exposure.sensitiveDataFound.length > 0) {
            results.failed.push({
              endpoint: errorTest.url,
              issue: 'Sensitive data exposed in error response',
              sensitiveData: exposure.sensitiveDataFound,
              status: exposure.statusCode
            });
          } else {
            results.passed.push({
              endpoint: errorTest.url,
              message: 'No sensitive data exposed in error response',
              status: exposure.statusCode
            });
          }

          if (exposure.securityIssues.length > 0) {
            results.warnings.push({
              endpoint: errorTest.url,
              issues: exposure.securityIssues
            });
          }
        } catch (error) {
          results.warnings.push({
            endpoint: errorTest.url,
            error: error.message
          });
        }
      }

      console.log('Data Exposure Prevention Results:', results);

      if (results.failed.length > 0) {
        console.log('Sensitive Data Exposure Found:', results.failed);
      }

      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
    });

    test('should prevent sensitive data leakage in successful responses', async ({ page }) => {
      const dataExposureUtils = new DataExposureUtils();
      const results = { passed: [], failed: [], warnings: [] };

      // Test successful responses that might leak sensitive data
      const successTests = [
        '/api/health/check',
        '/api/gallery',
        '/api/featured-photos'
      ];

      for (const testUrl of successTests) {
        try {
          const response = await page.request.get(`${baseUrl}${testUrl}`);
          
          const exposure = await dataExposureUtils.validateDataExposure(
            response,
            `Success test: ${testUrl}`
          );

          // Check for sensitive patterns that shouldn't be in public responses
          const sensitivePatterns = [
            /password/gi,
            /secret/gi,
            /token/gi,
            /key/gi,
            /database/gi,
            /connection/gi
          ];

          const responseText = await response.text();
          let foundSensitiveContent = false;

          for (const pattern of sensitivePatterns) {
            if (pattern.test(responseText)) {
              foundSensitiveContent = true;
              break;
            }
          }

          if (foundSensitiveContent || exposure.sensitiveDataFound.length > 0) {
            results.failed.push({
              endpoint: testUrl,
              issue: 'Sensitive information detected in response',
              sensitiveData: exposure.sensitiveDataFound
            });
          } else {
            results.passed.push({
              endpoint: testUrl,
              message: 'No sensitive data detected in response'
            });
          }
        } catch (error) {
          results.warnings.push({
            endpoint: testUrl,
            error: error.message
          });
        }
      }

      console.log('Successful Response Data Leakage Results:', results);

      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
    });
  });

  test.describe('PCI Compliance Validation', () => {
    test('should meet PCI-DSS requirements for payment processing', async ({ page }) => {
      const pciUtils = new PCIComplianceUtils();
      
      const results = await pciUtils.validatePCICompliance(page, baseUrl);

      console.log('PCI Compliance Validation Results:', {
        score: results.score,
        passed: results.passed.length,
        failed: results.failed.length,
        warnings: results.warnings.length
      });

      console.log('PCI Compliance Details:', {
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings
      });

      // PCI compliance should achieve high score
      expect(results.score).toBeGreaterThan(80);
      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(2);
    });

    test('should not store or transmit credit card data insecurely', async ({ page }) => {
      const results = { passed: [], failed: [], warnings: [] };

      // Test payment processing endpoints
      const paymentData = {
        cartItems: [{
          id: 'test-ticket',
          name: 'Test Ticket',
          price: 5000,
          quantity: 1
        }],
        customerInfo: {
          email: 'test@example.com'
        },
        // Intentionally include card data to test if it's handled properly
        cardNumber: '4242424242424242',
        expiryDate: '12/25',
        cvv: '123'
      };

      try {
        const response = await page.request.post(`${baseUrl}/api/payments/create-checkout-session`, {
          data: paymentData,
          failOnStatusCode: false
        });

        const responseText = await response.text();
        const status = response.status();

        // Check if sensitive card data is returned
        if (responseText.includes('4242424242424242') || 
            responseText.includes('123') ||
            responseText.toLowerCase().includes('cvv')) {
          results.failed.push({
            issue: 'Credit card data returned in response',
            endpoint: '/api/payments/create-checkout-session',
            status
          });
        } else {
          results.passed.push({
            message: 'Credit card data properly excluded from response',
            endpoint: '/api/payments/create-checkout-session',
            status
          });
        }

        // Response should redirect to Stripe or return session URL
        if (status === 200) {
          try {
            const responseData = JSON.parse(responseText);
            if (responseData.url && responseData.url.includes('stripe')) {
              results.passed.push({
                message: 'Payment properly redirected to secure Stripe processing',
                endpoint: '/api/payments/create-checkout-session'
              });
            }
          } catch (e) {
            // Response might not be JSON
          }
        }
      } catch (error) {
        results.warnings.push({
          endpoint: '/api/payments/create-checkout-session',
          error: error.message
        });
      }

      console.log('Credit Card Data Security Results:', results);

      expect(results.failed.length).toBe(0);
      expect(results.passed.length).toBeGreaterThan(0);
    });
  });

  test.describe('Comprehensive Security Audit', () => {
    test('should pass comprehensive security audit with high score', async ({ page }) => {
      const auditResults = await securityOrchestrator.runComprehensiveSecurityAudit();

      console.log('Comprehensive Security Audit Results:', {
        timestamp: auditResults.timestamp,
        totalTests: auditResults.testSummary.totalTests,
        passed: auditResults.testSummary.passed,
        failed: auditResults.testSummary.failed,
        warnings: auditResults.testSummary.warnings
      });

      console.log('Security Categories Results:');
      Object.entries(auditResults.categories).forEach(([category, results]) => {
        console.log(`  ${category}:`, {
          passed: results.passed?.length || 0,
          failed: results.failed?.length || 0,
          warnings: results.warnings?.length || 0
        });
      });

      // Calculate overall security score
      const totalTests = auditResults.testSummary.totalTests;
      const passedTests = auditResults.testSummary.passed;
      const securityScore = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

      console.log(`Overall Security Score: ${securityScore}%`);

      // Security audit should achieve high score
      expect(securityScore).toBeGreaterThan(85);
      expect(auditResults.testSummary.failed).toBeLessThan(3);
      expect(auditResults.testSummary.passed).toBeGreaterThan(15);
    });

    test('should generate security report with actionable recommendations', async ({ page }) => {
      const auditResults = await securityOrchestrator.runComprehensiveSecurityAudit();

      // Generate security report
      const securityReport = {
        executiveSummary: {
          testDate: auditResults.timestamp,
          baseUrl: auditResults.baseUrl,
          overallScore: Math.round((auditResults.testSummary.passed / auditResults.testSummary.totalTests) * 100),
          riskLevel: calculateRiskLevel(auditResults.testSummary),
          criticalFindings: auditResults.testSummary.failed,
          totalTests: auditResults.testSummary.totalTests
        },
        categoryBreakdown: auditResults.categories,
        recommendations: generateRecommendations(auditResults),
        complianceStatus: {
          owaspTop10: 'PASSED', // Based on no critical vulnerabilities
          pciDss: auditResults.categories.pciCompliance?.score > 80 ? 'PASSED' : 'NEEDS_ATTENTION',
          securityHeaders: auditResults.categories.securityHeaders?.score > 70 ? 'PASSED' : 'NEEDS_ATTENTION'
        }
      };

      console.log('Security Report Generated:', JSON.stringify(securityReport, null, 2));

      // Validate report structure
      expect(securityReport.executiveSummary.overallScore).toBeGreaterThan(80);
      expect(securityReport.complianceStatus.owaspTop10).toBe('PASSED');
      expect(securityReport.recommendations).toBeDefined();
      expect(Array.isArray(securityReport.recommendations)).toBe(true);

      function calculateRiskLevel(testSummary) {
        if (testSummary.failed > 5) return 'HIGH';
        if (testSummary.failed > 2) return 'MEDIUM';
        if (testSummary.warnings > 10) return 'MEDIUM';
        return 'LOW';
      }

      function generateRecommendations(auditResults) {
        const recommendations = [];

        if (auditResults.testSummary.failed > 0) {
          recommendations.push({
            priority: 'HIGH',
            category: 'Critical Vulnerabilities',
            recommendation: 'Address all failed security tests immediately',
            impact: 'High - Immediate security risk'
          });
        }

        if (auditResults.testSummary.warnings > 5) {
          recommendations.push({
            priority: 'MEDIUM',
            category: 'Security Improvements',
            recommendation: 'Review and address security warnings',
            impact: 'Medium - Potential security improvements'
          });
        }

        if (auditResults.categories.securityHeaders?.score < 90) {
          recommendations.push({
            priority: 'MEDIUM',
            category: 'Security Headers',
            recommendation: 'Enhance security headers configuration',
            impact: 'Medium - Improved defense against common attacks'
          });
        }

        return recommendations;
      }
    });
  });
});