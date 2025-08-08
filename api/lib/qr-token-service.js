import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { getDatabase } from "./database.js";

export class QRTokenService {
  constructor() {
    this.db = getDatabase();
    this.secretKey = process.env.QR_SECRET_KEY;

    if (!this.secretKey || this.secretKey.length < 32) {
      throw new Error("QR_SECRET_KEY must be at least 32 characters long");
    }

    this.expiryDays = parseInt(process.env.QR_CODE_EXPIRY_DAYS || "90");
    this.maxScans = parseInt(process.env.QR_CODE_MAX_SCANS || "10");
  }

  async getOrCreateToken(ticketId) {
    const result = await this.db.execute({
      sql: "SELECT qr_token, qr_generated_at FROM tickets WHERE ticket_id = ?",
      args: [ticketId],
    });

    const ticket = result.rows[0];

    if (ticket?.qr_token) {
      try {
        jwt.verify(ticket.qr_token, this.secretKey);
        return ticket.qr_token;
      } catch {
        // Token expired, generate new one
      }
    }

    const payload = {
      tid: ticketId,
      type: "ticket",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.expiryDays * 24 * 60 * 60,
    };

    const token = jwt.sign(payload, this.secretKey);

    await this.db.execute({
      sql: "UPDATE tickets SET qr_token = ?, qr_generated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?",
      args: [token, ticketId],
    });

    return token;
  }

  async generateQRImage(token, options = {}) {
    const baseUrl =
      process.env.WALLET_BASE_URL || "https://www.alocubanoboulderfest.org";
    const validationUrl = `${baseUrl}/api/tickets/validate?token=${token}`;

    return await QRCode.toDataURL(validationUrl, {
      errorCorrectionLevel: "M",
      type: "image/png",
      quality: 0.92,
      margin: 1,
      width: options.width || 256,
      color: {
        dark: options.darkColor || "#000000",
        light: options.lightColor || "#FFFFFF",
      },
    });
  }
}

let instance;
export function getQRTokenService() {
  if (!instance) {
    instance = new QRTokenService();
  }
  return instance;
}
