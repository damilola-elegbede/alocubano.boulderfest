import ticketService from "../lib/ticket-service.js";
import tokenService from "../lib/token-service.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { ticketId, accessToken } = req.body;

    if (!ticketId || !accessToken) {
      return res.status(400).json({
        error: "ticketId and accessToken are required",
      });
    }

    // Validate access token
    const tokenValidation = await tokenService.validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      return res.status(401).json({ error: tokenValidation.error });
    }

    // Get ticket to verify ownership
    const ticket = await ticketService.getByTicketId(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Verify token belongs to this transaction
    const transactionTickets = await ticketService.getTransactionTickets(
      tokenValidation.transactionId,
    );
    const hasAccess = transactionTickets.some((t) => t.ticket_id === ticketId);

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this ticket" });
    }

    // Generate QR code
    const qrResult = await ticketService.generateQRCode(ticketId);

    return res.status(200).json({
      success: true,
      ticketId: qrResult.ticketId,
      qrData: qrResult.qrData,
      message: "QR code generated successfully",
    });
  } catch (error) {
    console.error("QR code generation error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
