/**
 * Email Unsubscribe API Endpoint
 * Handles newsletter unsubscribe requests
 */

import { getEmailSubscriberService } from '../lib/email-subscriber-service.js';

// Rate limiting storage
const rateLimitMap = new Map();

/**
 * Rate limiting middleware
 */
function rateLimit(req, res) {
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1';
    const limit = parseInt(process.env.RATE_LIMIT_EMAIL_UNSUBSCRIBE) || 10;
    const windowMs = 15 * 60 * 1000; // 15 minutes
    
    const key = `unsubscribe_${ip}`;
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
 * Get client IP address
 */
function getClientIp(req) {
    return req.headers['x-forwarded-for'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           (req.connection?.socket?.remoteAddress) ||
           '127.0.0.1';
}

/**
 * Main handler function
 */
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // Rate limiting
        const rateLimitResponse = rateLimit(req, res);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }
        
        let email, token;
        
        // Handle both GET (with query params) and POST requests
        if (req.method === 'GET') {
            email = req.query.email;
            token = req.query.token;
        } else if (req.method === 'POST') {
            email = req.body?.email;
            token = req.body?.token;
        } else {
            return res.status(405).json({ 
                error: 'Method not allowed. Use GET or POST.' 
            });
        }
        
        // Validate required fields
        if (!email) {
            return res.status(400).json({
                error: 'Email address is required'
            });
        }
        
        if (!isValidEmail(email)) {
            return res.status(400).json({
                error: 'Please enter a valid email address'
            });
        }
        
        if (!token) {
            return res.status(400).json({
                error: 'Unsubscribe token is required'
            });
        }
        
        // Get service
        const emailService = getEmailSubscriberService();
        
        // Validate unsubscribe token
        const isValidToken = emailService.validateUnsubscribeToken(email, token);
        if (!isValidToken) {
            if (req.method === 'GET') {
                const html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Invalid Token - A Lo Cubano Boulder Fest</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 20px;
                                background-color: #f5f5f5;
                            }
                            .container {
                                background: white;
                                padding: 30px;
                                border-radius: 8px;
                                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                                text-align: center;
                            }
                            .error-icon {
                                font-size: 48px;
                                color: #dc3545;
                                margin-bottom: 20px;
                            }
                            h1 {
                                color: #dc3545;
                                margin-bottom: 10px;
                            }
                            .message {
                                color: #666;
                                margin-bottom: 30px;
                                line-height: 1.5;
                            }
                            .footer {
                                margin-top: 30px;
                                padding-top: 20px;
                                border-top: 1px solid #eee;
                                color: #888;
                                font-size: 14px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="error-icon">⚠️</div>
                            <h1>Invalid Unsubscribe Token</h1>
                            <div class="message">
                                <p>Invalid unsubscribe token</p>
                                <p>The unsubscribe link you used is invalid or has expired. Please contact us if you need assistance unsubscribing from our newsletter.</p>
                            </div>
                            <div class="footer">
                                <p><strong>A Lo Cubano Boulder Fest</strong><br>
                                Contact: alocubanoboulderfest@gmail.com</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `;
                
                res.setHeader('Content-Type', 'text/html');
                return res.status(400).send(html);
            }
            
            return res.status(400).json({
                error: 'Invalid unsubscribe token'
            });
        }
        
        // Unsubscribe user
        const result = await emailService.unsubscribeSubscriber(email, 'user_request');
        
        // For GET requests, return HTML page
        if (req.method === 'GET') {
            const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Unsubscribed - A Lo Cubano Boulder Fest</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 40px 20px;
                            text-align: center;
                            background: #f8f9fa;
                            color: #343a40;
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        h1 {
                            color: #cc2936;
                            margin-bottom: 20px;
                        }
                        .success-icon {
                            font-size: 48px;
                            margin-bottom: 20px;
                        }
                        .contact-info {
                            margin-top: 30px;
                            padding-top: 30px;
                            border-top: 1px solid #dee2e6;
                            font-size: 14px;
                            color: #6c757d;
                        }
                        .contact-info a {
                            color: #cc2936;
                            text-decoration: none;
                        }
                        .contact-info a:hover {
                            text-decoration: underline;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">✓</div>
                        <h1>You've Been Unsubscribed</h1>
                        <p>We've successfully removed <strong>${email}</strong> from our mailing list.</p>
                        <p>You won't receive any more marketing emails from A Lo Cubano Boulder Fest.</p>
                        <p>We're sorry to see you go, but we understand that inbox priorities change.</p>
                        
                        <div class="contact-info">
                            <p>If you unsubscribed by mistake or have any questions, please contact us at:</p>
                            <p><a href="mailto:alocubanoboulderfest@gmail.com">alocubanoboulderfest@gmail.com</a></p>
                        </div>
                    </div>
                </body>
                </html>
            `;
            
            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(html);
        }
        
        // For POST requests, return JSON
        return res.status(200).json({
            success: true,
            message: 'Successfully unsubscribed from newsletter',
            email: email
        });
        
    } catch (error) {
        console.error('Newsletter unsubscribe error:', {
            error: error.message,
            email: req.query?.email || req.body?.email,
            ip: getClientIp(req),
            timestamp: new Date().toISOString()
        });
        
        // Handle specific errors
        if (error.message.includes('not found')) {
            const message = 'Email address not found or already unsubscribed';
            
            if (req.method === 'GET') {
                const html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Already Unsubscribed - A Lo Cubano Boulder Fest</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 40px 20px;
                                text-align: center;
                                background: #f8f9fa;
                                color: #343a40;
                            }
                            .container {
                                background: white;
                                padding: 40px;
                                border-radius: 8px;
                                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            }
                            h1 {
                                color: #6c757d;
                                margin-bottom: 20px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>Already Unsubscribed</h1>
                            <p>This email address is not currently subscribed to our newsletter or has already been unsubscribed.</p>
                        </div>
                    </body>
                    </html>
                `;
                
                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(html);
            }
            
            return res.status(404).json({ error: message });
        }
        
        // Generic error response
        const errorMessage = 'An error occurred while processing your unsubscribe request. Please try again.';
        
        if (req.method === 'GET') {
            const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Error - A Lo Cubano Boulder Fest</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 40px 20px;
                            text-align: center;
                            background: #f8f9fa;
                            color: #343a40;
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        h1 {
                            color: #dc3545;
                            margin-bottom: 20px;
                        }
                        .contact-info {
                            margin-top: 30px;
                            padding-top: 30px;
                            border-top: 1px solid #dee2e6;
                            font-size: 14px;
                            color: #6c757d;
                        }
                        .contact-info a {
                            color: #cc2936;
                            text-decoration: none;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Something Went Wrong</h1>
                        <p>${errorMessage}</p>
                        
                        <div class="contact-info">
                            <p>If you continue to have trouble, please contact us at:</p>
                            <p><a href="mailto:alocubanoboulderfest@gmail.com">alocubanoboulderfest@gmail.com</a></p>
                        </div>
                    </div>
                </body>
                </html>
            `;
            
            res.setHeader('Content-Type', 'text/html');
            return res.status(500).send(html);
        }
        
        return res.status(500).json({ error: errorMessage });
    }
}