import { GoogleAuth } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './database.js';
import jwt from 'jsonwebtoken';

export class GoogleWalletService {
  constructor() {
    this.db = getDatabase();
    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    this.classId = process.env.GOOGLE_WALLET_CLASS_ID || 'alocubano_tickets_2026';
    this.baseUrl = process.env.WALLET_BASE_URL || 'https://alocubano.vercel.app';
    
    // Initialize Google Auth
    if (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(
          Buffer.from(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT, 'base64').toString()
        );
        
        this.auth = new GoogleAuth({
          credentials: serviceAccount,
          scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
        });
        
        this.serviceAccount = serviceAccount;
      } catch (error) {
        console.error('Failed to initialize Google Auth:', error);
        this.auth = null;
        this.serviceAccount = null;
      }
    } else {
      this.auth = null;
      this.serviceAccount = null;
    }
    
    this.client = null;
    this.walletApiUrl = 'https://walletobjects.googleapis.com/walletobjects/v1';
  }

  /**
   * Check if Google Wallet is configured
   */
  isConfigured() {
    return !!(this.issuerId && this.auth && this.serviceAccount);
  }

  /**
   * Initialize the authenticated client
   */
  async initClient() {
    if (!this.isConfigured()) {
      throw new Error('Google Wallet is not configured. Please set required environment variables.');
    }
    
    if (!this.client) {
      this.client = await this.auth.getClient();
    }
    return this.client;
  }

  /**
   * Create or update the event ticket class (template)
   */
  async createOrUpdateClass() {
    await this.initClient();
    
    const classDefinition = {
      id: `${this.issuerId}.${this.classId}`,
      issuerName: 'A Lo Cubano Boulder Fest',
      reviewStatus: 'UNDER_REVIEW',
      eventName: {
        defaultValue: {
          language: 'en',
          value: 'A Lo Cubano Boulder Fest 2026'
        }
      },
      venue: {
        name: {
          defaultValue: {
            language: 'en',
            value: 'Avalon Ballroom'
          }
        },
        address: {
          defaultValue: {
            language: 'en',
            value: '6185 Arapahoe Road, Boulder, CO 80303'
          }
        }
      },
      dateTime: {
        start: '2026-05-15T10:00:00-06:00',
        end: '2026-05-17T23:00:00-06:00'
      },
      logo: {
        sourceUri: {
          uri: `${this.baseUrl}/images/wallet/google-logo.png`
        }
      },
      heroImage: {
        sourceUri: {
          uri: `${this.baseUrl}/images/wallet/google-hero.png`
        }
      },
      hexBackgroundColor: '#667EEA',
      homepageUri: {
        uri: this.baseUrl
      }
    };
    
    try {
      // Try to get existing class
      const response = await this.client.request({
        url: `${this.walletApiUrl}/eventTicketClass/${this.issuerId}.${this.classId}`,
        method: 'GET'
      });
      
      // Update existing class
      await this.client.request({
        url: `${this.walletApiUrl}/eventTicketClass/${this.issuerId}.${this.classId}`,
        method: 'PATCH',
        data: classDefinition
      });
      
      console.log('Google Wallet class updated');
    } catch (error) {
      if (error.response?.status === 404) {
        // Create new class
        await this.client.request({
          url: `${this.walletApiUrl}/eventTicketClass`,
          method: 'POST',
          data: classDefinition
        });
        
        console.log('Google Wallet class created');
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate Google Wallet pass for a ticket
   */
  async generatePass(ticketId) {
    if (!this.isConfigured()) {
      throw new Error('Google Wallet is not configured. Please set required environment variables.');
    }

    try {
      await this.initClient();
      
      // Ensure class exists
      await this.createOrUpdateClass();
      
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
      let objectId = ticket.google_pass_id;
      if (!objectId) {
        objectId = `${this.issuerId}.${uuidv4()}`;
        
        // Save pass ID to database
        await this.db.execute({
          sql: `UPDATE tickets 
                SET google_pass_id = ?, 
                    wallet_pass_generated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE ticket_id = ?`,
          args: [objectId, ticketId]
        });
      }
      
      // Create pass object
      const passObject = {
        id: objectId,
        classId: `${this.issuerId}.${this.classId}`,
        state: 'ACTIVE',
        ticketHolderName: `${ticket.attendee_first_name || ''} ${ticket.attendee_last_name || ''}`.trim() || 'Guest',
        ticketNumber: ticket.ticket_id,
        barcode: {
          type: 'QR_CODE',
          value: ticket.qr_token || ticket.ticket_id,
          alternateText: ticket.ticket_id
        },
        ticketType: {
          defaultValue: {
            language: 'en',
            value: this.formatTicketType(ticket.ticket_type)
          }
        },
        groupingInfo: {
          groupingId: ticket.order_number || ticket.transaction_id,
          sortIndex: 1
        },
        linkedOfferIds: [],
        validTimeInterval: {
          start: {
            date: '2026-05-15T00:00:00-06:00'
          },
          end: {
            date: '2026-05-18T00:00:00-06:00'
          }
        },
        messages: [
          {
            header: 'Welcome!',
            body: 'Show this ticket at the entrance for scanning.',
            displayInterval: {
              start: {
                date: '2026-05-15T00:00:00-06:00'
              }
            }
          }
        ]
      };
      
      // Create or update the pass object
      try {
        await this.client.request({
          url: `${this.walletApiUrl}/eventTicketObject/${objectId}`,
          method: 'PUT',
          data: passObject
        });
      } catch (error) {
        if (error.response?.status === 404) {
          await this.client.request({
            url: `${this.walletApiUrl}/eventTicketObject`,
            method: 'POST',
            data: passObject
          });
        } else {
          throw error;
        }
      }
      
      // Generate save link
      const saveUrl = await this.generateSaveUrl(objectId);
      
      // Log the event
      await this.logPassEvent(ticket.id, 'created', { objectId });
      
      return {
        objectId,
        saveUrl
      };
      
    } catch (error) {
      console.error('Failed to generate Google Wallet pass:', error);
      throw error;
    }
  }

  /**
   * Generate a signed JWT for the "Add to Google Wallet" link
   */
  async generateSaveUrl(objectId) {
    if (!this.serviceAccount) {
      throw new Error('Google Wallet service account not configured');
    }
    
    const claims = {
      iss: this.serviceAccount.client_email,
      aud: 'google',
      origins: [this.baseUrl],
      typ: 'savetowallet',
      payload: {
        eventTicketObjects: [
          {
            id: objectId
          }
        ]
      }
    };
    
    const token = jwt.sign(claims, this.serviceAccount.private_key, {
      algorithm: 'RS256'
    });
    
    return `https://pay.google.com/gp/v/save/${token}`;
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
   * Update pass
   */
  async updatePass(objectId, updates) {
    if (!this.isConfigured()) {
      throw new Error('Google Wallet is not configured');
    }

    await this.initClient();
    
    try {
      await this.client.request({
        url: `${this.walletApiUrl}/eventTicketObject/${objectId}`,
        method: 'PATCH',
        data: updates
      });
      
      await this.db.execute({
        sql: `UPDATE tickets 
              SET wallet_pass_updated_at = CURRENT_TIMESTAMP 
              WHERE google_pass_id = ?`,
        args: [objectId]
      });
      
      console.log(`Google Wallet pass updated: ${objectId}`);
    } catch (error) {
      console.error('Failed to update Google Wallet pass:', error);
      throw error;
    }
  }

  /**
   * Revoke a pass
   */
  async revokePass(ticketId, reason) {
    const result = await this.db.execute({
      sql: `SELECT * FROM tickets WHERE ticket_id = ?`,
      args: [ticketId]
    });
    
    if (result.rows.length === 0) {
      throw new Error('Ticket not found');
    }
    
    const ticket = result.rows[0];
    
    if (ticket.google_pass_id && this.isConfigured()) {
      await this.updatePass(ticket.google_pass_id, {
        state: 'EXPIRED',
        disableExpirationNotification: true
      });
    }
    
    await this.db.execute({
      sql: `UPDATE tickets 
            SET wallet_pass_revoked_at = CURRENT_TIMESTAMP,
                wallet_pass_revoked_reason = ?
            WHERE ticket_id = ?`,
      args: [reason, ticketId]
    });
    
    await this.logPassEvent(ticket.id, 'revoked', { reason });
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
        'google',
        eventType,
        JSON.stringify(eventData)
      ]
    });
  }
}

export default new GoogleWalletService();