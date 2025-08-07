import { PKPass } from 'passkit-generator';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AppleWalletService {
  constructor() {
    this.db = getDatabase();
    this.passTypeId = process.env.APPLE_PASS_TYPE_ID;
    this.teamId = process.env.APPLE_TEAM_ID;
    this.organizationName = process.env.APPLE_PASS_ORGANIZATION || 'A Lo Cubano Boulder Fest';
    this.baseUrl = process.env.WALLET_BASE_URL || 'https://alocubano.vercel.app';
    
    // Decode certificates from base64
    this.signerCert = process.env.APPLE_PASS_CERT ? 
      Buffer.from(process.env.APPLE_PASS_CERT, 'base64') : null;
    this.signerKey = process.env.APPLE_PASS_PASSWORD;
    this.wwdrCert = process.env.APPLE_WWDR_CERT ? 
      Buffer.from(process.env.APPLE_WWDR_CERT, 'base64') : null;
  }

  /**
   * Check if Apple Wallet is configured
   */
  isConfigured() {
    return !!(this.passTypeId && this.teamId && this.signerCert && this.signerKey && this.wwdrCert);
  }

  /**
   * Generate Apple Wallet pass for a ticket
   */
  async generatePass(ticketId) {
    if (!this.isConfigured()) {
      throw new Error('Apple Wallet is not configured. Please set required environment variables.');
    }

    try {
      // Get ticket details
      const result = await this.db.execute({
        sql: `SELECT t.*, tr.transaction_id as order_number, tr.amount_cents
              FROM tickets t
              JOIN transactions tr ON t.transaction_id = tr.id
              WHERE t.ticket_id = ?`,
        args: [ticketId]
      });
      
      if (result.rows.length === 0) {
        throw new Error('Ticket not found');
      }
      
      const ticket = result.rows[0];
      
      // Check if pass already exists
      if (ticket.apple_pass_serial) {
        console.log(`Apple pass already exists for ticket ${ticketId}`);
        // Regenerate with same serial number
        return await this.createPassFile(ticket, ticket.apple_pass_serial);
      }
      
      // Generate new serial number
      const serialNumber = `ALO26-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;
      
      // Create the pass
      const passBuffer = await this.createPassFile(ticket, serialNumber);
      
      // Save serial number to database
      await this.db.execute({
        sql: `UPDATE tickets 
              SET apple_pass_serial = ?, 
                  wallet_pass_generated_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE ticket_id = ?`,
        args: [serialNumber, ticketId]
      });
      
      // Log the event
      await this.logPassEvent(ticket.id, 'created', { serialNumber });
      
      return passBuffer;
      
    } catch (error) {
      console.error('Failed to generate Apple Wallet pass:', error);
      throw error;
    }
  }

  /**
   * Create the actual .pkpass file
   */
  async createPassFile(ticket, serialNumber) {
    const pass = new PKPass({}, {
      signerCert: this.signerCert,
      signerKey: this.signerKey,
      signerKeyPassphrase: this.signerKey,
      wwdr: this.wwdrCert
    });

    // Set pass fields
    pass.passTypeIdentifier = this.passTypeId;
    pass.teamIdentifier = this.teamId;
    pass.organizationName = this.organizationName;
    pass.serialNumber = serialNumber;
    pass.description = 'A Lo Cubano Boulder Fest Ticket';
    pass.foregroundColor = 'rgb(0, 0, 0)';           // Black text
    pass.backgroundColor = 'rgb(255, 255, 255)';      // White background
    pass.labelColor = 'rgb(206, 17, 38)';            // Cuban flag red for labels
    pass.logoText = 'A Lo Cubano';
    
    // Pass structure for event ticket
    pass.eventTicket = {
      // Primary fields
      primaryFields: [
        {
          key: 'event',
          label: 'EVENT',
          value: 'A Lo Cubano Boulder Fest 2026'
        }
      ],
      
      // Secondary fields
      secondaryFields: [
        {
          key: 'ticket-type',
          label: 'TICKET TYPE',
          value: this.formatTicketType(ticket.ticket_type)
        },
        {
          key: 'name',
          label: 'ATTENDEE',
          value: `${ticket.attendee_first_name || ''} ${ticket.attendee_last_name || ''}`.trim() || 'Guest'
        }
      ],
      
      // Auxiliary fields
      auxiliaryFields: [
        {
          key: 'date',
          label: 'DATES',
          value: 'May 15-17, 2026'
        },
        {
          key: 'order',
          label: 'ORDER',
          value: ticket.order_number || ticket.transaction_id
        }
      ],
      
      // Back fields
      backFields: [
        {
          key: 'venue',
          label: 'VENUE',
          value: 'Avalon Ballroom\n6185 Arapahoe Road\nBoulder, CO 80303'
        },
        {
          key: 'ticket-id',
          label: 'TICKET ID',
          value: ticket.ticket_id
        },
        {
          key: 'instructions',
          label: 'CHECK-IN INSTRUCTIONS',
          value: 'Present this pass at the entrance. Have your ID ready. The QR code will be scanned for entry.'
        },
        {
          key: 'support',
          label: 'SUPPORT',
          value: 'Email: alocubanoboulderfest@gmail.com\nWebsite: alocubano.vercel.app'
        },
        {
          key: 'terms',
          label: 'TERMS & CONDITIONS',
          value: 'This ticket is non-refundable and non-transferable unless otherwise stated. ' +
                 'Must be 21+ with valid ID. Subject to venue capacity.'
        }
      ]
    };
    
    // Barcode (QR code with ticket validation token)
    pass.barcodes = [
      {
        format: 'PKBarcodeFormatQR',
        message: ticket.qr_token || ticket.ticket_id,
        messageEncoding: 'iso-8859-1',
        altText: ticket.ticket_id
      }
    ];
    
    // Relevance information
    pass.relevantDate = '2026-05-15T10:00:00-06:00';
    pass.locations = [
      {
        latitude: 40.014984,
        longitude: -105.219544,
        relevantText: 'Welcome to A Lo Cubano Boulder Fest!'
      }
    ];
    
    // Web service for updates (optional)
    if (process.env.WALLET_ENABLE_UPDATES === 'true') {
      pass.webServiceURL = `${this.baseUrl}/api/wallet/apple`;
      pass.authenticationToken = this.generateAuthToken(ticket.ticket_id);
    }
    
    // Add images (logo, icon, etc.)
    // These should be added to your project
    try {
      const projectRoot = path.join(__dirname, '..', '..');
      
      // Logo - 160x50 points
      const logoPath = path.join(projectRoot, 'public', 'wallet', 'logo.png');
      const logoBuffer = await fs.readFile(logoPath);
      pass.addBuffer('logo.png', logoBuffer);
      
      const logo2xPath = path.join(projectRoot, 'public', 'wallet', 'logo@2x.png');
      const logo2xBuffer = await fs.readFile(logo2xPath);
      pass.addBuffer('logo@2x.png', logo2xBuffer);
      
      // Icon - 29x29 points
      const iconPath = path.join(projectRoot, 'public', 'wallet', 'icon.png');
      const iconBuffer = await fs.readFile(iconPath);
      pass.addBuffer('icon.png', iconBuffer);
      
      const icon2xPath = path.join(projectRoot, 'public', 'wallet', 'icon@2x.png');
      const icon2xBuffer = await fs.readFile(icon2xPath);
      pass.addBuffer('icon@2x.png', icon2xBuffer);
      
      // Strip image - 375x98 points (optional)
      const stripPath = path.join(projectRoot, 'public', 'wallet', 'strip.png');
      const stripBuffer = await fs.readFile(stripPath);
      pass.addBuffer('strip.png', stripBuffer);
      
      const strip2xPath = path.join(projectRoot, 'public', 'wallet', 'strip@2x.png');
      const strip2xBuffer = await fs.readFile(strip2xPath);
      pass.addBuffer('strip@2x.png', strip2xBuffer);
    } catch (error) {
      console.log('Wallet images not found, using defaults');
    }
    
    return await pass.generate();
  }

  /**
   * Format ticket type for display
   */
  formatTicketType(type) {
    const typeMap = {
      'vip-pass': 'VIP Pass',
      'weekend-pass': 'Weekend Pass',
      'friday-pass': 'Friday Pass',
      'saturday-pass': 'Saturday Pass',
      'sunday-pass': 'Sunday Pass',
      'workshop-beginner': 'Beginner Workshop',
      'workshop-intermediate': 'Intermediate Workshop',
      'workshop-advanced': 'Advanced Workshop',
      'workshop': 'Workshop',
      'social-dance': 'Social Dance',
      'general-admission': 'General Admission'
    };
    
    return typeMap[type] || type;
  }

  /**
   * Generate authentication token for pass updates
   */
  generateAuthToken(ticketId) {
    // Simple token for now, could use JWT
    return Buffer.from(`${ticketId}:${Date.now()}`).toString('base64');
  }

  /**
   * Update pass (push notification to device)
   */
  async updatePass(serialNumber, changes) {
    // This would require implementing Apple Push Notification service
    // For now, log the update request
    console.log(`Pass update requested for ${serialNumber}:`, changes);
    
    await this.db.execute({
      sql: `UPDATE tickets 
            SET wallet_pass_updated_at = CURRENT_TIMESTAMP 
            WHERE apple_pass_serial = ?`,
      args: [serialNumber]
    });
  }

  /**
   * Revoke a pass
   */
  async revokePass(ticketId, reason) {
    const result = await this.db.execute({
      sql: `UPDATE tickets 
            SET wallet_pass_revoked_at = CURRENT_TIMESTAMP,
                wallet_pass_revoked_reason = ?
            WHERE ticket_id = ?`,
      args: [reason, ticketId]
    });
    
    const ticket = await this.db.execute({
      sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
      args: [ticketId]
    });
    
    if (ticket.rows.length > 0) {
      await this.logPassEvent(ticket.rows[0].id, 'revoked', { reason });
    }
  }

  /**
   * Log wallet pass event
   */
  async logPassEvent(ticketId, eventType, eventData = {}) {
    await this.db.execute({
      sql: `INSERT INTO wallet_pass_events (
        ticket_id, pass_type, event_type, event_data
      ) VALUES (?, ?, ?, ?)`,
      args: [
        ticketId,
        'apple',
        eventType,
        JSON.stringify(eventData)
      ]
    });
  }
}

export default new AppleWalletService();