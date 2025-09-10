import authService from '../../lib/auth-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import { withSecurityHeaders } from '../../lib/security-headers.js';
import {
  verifyMfaCode,
  markSessionMfaVerified
} from '../../lib/mfa-middleware.js';

/**
 * Input validation schemas
 */
const INPUT_VALIDATION = {
  username: {
    minLength: 1,
    maxLength: 50,
    required: true
  },
  password: {
    minLength: 1,
    maxLength: 200,
    required: true
  },
  mfaCode: {
    minLength: 6,
    maxLength: 10,
    pattern: /^[0-9A-Za-z]+$/,
    required: false
  },
  step: {
    allowedValues: ['mfa'],
    required: false
  }
};

/**
 * Enhanced input validation with security checks
 * @param {Object} input - Input to validate
 * @param {string} field - Field name
 * @returns {Object} Validation result
 */
function validateInput(input, field) {
  const rules = INPUT_VALIDATION[field];
  if (!rules) {
    return { isValid: false, error: 'Unknown field' };
  }

  // Check required fields
  if (rules.required && (!input || input === '')) {
    return { isValid: false, error: `${field} is required` };
  }

  // Skip further validation if field is not required and empty
  if (!rules.required && (!input || input === '')) {
    return { isValid: true };
  }

  // Type validation
  if (typeof input !== 'string') {
    return { isValid: false, error: `${field} must be a string` };
  }

  // Length validation
  if (rules.minLength && input.length < rules.minLength) {
    return { isValid: false, error: `${field} too short` };
  }

  if (rules.maxLength && input.length > rules.maxLength) {
    return { isValid: false, error: `${field} too long` };
  }

  // Pattern validation
  if (rules.pattern && !rules.pattern.test(input)) {
    return { isValid: false, error: `${field} format invalid` };
  }

  // Allowed values validation
  if (rules.allowedValues && !rules.allowedValues.includes(input)) {
    return { isValid: false, error: `${field} value not allowed` };
  }

  return { isValid: true };
}

/**
 * Get client IP address from request
 * @param {Object} req - Request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  // Vercel provides the client IP in x-forwarded-for
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  // Fallback to x-real-ip
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }
  
  // Fallback to connection remote address
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  
  return 'unknown';
}

/**
 * Simple rate limiting without external dependencies
 * Uses in-memory storage (resets on each function invocation)
 */
const rateLimitMap = new Map();

function checkRateLimit(clientIP) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 5; // Max login attempts per minute
  
  // Skip rate limiting in test environments
  if (process.env.NODE_ENV === 'test' || process.env.VERCEL_ENV === 'preview') {
    return { allowed: true };
  }
  
  const key = `login:${clientIP}`;
  const record = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    // Reset the window
    record.count = 1;
    record.resetTime = now + windowMs;
    rateLimitMap.set(key, record);
    return { allowed: true };
  }
  
  record.count++;
  rateLimitMap.set(key, record);
  
  if (record.count > maxRequests) {
    return { 
      allowed: false, 
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    };
  }
  
  return { allowed: true };
}

/**
 * Verify admin username
 * @param {string} username - Username to verify
 * @returns {boolean} True if username is valid
 */
function verifyUsername(username) {
  // Hardcoded username for admin - always 'admin'
  const expectedUsername = 'admin';

  if (!username || typeof username !== 'string') {
    return false;
  }

  // Simple string comparison - case sensitive for security
  return username === expectedUsername;
}

async function loginHandler(req, res) {
  if (req.method === 'POST') {
    const { username, password, mfaCode, step } = req.body || {};
    const clientIP = getClientIP(req);

    // Enhanced IP validation
    if (!clientIP || clientIP === 'unknown') {
      return res.status(400).json({ error: 'Unable to identify client' });
    }

    // Enhanced input validation
    if (step === 'mfa' || mfaCode) {
      const mfaValidation = validateInput(mfaCode, 'mfaCode');
      if (!mfaValidation.isValid) {
        return res.status(400).json({ error: mfaValidation.error });
      }
    } else {
      // Validate username
      const usernameValidation = validateInput(username, 'username');
      if (!usernameValidation.isValid) {
        return res.status(400).json({ error: usernameValidation.error });
      }

      // Validate password
      const passwordValidation = validateInput(password, 'password');
      if (!passwordValidation.isValid) {
        return res.status(400).json({ error: passwordValidation.error });
      }
    }

    if (step) {
      const stepValidation = validateInput(step, 'step');
      if (!stepValidation.isValid) {
        return res.status(400).json({ error: stepValidation.error });
      }
    }

    // Check rate limiting
    const rateLimitResult = checkRateLimit(clientIP);
    if (!rateLimitResult.allowed) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter.toString());
      return res.status(429).json({
        error: 'Too many login attempts',
        retryAfter: rateLimitResult.retryAfter
      });
    }

    try {
      // Handle MFA verification step
      if (step === 'mfa' && mfaCode) {
        const mfaResult = await verifyMfaCode(req, res, mfaCode);
        if (!mfaResult.success) {
          return res.status(401).json({ error: mfaResult.error });
        }

        // Mark session as MFA verified
        await markSessionMfaVerified(req, res);

        return res.status(200).json({
          success: true,
          message: 'MFA verification successful'
        });
      }

      // Regular username/password login
      if (!verifyUsername(username)) {
        // Log failed attempt
        await logLoginAttempt(clientIP, username, false, 'Invalid username');
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await authService.verifyPassword(password);
      if (!isValidPassword) {
        // Log failed attempt
        await logLoginAttempt(clientIP, username, false, 'Invalid password');
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if MFA is enabled for this account
      const mfaStatus = await checkMfaStatus();
      if (mfaStatus.isEnabled) {
        // Generate and send MFA code
        const mfaCode = await generateMfaCode();
        // In a real app, send this code via email/SMS
        console.log('MFA code generated:', mfaCode);

        return res.status(200).json({
          success: true,
          requiresMfa: true,
          message: 'Please enter your MFA code'
        });
      }

      // Create session
      const token = authService.createSession({ username });
      authService.setAuthCookie(res, token);

      // Log successful attempt
      await logLoginAttempt(clientIP, username, true);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token: token
      });
    } catch (error) {
      console.error('Login error:', error);
      
      // Don't expose internal errors to the client
      res.status(500).json({
        error: 'An error occurred during login'
      });
    }
  } else if (req.method === 'DELETE') {
    // Logout
    authService.clearAuthCookie(res);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } else {
    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Log login attempt for audit purposes
 * @param {string} clientIP - Client IP address
 * @param {string} username - Username attempted
 * @param {boolean} success - Whether login was successful
 * @param {string} reason - Reason for failure (if applicable)
 */
async function logLoginAttempt(clientIP, username, success, reason = null) {
  try {
    const db = await getDatabaseClient();
    await db.execute(
      `INSERT INTO admin_login_attempts 
       (ip_address, username, success, failure_reason, attempted_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [clientIP, username, success ? 1 : 0, reason, new Date().toISOString()]
    );
  } catch (error) {
    // Log error but don't fail the login process
    console.error('Failed to log login attempt:', error);
  }
}

/**
 * Check if MFA is enabled for the admin account
 * @returns {Object} MFA status
 */
async function checkMfaStatus() {
  // For now, MFA is disabled by default
  // In production, this would check the database
  return { isEnabled: false };
}

/**
 * Generate MFA code
 * @returns {string} MFA code
 */
async function generateMfaCode() {
  // Generate a random 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default withSecurityHeaders(loginHandler);