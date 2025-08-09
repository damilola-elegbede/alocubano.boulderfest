import googleWalletService from "../../lib/google-wallet-service.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  const { ticketId } = req.query;

  if (!ticketId) {
    return res.status(400).json({ error: "Ticket ID required" });
  }

  try {
    // Check if Google Wallet is configured
    if (!googleWalletService.isConfigured()) {
      return res.status(503).json({
        error: "Google Wallet is not configured",
        message: "Please contact support for assistance",
      });
    }

    // Generate the pass and get save URL
    const result = await googleWalletService.generatePass(ticketId);

    // Redirect to Google Wallet save URL
    res.redirect(result.saveUrl);
  } catch (error) {
    console.error("Google Wallet generation error:", error);

    if (error.message === "Ticket not found") {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.status(500).json({
      error: "Failed to generate pass",
      message: error.message || "An unexpected error occurred",
    });
  }
}
