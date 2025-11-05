/**
 * Volunteer Application Submission API Endpoint
 * Handles volunteer form submissions and sends acknowledgement emails
 */

import { getBrevoService } from "../../lib/brevo-service.js";
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { generateVolunteerAcknowledgementEmail } from '../../lib/email-templates/volunteer-acknowledgement.js';

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

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize input data
 */
function sanitizeInput(data) {
  const sanitized = {};

  if (data.firstName) {
    sanitized.firstName = data.firstName.trim().slice(0, 100);
  }

  if (data.lastName) {
    sanitized.lastName = data.lastName.trim().slice(0, 100);
  }

  if (data.email) {
    sanitized.email = data.email.toLowerCase().trim();
  }

  if (data.phone) {
    sanitized.phone = data.phone.trim().slice(0, 50);
  }

  if (data.message) {
    sanitized.message = data.message.trim().slice(0, 1000);
  }

  // Sanitize arrays
  if (Array.isArray(data.areasOfInterest)) {
    sanitized.areasOfInterest = data.areasOfInterest
      .map(area => area.trim())
      .filter(area => area.length > 0)
      .slice(0, 10); // Max 10 areas
  } else {
    sanitized.areasOfInterest = [];
  }

  if (Array.isArray(data.availability)) {
    sanitized.availability = data.availability
      .map(day => day.trim())
      .filter(day => day.length > 0)
      .slice(0, 10); // Max 10 days
  } else {
    sanitized.availability = [];
  }

  return sanitized;
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

    // Sanitize input
    const sanitized = sanitizeInput(req.body);

    // Validate required fields
    if (!sanitized.firstName) {
      return res.status(400).json({
        error: 'First name is required'
      });
    }

    if (!sanitized.lastName) {
      return res.status(400).json({
        error: 'Last name is required'
      });
    }

    if (!sanitized.email) {
      return res.status(400).json({
        error: 'Email address is required'
      });
    }

    if (!isValidEmail(sanitized.email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address'
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

      <p><strong>Name:</strong> ${sanitized.firstName} ${sanitized.lastName}</p>
      <p><strong>Email:</strong> ${sanitized.email}</p>
      <p><strong>Phone:</strong> ${sanitized.phone || 'Not provided'}</p>

      <p><strong>Areas of Interest:</strong><br>${formatAreasOfInterest(sanitized.areasOfInterest)}</p>

      <p><strong>Availability:</strong><br>${formatAvailability(sanitized.availability)}</p>

      ${sanitized.message ? `<p><strong>Why They Want to Volunteer:</strong><br>${sanitized.message.replace(/\n/g, '<br>')}</p>` : ''}

      <hr>
      <p style="font-size: 12px; color: #666;">
        Submitted from: ${getClientIp(req)}<br>
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
      subject: `New Volunteer Application - ${sanitized.firstName} ${sanitized.lastName}`,
      htmlContent: teamEmailBody,
      headers: {
        'X-Mailin-Tag': 'volunteer-notification',
        'X-Mailin-Custom': JSON.stringify({
          type: 'volunteer_notification',
          applicantEmail: sanitized.email
        })
      }
    };

    // Send both emails
    try {
      await Promise.all([
        brevoService.sendTransactionalEmail(volunteerEmailParams),
        brevoService.sendTransactionalEmail(teamEmailParams)
      ]);
    } catch (emailError) {
      console.error('Error sending emails:', emailError);

      // Still return success to user if the application was received
      // but log the email failure
      return res.status(201).json({
        success: true,
        message: 'Application received, but there was an issue sending confirmation emails. We have your information and will contact you soon.',
        warning: 'Email delivery issue'
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
      email: req.body?.email,
      ip: getClientIp(req),
      timestamp: new Date().toISOString()
    });

    // Generic error response
    return res.status(500).json({
      error: 'An error occurred while processing your application. Please try again or email us directly at alocubanoboulderfest@gmail.com'
    });
  }
}
