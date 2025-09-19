/**
 * Diagnostic endpoint to check file system in Vercel deployment
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authService from '../../lib/auth-service.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function handler(req, res) {
  // Only allow in non-production for security
  if (process.env.VERCEL_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const results = {
    timestamp: new Date().toISOString(),
    currentDir: __dirname,
    taskDir: '/var/task',
    checks: {}
  };

  // Check various paths
  const pathsToCheck = [
    '/var/task/lib/encryption-utils.js',
    '/var/task/lib/mfa-middleware.js',
    '/var/task/lib/auth-service.js',
    path.resolve(__dirname, '../../lib/encryption-utils.js'),
    path.resolve(__dirname, '../../lib/mfa-middleware.js'),
    './lib/encryption-utils.js',
    './lib/mfa-middleware.js'
  ];

  for (const filePath of pathsToCheck) {
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      results.checks[filePath] = {
        exists: true,
        size: stats.size,
        isFile: stats.isFile()
      };
    } catch (error) {
      results.checks[filePath] = {
        exists: false,
        error: error.message
      };
    }
  }

  // List contents of /var/task/lib if it exists
  try {
    const libPath = '/var/task/lib';
    const libContents = await fs.readdir(libPath);
    results.libContents = libContents;
    
    // Check if security directory exists
    try {
      const securityPath = '/var/task/lib/security';
      const securityContents = await fs.readdir(securityPath);
      results.securityContents = securityContents;
    } catch (error) {
      results.securityContents = `Error: ${error.message}`;
    }
  } catch (error) {
    results.libContents = `Error: ${error.message}`;
  }

  // Try to actually import the module
  try {
    const module = await import('../../lib/encryption-utils.js');
    results.importSuccess = true;
    results.exportedFunctions = Object.keys(module);
  } catch (error) {
    results.importSuccess = false;
    results.importError = error.message;
  }

  res.status(200).json(results);
}

export default withSecurityHeaders(
  authService.requireAuth(
    withAdminAudit(handler, {
      logBody: false,
      logMetadata: true,
      skipMethods: [] // Track debug file system access for security
    })
  ),
  { isAPI: true }
);