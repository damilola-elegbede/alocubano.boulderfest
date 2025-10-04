/**
 * Google Wallet Hero Image Generator
 * Generates hero images (1032x336px) for Google Wallet passes matching Apple Wallet design
 *
 * Hero Image Components:
 * - Black background (#000000)
 * - Logo watermark (20% opacity, centered)
 * - Colored circle indicator (top right, ticket type color)
 * - Event branding text ("A LO CUBANO | BOULDER FEST")
 */

import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getTicketColorService } from "./ticket-color-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GoogleWalletHeroGenerator {
  constructor() {
    this.heroWidth = 1032;
    this.heroHeight = 336;
    this.circleSize = 135; // 50% larger for better visibility
    this.logoOpacity = 0.2; // 20% opacity for watermark
    this.projectRoot = path.join(__dirname, "..");

    // Base URL for HTTP fetching of static assets
    this.baseUrl = (process.env.VERCEL_ENV === 'production' && process.env.WALLET_BASE_URL)
      ? process.env.WALLET_BASE_URL
      : (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'https://alocubano.vercel.app');
  }

  /**
   * Generate hero image for a ticket type
   * @param {string} ticketTypeId - Ticket type identifier
   * @param {object} options - Generation options
   * @returns {Promise<Buffer>} PNG image buffer
   */
  async generateHeroImage(ticketTypeId, options = {}) {
    const {
      eventName = "A LO CUBANO",
      eventSubtitle = "BOULDER FEST",
      circlePosition = "top-right", // top-right, center, top-left
    } = options;

    // Get ticket color with fallback
    const colorService = getTicketColorService();
    let ticketColor;
    try {
      ticketColor = await colorService.getColorForTicketType(ticketTypeId);
    } catch (error) {
      console.error("[GoogleWalletHero] Failed to resolve ticket color:", error);
      ticketColor = { name: "Default", rgb: "rgb(255, 255, 255)", emoji: "⬤" };
    }
    const resolvedColor =
      ticketColor || { name: "Default", rgb: "rgb(255, 255, 255)", emoji: "⬤" };

    // Create base black canvas
    const blackCanvas = Buffer.from(
      `<svg width="${this.heroWidth}" height="${this.heroHeight}">
        <rect width="${this.heroWidth}" height="${this.heroHeight}" fill="#000000"/>
      </svg>`
    );

    // Generate colored circle
    const circleBuffer = await this.generateCircle(resolvedColor.rgb);

    // Calculate circle position based on circlePosition parameter
    const circlePadding = 30;
    let circleX, circleY;

    if (circlePosition === "center") {
      // Center the circle horizontally and vertically (Sharp requires integers)
      circleX = Math.floor((this.heroWidth - this.circleSize) / 2);
      circleY = Math.floor((this.heroHeight - this.circleSize) / 2);
    } else if (circlePosition === "top-left") {
      circleX = circlePadding;
      circleY = circlePadding;
    } else {
      // Default: top-right corner with padding
      circleX = this.heroWidth - this.circleSize - circlePadding;
      circleY = circlePadding;
    }

    try {
      // Load background image for watermark via HTTP (works in Vercel serverless)
      const backgroundUrl = `${this.baseUrl}/wallet/background.png`;
      const backgroundResponse = await fetch(backgroundUrl);
      if (!backgroundResponse.ok) {
        throw new Error(`Failed to fetch background image: ${backgroundResponse.status}`);
      }
      const backgroundBuffer = Buffer.from(await backgroundResponse.arrayBuffer());

      // Get background image metadata to determine dimensions
      const bgMetadata = await sharp(backgroundBuffer).metadata();
      const bgWidth = bgMetadata.width;
      const bgHeight = bgMetadata.height;

      // Create background with opacity using explicit pixel dimensions
      const backgroundWithOpacity = await sharp(backgroundBuffer)
        .ensureAlpha()
        .modulate({ brightness: 1 })
        .composite([
          {
            input: Buffer.from(
              `<svg width="${bgWidth}" height="${bgHeight}">
                <rect width="${bgWidth}" height="${bgHeight}" fill="rgb(255,255,255)" opacity="${this.logoOpacity}"/>
              </svg>`
            ),
            blend: "dest-in",
          },
        ])
        .toBuffer();

      // Composite layers
      const heroImage = await sharp(blackCanvas)
        .resize(this.heroWidth, this.heroHeight)
        .composite([
          {
            input: backgroundWithOpacity,
            gravity: "center",
            blend: "over",
          },
          {
            input: circleBuffer,
            top: circleY,
            left: circleX,
            blend: "over",
          },
        ])
        .png({
          compressionLevel: 9,
          quality: 100,
        })
        .toBuffer();

      return heroImage;
    } catch (error) {
      console.error("[GoogleWalletHero] Error generating hero image:", error);

      // Fallback: Simple hero with circle only (no background image)
      return this.generateSimpleHero(
        resolvedColor.rgb,
        circlePosition,
      );
    }
  }

  /**
   * Generate colored circle
   * Reuses logic from Apple Wallet thumbnail generation
   */
  async generateCircle(rgb) {
    const svgCircle = `
      <svg width="${this.circleSize}" height="${this.circleSize}">
        <circle cx="${this.circleSize / 2}" cy="${this.circleSize / 2}" r="${this.circleSize / 2}" fill="${rgb}"/>
      </svg>
    `;

    return await sharp(Buffer.from(svgCircle))
      .resize(this.circleSize, this.circleSize)
      .png({
        compressionLevel: 9,
        quality: 100,
        palette: false,
      })
      .toBuffer();
  }

  /**
   * Generate simple hero image fallback (no background watermark)
   */
  async generateSimpleHero(
    rgb,
    circlePosition = "top-right",
  ) {
    const circleBuffer = await this.generateCircle(rgb);
    const circlePadding = 30;
    let circleX, circleY;

    if (circlePosition === "center") {
      // Center the circle horizontally and vertically (Sharp requires integers)
      circleX = Math.floor((this.heroWidth - this.circleSize) / 2);
      circleY = Math.floor((this.heroHeight - this.circleSize) / 2);
    } else if (circlePosition === "top-left") {
      circleX = circlePadding;
      circleY = circlePadding;
    } else {
      // Default: top-right corner with padding
      circleX = this.heroWidth - this.circleSize - circlePadding;
      circleY = circlePadding;
    }

    // Just black background + circle (no text, no background image)
    const svgBase = `
      <svg width="${this.heroWidth}" height="${this.heroHeight}">
        <rect width="${this.heroWidth}" height="${this.heroHeight}" fill="#000000"/>
      </svg>
    `;

    return await sharp(Buffer.from(svgBase))
      .resize(this.heroWidth, this.heroHeight)
      .composite([
        {
          input: circleBuffer,
          top: circleY,
          left: circleX,
          blend: "over",
        },
      ])
      .png({
        compressionLevel: 9,
        quality: 100,
      })
      .toBuffer();
  }

  /**
   * Get hero image dimensions
   */
  static getDimensions() {
    return {
      width: 1032,
      height: 336,
      aspectRatio: "1032:336",
    };
  }
}

// Export singleton instance
let heroGeneratorInstance = null;

export function getGoogleWalletHeroGenerator() {
  if (!heroGeneratorInstance) {
    heroGeneratorInstance = new GoogleWalletHeroGenerator();
  }
  return heroGeneratorInstance;
}

export default getGoogleWalletHeroGenerator();
