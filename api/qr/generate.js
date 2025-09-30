import QRCode from "qrcode";
import { getQRTokenService } from "../../lib/qr-token-service.js";

/**
 * QR Code PNG Generation Endpoint
 *
 * Generates QR codes as PNG images for email compatibility.
 * Accepts JWT token and returns actual PNG buffer (not data URL).
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 */
export default async function handler(req, res) {
  // Only accept GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.query;

  // Validate token parameter
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token parameter is required" });
  }

  try {
    // Get QR token service and validate the token
    const qrTokenService = getQRTokenService();
    const validation = qrTokenService.validateToken(token);

    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid or expired token",
        details: validation.error
      });
    }

    // Determine base URL for QR code data from request
    const host = process.env.VERCEL_URL ?? req.headers.host;
    if (!host) {
      return res
        .status(500)
        .json({ error: "Unable to resolve QR base URL" });
    }
    const protocol =
      req.headers["x-forwarded-proto"] ??
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    const normalizedHost = host.replace(/^https?:\/\//, "");
    const baseUrl = `${protocol}://${normalizedHost}`;

    // Generate QR data pointing to the ticket page
    const qrData = `${baseUrl}/my-ticket#${token}`;

    // QR code generation options optimized for email compatibility
    const qrOptions = {
      errorCorrectionLevel: "M",
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    };

    // Generate PNG buffer (not data URL) for email compatibility
    const pngBuffer = await QRCode.toBuffer(qrData, qrOptions);

    // Set proper headers for PNG image with caching
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400"); // 24 hours
    res.setHeader("Content-Length", pngBuffer.length);

    // Return the PNG buffer
    return res.status(200).send(pngBuffer);

  } catch (error) {
    console.error("Error generating QR code PNG:", error.message);

    // Return 500 for generation failures
    return res.status(500).json({
      error: "Failed to generate QR code",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}