/**
 * CSP Violation Reporting Endpoint
 * Collects and logs Content Security Policy violations
 * Part of SPEC_04 Task 4.4 security implementation
 */

import { withErrorHandling } from '../../middleware/error-handler.js';
import { addAPISecurityHeaders } from '../lib/security-headers.js';

/**
 * CSP violation severity classification
 */
const VIOLATION_SEVERITY = {
  'script-src': 'high',
  'object-src': 'high',
  'base-uri': 'high',
  'frame-src': 'medium',
  'img-src': 'low',
  'style-src': 'medium',
  'font-src': 'low',
  'connect-src': 'medium',
  'media-src': 'low',
  'worker-src': 'medium'
};

/**
 * Known false positives to filter out
 */
const FALSE_POSITIVES = [
  // Browser extensions
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'ms-browser-extension://',
  
  // Common browser injected scripts
  'about:blank',
  'data:text/html,chromewebdata',
  'webpack-internal://',
  
  // Analytics/tracking scripts (if not whitelisted)
  'googletagmanager.com',
  'google-analytics.com',
  
  // Development tools
  'localhost',
  'vscode-webview://',
  'devtools://'
];

/**
 * Validate and sanitize CSP report
 */
function validateCSPReport(report) {
  if (!report || typeof report !== 'object') {
    return null;
  }

  const {
    'document-uri': documentUri,
    'referrer': referrer,
    'blocked-uri': blockedUri,
    'violated-directive': violatedDirective,
    'effective-directive': effectiveDirective,
    'original-policy': originalPolicy,
    'disposition': disposition,
    'status-code': statusCode,
    'script-sample': scriptSample
  } = report;

  // Validate required fields
  if (!documentUri || !violatedDirective || !blockedUri) {
    return null;
  }

  return {
    documentUri: String(documentUri).slice(0, 200), // Limit length
    referrer: referrer ? String(referrer).slice(0, 200) : '',
    blockedUri: String(blockedUri).slice(0, 200),
    violatedDirective: String(violatedDirective).slice(0, 100),
    effectiveDirective: effectiveDirective ? String(effectiveDirective).slice(0, 100) : '',
    originalPolicy: originalPolicy ? String(originalPolicy).slice(0, 500) : '',
    disposition: disposition || 'enforce',
    statusCode: statusCode || 200,
    scriptSample: scriptSample ? String(scriptSample).slice(0, 100) : '',
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if violation is a known false positive
 */
function isFalsePositive(report) {
  const { blockedUri, documentUri } = report;
  
  return FALSE_POSITIVES.some(pattern => 
    blockedUri.includes(pattern) || 
    documentUri.includes(pattern)
  );
}

/**
 * Classify violation severity
 */
function classifyViolation(report) {
  const directive = report.effectiveDirective || report.violatedDirective;
  const baseDirective = directive.split(' ')[0]; // Get base directive without keywords
  
  return VIOLATION_SEVERITY[baseDirective] || 'medium';
}

/**
 * Format violation for logging
 */
function formatViolationLog(report, metadata) {
  const severity = classifyViolation(report);
  
  return {
    level: severity,
    message: `CSP Violation: ${report.violatedDirective}`,
    details: {
      ...report,
      severity,
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      requestId: metadata.requestId
    },
    tags: {
      security: true,
      csp: true,
      severity
    }
  };
}

/**
 * Store violation in database/logging system
 */
async function storeViolation(report, metadata) {
  const violation = {
    id: `csp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...report,
    severity: classifyViolation(report),
    userAgent: metadata.userAgent,
    ip: metadata.ip,
    requestId: metadata.requestId,
    createdAt: new Date().toISOString()
  };

  // Log to console (in production, this would go to your logging service)
  const logData = formatViolationLog(report, metadata);
  
  if (logData.level === 'high') {
    console.error('High-severity CSP violation:', logData);
  } else if (logData.level === 'medium') {
    console.warn('Medium-severity CSP violation:', logData);
  } else {
    console.log('Low-severity CSP violation:', logData);
  }

  // In production, you might want to:
  // 1. Store in database for analysis
  // 2. Send to monitoring service (Sentry, DataDog, etc.)
  // 3. Trigger alerts for high-severity violations
  
  return violation;
}

/**
 * CSP Report Handler
 */
async function handleCSPReport(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({
      error: {
        type: 'MethodNotAllowed',
        message: 'Only POST method allowed'
      }
    });
    return;
  }

  // Add security headers
  addAPISecurityHeaders(res, {
    maxAge: 0, // No caching for security endpoints
    corsOrigins: [] // No CORS for security reports
  });

  try {
    // Parse JSON body
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    await new Promise((resolve, reject) => {
      req.on('end', () => resolve());
      req.on('error', reject);
    });

    const reportData = JSON.parse(body || '{}');
    const cspReport = reportData['csp-report'] || reportData;

    // Validate report
    const validatedReport = validateCSPReport(cspReport);
    if (!validatedReport) {
      res.status(400).json({
        error: {
          type: 'ValidationError',
          message: 'Invalid CSP report format'
        }
      });
      return;
    }

    // Check for false positives
    if (isFalsePositive(validatedReport)) {
      // Acknowledge but don't log false positives
      res.status(204).end();
      return;
    }

    // Extract metadata
    const metadata = {
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.headers['x-forwarded-for'] || 
          req.headers['x-real-ip'] || 
          req.connection?.remoteAddress || 
          'Unknown',
      requestId: req.headers['x-request-id'] || `csp_${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    // Store the violation
    const storedViolation = await storeViolation(validatedReport, metadata);

    // For high-severity violations, you might want to trigger immediate alerts
    if (classifyViolation(validatedReport) === 'high') {
      console.error('HIGH SEVERITY CSP VIOLATION - Immediate attention required:', {
        violationId: storedViolation.id,
        directive: validatedReport.violatedDirective,
        blockedUri: validatedReport.blockedUri,
        documentUri: validatedReport.documentUri,
        ip: metadata.ip
      });
    }

    // Return 204 No Content (standard for CSP reports)
    res.status(204).end();

  } catch (error) {
    console.error('Error processing CSP report:', error);
    
    // Don't reveal internal errors to potential attackers
    res.status(400).json({
      error: {
        type: 'ProcessingError',
        message: 'Failed to process report'
      }
    });
  }
}

/**
 * CSP Report Statistics (Admin endpoint)
 */
async function getCSPStats(req, res) {
  // This would typically query your database for violation statistics
  // For now, return a placeholder response
  
  res.json({
    stats: {
      totalViolations: 0,
      severityBreakdown: {
        high: 0,
        medium: 0,
        low: 0
      },
      topViolatedDirectives: [],
      recentViolations: []
    },
    message: 'CSP reporting endpoint is active'
  });
}

/**
 * Main export with routing logic
 */
export default withErrorHandling(async (req, res) => {
  const { method } = req;
  
  if (method === 'POST') {
    // Handle CSP violation reports
    return handleCSPReport(req, res);
  } else if (method === 'GET') {
    // Return CSP stats (for admin/monitoring)
    return getCSPStats(req, res);
  } else {
    res.status(405).json({
      error: {
        type: 'MethodNotAllowed',
        message: 'Method not allowed'
      }
    });
  }
});