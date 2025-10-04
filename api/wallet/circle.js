/**
 * Wallet Circle Image API
 * Generates colored circle images for Google Wallet pass visual indicators
 *
 * Query Parameters:
 * - rgb: RGB color string (e.g., "rgb(255,20,147)")
 * - size: Optional size in pixels (default: 90)
 */

import sharp from "sharp";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const { rgb, size = "90" } = req.query;

    if (!rgb) {
      return res.status(400).json({
        error: "Missing required parameter: rgb",
        example: "/api/wallet/circle?rgb=rgb(255,20,147)",
      });
    }

    // Validate RGB format and component range
    const rgbPattern = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
    const match = rgb.match(rgbPattern);

    if (!match) {
      return res.status(400).json({
        error: "Invalid RGB format",
        expected: "rgb(r,g,b) where r,g,b are 0-255",
        received: rgb,
      });
    }

    // Validate each RGB component is 0-255
    const [, r, g, b] = match;
    const rVal = parseInt(r, 10);
    const gVal = parseInt(g, 10);
    const bVal = parseInt(b, 10);

    if (rVal < 0 || rVal > 255 || gVal < 0 || gVal > 255 || bVal < 0 || bVal > 255) {
      return res.status(400).json({
        error: "RGB components must be between 0 and 255",
        expected: "rgb(r,g,b) where r,g,b are 0-255",
        received: rgb,
      });
    }

    // Parse and validate size
    const circleSize = parseInt(size, 10);
    if (isNaN(circleSize) || circleSize < 10 || circleSize > 500) {
      return res.status(400).json({
        error: "Invalid size parameter",
        expected: "Integer between 10 and 500",
        received: size,
      });
    }

    // Generate colored circle SVG
    const svgCircle = `
      <svg width="${circleSize}" height="${circleSize}">
        <circle cx="${circleSize / 2}" cy="${circleSize / 2}" r="${circleSize / 2}" fill="${rgb}"/>
      </svg>
    `;

    // Convert to PNG with Sharp
    const circleBuffer = await sharp(Buffer.from(svgCircle))
      .resize(circleSize, circleSize)
      .png({
        compressionLevel: 9,
        quality: 100,
        palette: false, // Full RGB+Alpha fidelity
      })
      .toBuffer();

    // Set caching headers (24 hours)
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.setHeader("Content-Length", circleBuffer.length);

    // Send PNG
    res.status(200).send(circleBuffer);
  } catch (error) {
    console.error("[Wallet Circle API] Error generating circle:", error);
    res.status(500).json({
      error: "Failed to generate circle image",
      message: error.message,
    });
  }
}
