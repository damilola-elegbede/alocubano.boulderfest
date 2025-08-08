import { getQRTokenService } from "../lib/qr-token-service.js";
import jwt from "jsonwebtoken";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token required" });
  }

  try {
    // Verify token is valid
    let ticketId;
    try {
      const decoded = jwt.verify(token, process.env.QR_SECRET_KEY);
      ticketId = decoded.tid;
    } catch {
      ticketId = token; // Fallback
    }

    // Generate QR image
    const qrService = getQRTokenService();
    const qrImage = await qrService.generateQRImage(token);

    res.status(200).json({
      success: true,
      ticketId,
      qrImage,
    });
  } catch (error) {
    console.error("QR image generation error:", error);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
}
