import { verifyAdminToken } from '../lib/auth/admin-auth.js';
import AuditLogger from '../../lib/security/audit-logger.js';

export default async function handler(req, res) {
  try {
    // Verify admin authentication
    const adminVerification = await verifyAdminToken(req);
    if (!adminVerification.authorized) {
      return res.status(403).json({
        error: 'Unauthorized access',
        message: 'Administrative access required'
      });
    }

    // Validate request method
    if (req.method !== 'GET') {
      return res.status(405).json({ 
        error: 'Method not allowed', 
        message: 'Only GET requests are supported' 
      });
    }

    // Extract query parameters
    const { 
      startDate, 
      endDate, 
      eventTypes, 
      severityLevels, 
      success 
    } = req.query;

    // Prepare filters
    const filters = {
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(eventTypes && { eventTypes: eventTypes.split(',') }),
      ...(severityLevels && { severityLevels: severityLevels.split(',') }),
      ...(success !== undefined && { 
        success: success === 'true' || success === '1' 
      }),
    };

    // Retrieve logs with applied filters
    const logs = await AuditLogger.retrieveLogs(filters);

    // Respond with logs
    res.status(200).json({
      total: logs.length,
      logs,
    });
  } catch (error) {
    console.error('Audit log retrieval error:', error);
    
    // Prevent detailed error information leakage
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to retrieve audit logs'
    });
  }
}

// Verify admin access and export for serverless function
export const config = {
  api: {
    bodyParser: false, // Disable body parsing
  },
};