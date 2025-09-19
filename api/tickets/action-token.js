import tokenService from "../../lib/token-service.js";
import ticketService from "../../lib/ticket-service.js";
import { TOKEN_ACTIONS } from "../../lib/ticket-config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { action, targetId, email, accessToken } = req.body;

    if (!action || !targetId || !email) {
      return res.status(400).json({
        error: "action, targetId, and email are required",
      });
    }

    if (!Object.values(TOKEN_ACTIONS).includes(action)) {
      return res.status(400).json({
        error: `Invalid action. Must be one of: ${Object.values(TOKEN_ACTIONS).join(", ")}`,
      });
    }

    // Validate access token if provided (for additional security)
    if (accessToken) {
      const tokenValidation =
        await tokenService.validateAccessToken(accessToken);
      if (!tokenValidation.valid) {
        return res.status(401).json({ error: tokenValidation.error });
      }

      // Verify email matches
      if (tokenValidation.email !== email) {
        return res.status(403).json({ error: "Email mismatch" });
      }
    }

    // For ticket-specific actions, verify ticket exists and user has access
    if (action === TOKEN_ACTIONS.TRANSFER || action === TOKEN_ACTIONS.CANCEL) {
      const ticket = await ticketService.getByTicketId(targetId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Verify user has access to this ticket
      const userTickets = await ticketService.getTicketsByEmail(email);
      const hasAccess = userTickets.some((t) => t.ticket_id === targetId);

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this ticket" });
      }
    }

    // Check rate limiting
    const rateLimit = await tokenService.checkRateLimit(email, "action", 60, 5);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "Too many action token requests",
        retryAfter: Math.ceil((rateLimit.resetAt - new Date()) / 1000),
      });
    }

    // Generate action token
    const actionToken = await tokenService.generateActionToken(
      action,
      targetId,
      email,
    );

    // Set security headers to prevent caching of action tokens
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      success: true,
      actionToken,
      expiresIn: 30 * 60, // 30 minutes in seconds
      action,
      targetId,
      message: `Action token for ${action} generated successfully`,
    });
  } catch (error) {
    console.error("Action token generation error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
