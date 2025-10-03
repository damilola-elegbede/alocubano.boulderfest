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
    this.circleSize = 90; // Same as Apple Wallet thumbnail size
    this.logoOpacity = 0.2; // 20% opacity for watermark
    this.projectRoot = path.join(__dirname, "..");
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

    // Get ticket color
    const colorService = getTicketColorService();
    const ticketColor = await colorService.getColorForTicketType(ticketTypeId);

    // Create base black canvas
    const blackCanvas = Buffer.from(
      `<svg width="${this.heroWidth}" height="${this.heroHeight}">
        <rect width="${this.heroWidth}" height="${this.heroHeight}" fill="#000000"/>
      </svg>`
    );

    // Generate colored circle
    const circleBuffer = await this.generateCircle(ticketColor.rgb);

    // Calculate circle position (top-right corner with padding)
    const circlePadding = 30;
    const circleX = this.heroWidth - this.circleSize - circlePadding;
    const circleY = circlePadding;

    // Create text overlay SVG
    const textOverlay = this.createTextOverlay(eventName, eventSubtitle);

    try {
      // Load logo for watermark
      const logoPath = path.join(this.projectRoot, "public", "wallet", "logo.png");
      const logoBuffer = await fs.readFile(logoPath);

      // Create logo with opacity
      const logoWithOpacity = await sharp(logoBuffer)
        .ensureAlpha()
        .modulate({ brightness: 1 })
        .composite([
          {
            input: Buffer.from(
              `<svg width="100%" height="100%">
                <rect width="100%" height="100%" fill="rgb(255,255,255)" opacity="${this.logoOpacity}"/>
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
            input: logoWithOpacity,
            gravity: "center",
            blend: "over",
          },
          {
            input: circleBuffer,
            top: circleY,
            left: circleX,
            blend: "over",
          },
          {
            input: Buffer.from(textOverlay),
            gravity: "north",
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

      // Fallback: Simple hero with circle and text only
      return this.generateSimpleHero(ticketColor.rgb, eventName, eventSubtitle);
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
   * Create text overlay SVG for branding
   */
  createTextOverlay(eventName, eventSubtitle) {
    return `
      <svg width="${this.heroWidth}" height="${this.heroHeight}">
        <text
          x="50"
          y="60"
          font-family="Bebas Neue, Arial Black, sans-serif"
          font-size="48"
          font-weight="bold"
          fill="#5b6bb5"
        >
          ${eventName}
        </text>
        <text
          x="50"
          y="100"
          font-family="Bebas Neue, Arial Black, sans-serif"
          font-size="32"
          font-weight="bold"
          fill="#ce1126"
        >
          ${eventSubtitle}
        </text>
      </svg>
    `;
  }

  /**
   * Generate simple hero image fallback (no logo watermark)
   */
  async generateSimpleHero(rgb, eventName, eventSubtitle) {
    const circleBuffer = await this.generateCircle(rgb);
    const circlePadding = 30;
    const circleX = this.heroWidth - this.circleSize - circlePadding;
    const circleY = circlePadding;

    const svgBase = `
      <svg width="${this.heroWidth}" height="${this.heroHeight}">
        <rect width="${this.heroWidth}" height="${this.heroHeight}" fill="#000000"/>
        <text
          x="50"
          y="60"
          font-family="Bebas Neue, Arial Black, sans-serif"
          font-size="48"
          font-weight="bold"
          fill="#5b6bb5"
        >
          ${eventName}
        </text>
        <text
          x="50"
          y="100"
          font-family="Bebas Neue, Arial Black, sans-serif"
          font-size="32"
          font-weight="bold"
          fill="#ce1126"
        >
          ${eventSubtitle}
        </text>
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
