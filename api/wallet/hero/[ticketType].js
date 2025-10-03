/**
 * Google Wallet Hero Image API
 * Generates hero images (1032x336px) for Google Wallet passes
 *
 * Route: /api/wallet/hero/[ticketType]
 * Example: /api/wallet/hero/vip-pass
 */

import { getGoogleWalletHeroGenerator } from "../../../lib/google-wallet-hero-generator.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const { ticketType } = req.query;

    if (!ticketType) {
      return res.status(400).json({
        error: "Missing required parameter: ticketType",
        example: "/api/wallet/hero/vip-pass",
      });
    }

    // Get hero generator service
    const heroGenerator = getGoogleWalletHeroGenerator();

    // Generate hero image for ticket type
    const heroBuffer = await heroGenerator.generateHeroImage(ticketType, {
      eventName: "A LO CUBANO",
      eventSubtitle: "BOULDER FEST",
      circlePosition: "center",
    });

    // Set caching headers (24 hours - hero images are static per ticket type)
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.setHeader("Content-Length", heroBuffer.length);

    // Send PNG
    res.status(200).send(heroBuffer);
  } catch (error) {
    console.error("[Wallet Hero API] Error generating hero image:", error);
    res.status(500).json({
      error: "Failed to generate hero image",
      message: error.message,
    });
  }
}

// Disable body parsing for binary response
export const config = {
  api: {
    bodyParser: false,
  },
};
