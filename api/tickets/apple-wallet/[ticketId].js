import getAppleWalletService from "../../lib/apple-wallet-service.js";

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
    // Get Apple Wallet service instance
    const appleWalletService = await getAppleWalletService();
    
    // Check if Apple Wallet is configured
    if (!appleWalletService.isConfigured()) {
      return res.status(503).json({
        error: "Apple Wallet is not configured",
        message: "Please contact support for assistance",
      });
    }

    // Generate the pass
    const passBuffer = await appleWalletService.generatePass(ticketId);

    // Set proper headers for .pkpass file
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${ticketId}.pkpass"`,
    );

    // Send the pass file
    res.status(200).send(passBuffer);
  } catch (error) {
    console.error("Apple Wallet generation error:", error);

    if (error.message === "Ticket not found") {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.status(500).json({
      error: "Failed to generate pass",
      message: error.message || "An unexpected error occurred",
    });
  }
}

// Disable body parsing for binary response
export const config = {
  api: {
    bodyParser: false,
  },
};
