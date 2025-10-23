/**
 * URL utilities for determining base URLs across different environments
 * Centralizes base URL logic to avoid duplication
 */

/**
 * Determine the base URL for the application based on environment
 * @returns {string} Base URL (e.g., https://www.alocubanoboulderfest.org)
 */
export function getBaseUrl() {
  // Production: Use production domain
  if (process.env.VERCEL_ENV === 'production') {
    return "https://www.alocubanoboulderfest.org";
  }
  
  // Preview/Development: Use Vercel URL if available
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Fallback: Use BASE_URL or NEXT_PUBLIC_BASE_URL or default
  return process.env.BASE_URL || 
         process.env.NEXT_PUBLIC_BASE_URL || 
         "https://alocubanoboulderfest.org";
}

/**
 * Build a registration URL with token
 * @param {string} token - Registration token
 * @param {string} [ticketId] - Optional ticket ID for single-ticket view
 * @returns {string} Complete registration URL
 */
export function buildRegistrationUrl(token, ticketId = null) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/register-tickets?token=${token}`;
  return ticketId ? `${url}&ticketId=${ticketId}` : url;
}

/**
 * Build a view tickets URL with token
 * @param {string} token - Access token
 * @param {string} [ticketId] - Optional ticket ID for single-ticket view
 * @returns {string} Complete view tickets URL
 */
export function buildViewTicketsUrl(token, ticketId = null) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/view-tickets?token=${token}`;
  return ticketId ? `${url}&ticketId=${ticketId}` : url;
}

/**
 * Build a QR code URL
 * @param {string} token - QR token
 * @returns {string} Complete QR code URL
 */
export function buildQRCodeUrl(token) {
  const baseUrl = getBaseUrl();
  return `${baseUrl}/api/qr/generate?token=${token}`;
}

/**
 * Build wallet pass URLs
 * @param {string} ticketId - Ticket ID
 * @returns {object} Object with apple and google wallet URLs
 */
export function buildWalletPassUrls(ticketId) {
  const baseUrl = getBaseUrl();
  return {
    apple: `${baseUrl}/api/tickets/apple-wallet/${ticketId}`,
    google: `${baseUrl}/api/tickets/google-wallet/${ticketId}`
  };
}
