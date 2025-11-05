/**
 * Volunteer Application Submission API Endpoint
 * Handles volunteer form submissions and sends acknowledgement emails
 */

import { getBrevoService } from "../../lib/brevo-service.js";
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { generateVolunteerAcknowledgementEmail } from '../../lib/email-templates/volunteer-acknowledgement.js';
import { validateVolunteerSubmission } from '../../lib/validators/form-validators.js';

// Rate limiting storage (in production, use Redis or similar)
const rateLimitMap = new Map();

/**
 * Rate limiting middleware
 */
function rateLimit(req, res) {
  const ip =
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    '127.0.0.1';
  const limit = 20; // 20 requests per window
  const windowMs = 15 * 60 * 1000; // 15 minutes

  const key = `volunteer_${ip}`;
  const now = Date.now();

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 0, resetTime: now + windowMs });
  }

  const rateData = rateLimitMap.get(key);

  if (now > rateData.resetTime) {
    rateData.count = 0;
    rateData.resetTime = now + windowMs;
  }

  if (rateData.count >= limit) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000)
    });
  }

  rateData.count++;
  return null;
}

// Validation functions removed - now using centralized validators from lib/validators/form-validators.js

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Get client IP address
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Mask email for logging (PII protection)
 * @param {string} email - Email address
 * @returns {string} Masked email (e.g., "ab***@domain.com")
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[invalid-email]';
  const parts = email.split('@');
  const user = parts[0];
  const domain = parts[1] || '';
  if (!user || !domain) return '[malformed-email]';
  return user.slice(0, 2) + '***@' + domain;
}

/**
 * Format areas of interest for email
 */
function formatAreasOfInterest(areas) {
  if (!areas || areas.length === 0) return 'None specified';

  const areaLabels = {
    'setup': 'Event Setup/Breakdown',
    'registration': 'Registration Desk',
    'artist': 'Artist Support',
    'merchandise': 'Merchandise Sales',
    'info': 'Information Booth',
    'social': 'Social Media Team'
  };

  return areas.map(area => areaLabels[area] || area).join(', ');
}

/**
 * Format availability for email
 */
function formatAvailability(days) {
  if (!days || days.length === 0) return 'None specified';

  const dayLabels = {
    'friday': 'Friday, May 15',
    'saturday': 'Saturday, May 16',
    'sunday': 'Sunday, May 17'
  };

  return days.map(day => dayLabels[day] || day).join(', ');
}

/**
 * Main handler function
 */
export default async function handler(req, res) {
  // Set secure CORS headers
  setSecureCorsHeaders(req, res, {
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With']
  });

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    // Rate limiting
    const rateLimitResponse = rateLimit(req, res);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body'
      });
    }

    // Comprehensive validation using centralized validator
    // Includes: spam detection, SQL injection prevention, disposable email blocking, MX verification
    const validation = await validateVolunteerSubmission(req.body, {
      verifyMX: true  // Enable MX record verification for email validation
    });

    if (!validation.valid) {
      // Return first error for simplicity (frontend shows one error at a time)
      const firstError = validation.errors[0];
      return res.status(400).json({
        error: firstError.message,
        field: firstError.field,
        allErrors: validation.errors  // Include all errors for debugging
      });
    }

    const sanitized = validation.sanitized;

    // Log any warnings (e.g., email typo suggestions)
    if (validation.warnings && validation.warnings.length > 0) {
      console.log('Volunteer submission warnings:', {
        email: maskEmail(sanitized.email),
        warnings: validation.warnings.map(w => w.message)
      });
    }

    // Check if we're in a preview deployment
    const isPreviewDeployment = req.headers.host?.includes('vercel.app') ||
                                req.headers['x-vercel-deployment-url']?.includes('vercel.app');

    // For preview deployments without Brevo configured, return mock success
    if (isPreviewDeployment && !process.env.BREVO_API_KEY) {
      console.log('📧 Preview deployment detected without Brevo API key - returning mock success');
      return res.status(201).json({
        success: true,
        message: 'Preview mode: Application submitted successfully! In production, you would receive a confirmation email.'
      });
    }

    // Initialize Brevo service
    let brevoService;
    try {
      brevoService = await getBrevoService();
    } catch (initError) {
      console.error('Failed to initialize Brevo service:', initError);

      // For preview deployments, return a simulated success
      if (isPreviewDeployment) {
        return res.status(201).json({
          success: true,
          message: 'Preview mode: Application submitted! (Email service not available)'
        });
      }

      // For production, return service unavailable
      return res.status(503).json({
        error: 'Email service is temporarily unavailable. Please try again later.'
      });
    }

    // Generate acknowledgement email HTML
    const acknowledgementHtml = generateVolunteerAcknowledgementEmail({
      firstName: sanitized.firstName,
      lastName: sanitized.lastName,
      email: sanitized.email,
      areasOfInterest: sanitized.areasOfInterest,
      availability: sanitized.availability
    });

    // Send acknowledgement email to volunteer
    const volunteerEmailParams = {
      sender: {
        email: 'noreply@alocubanoboulderfest.org',
        name: 'A Lo Cubano Boulder Fest'
      },
      replyTo: {
        email: 'alocubanoboulderfest@gmail.com',
        name: 'A Lo Cubano Boulder Fest'
      },
      to: [{
        email: sanitized.email,
        name: `${sanitized.firstName} ${sanitized.lastName}`
      }],
      subject: 'Thank You! Your Volunteer Application - A Lo Cubano Boulder Fest 2026',
      htmlContent: acknowledgementHtml,
      headers: {
        'X-Mailin-Tag': 'volunteer-acknowledgement',
        'X-Mailin-Custom': JSON.stringify({
          type: 'volunteer_application',
          firstName: sanitized.firstName,
          lastName: sanitized.lastName
        })
      }
    };

    // Send notification email to team
    const teamEmailBody = `
      <h2>New Volunteer Application Received</h2>

      <p><strong>Name:</strong> ${escapeHtml(sanitized.firstName)} ${escapeHtml(sanitized.lastName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(sanitized.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(sanitized.phone || 'Not provided')}</p>

      <p><strong>Areas of Interest:</strong><br>${escapeHtml(formatAreasOfInterest(sanitized.areasOfInterest))}</p>

      <p><strong>Availability:</strong><br>${escapeHtml(formatAvailability(sanitized.availability))}</p>

      ${sanitized.message ? `<p><strong>Why They Want to Volunteer:</strong><br>${escapeHtml(sanitized.message).replace(/\n/g, '<br>')}</p>` : ''}

      <hr>
      <p style="font-size: 12px; color: #666;">
        Submitted from: ${escapeHtml(getClientIp(req))}<br>
        Timestamp: ${new Date().toISOString()}
      </p>
    `;

    const teamEmailParams = {
      sender: {
        email: 'noreply@alocubanoboulderfest.org',
        name: 'A Lo Cubano Boulder Fest - Volunteer System'
      },
      to: [{
        email: 'alocubanoboulderfest@gmail.com',
        name: 'A Lo Cubano Boulder Fest Team'
      }],
      subject: `New Volunteer Application - ${escapeHtml(sanitized.firstName)} ${escapeHtml(sanitized.lastName)}`,
      htmlContent: teamEmailBody,
      headers: {
        'X-Mailin-Tag': 'volunteer-notification',
        'X-Mailin-Custom': JSON.stringify({
          type: 'volunteer_notification',
          applicantEmail: sanitized.email
        })
      }
    };

    // Send both emails with proper error handling
    // Team notification is CRITICAL (ensures data isn't lost)
    // Volunteer acknowledgement is optional (nice-to-have UX)
    try {
      const [volunteerResult, teamResult] = await Promise.allSettled([
        brevoService.sendTransactionalEmail(volunteerEmailParams),
        brevoService.sendTransactionalEmail(teamEmailParams)
      ]);

      // Team notification is critical - fail if it doesn't send
      // This ensures at least the team receives the application data
      if (teamResult.status === 'rejected') {
        throw new Error('Failed to send team notification: ' + teamResult.reason.message);
      }

      // Volunteer acknowledgement failure is acceptable (log but don't fail)
      if (volunteerResult.status === 'rejected') {
        console.error('Failed to send volunteer acknowledgement:', volunteerResult.reason);
        return res.status(201).json({
          success: true,
          message: 'Application received! We will contact you soon.',
          warning: 'Confirmation email could not be sent'
        });
      }
    } catch (emailError) {
      console.error('Critical: Team notification failed:', emailError);

      // If team notification fails, the application is effectively lost (no database)
      // Return error to user so they can retry
      return res.status(500).json({
        error: 'Unable to process your application. Please try again or email us directly at alocubanoboulderfest@gmail.com'
      });
    }

    // Success response
    return res.status(201).json({
      success: true,
      message: 'Thank you! Your volunteer application has been received and a confirmation email has been sent.'
    });

  } catch (error) {
    console.error('Volunteer submission error:', {
      error: error.message,
      email: maskEmail(req.body?.email),
      ip: getClientIp(req),
      timestamp: new Date().toISOString()
    });

    // Generic error response
    return res.status(500).json({
      error: 'An error occurred while processing your application. Please try again or email us directly at alocubanoboulderfest@gmail.com'
    });
  }
}
