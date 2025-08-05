/**
 * Analytics tracking endpoint
 * Simple implementation that returns success without actually tracking
 * Can be enhanced later with real analytics
 */

export default function handler(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // For now, just return success
  // In production, you'd send this to your analytics service
  return res.status(200).json({
    success: true,
    message: "Event tracked",
  });
}
