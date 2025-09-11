import { QRTokenService } from "../../lib/qr-token-service.js";

/**
 * Generate QR code image for a ticket
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ticketId, token } = req.query;

  // Require either ticketId or token
  if (!ticketId && !token) {
    return res.status(400).json({
      error: "Either ticketId or token parameter required",
    });
  }

  try {
    const service = new QRTokenService();

    // Check if service is properly configured
    if (!service.isConfigured()) {
      throw new Error("QR service not properly configured");
    }

    let qrToken;

    if (ticketId) {
      // Validate ticket ID format
      if (typeof ticketId !== "string" || !/^[A-Z0-9-]+$/i.test(ticketId)) {
        return res.status(400).json({
          error: "Invalid ticket ID format",
        });
      }
      // Generate or get existing token
      qrToken = await service.getOrCreateToken(ticketId);
    } else if (token) {
      // Validate token format (JWT should have 3 parts separated by dots)
      if (typeof token !== "string" || token.split(".").length !== 3) {
        return res.status(400).json({
          error: "Invalid token format",
        });
      }
      qrToken = token;
    }

    // Generate QR code image
    const qrDataUrl = await service.generateQRImage(qrToken);

    // Convert data URL to buffer
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Set cache headers for QR codes
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=3600"); // Cache for 1 hour
    res.status(200).send(imageBuffer);
  } catch (error) {
    console.error("QR generation error:", {
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({
      error: "Failed to generate QR code",
    });
  }
}
