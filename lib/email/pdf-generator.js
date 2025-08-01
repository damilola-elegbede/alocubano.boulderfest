const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * PDF Ticket Generator for A Lo Cubano Boulder Fest
 * Creates festival tickets with QR codes and branding
 */
class PDFTicketGenerator {
  constructor() {
    this.festivalInfo = {
      name: 'A LO CUBANO',
      subtitle: 'BOULDER FEST 2026',
      dates: 'May 15-17, 2026',
      venue: 'Avalon Ballroom',
      address: '6185 Arapahoe Rd, Boulder, CO 80303',
      website: 'www.alocubanoboulderfest.com',
      instagram: '@alocubano.boulderfest',
      email: 'alocubanoboulderfest@gmail.com'
    };
    
    this.colors = {
      primary: '#d32f2f',
      secondary: '#c62828',
      accent: '#ff6b35',
      dark: '#2c2c2c',
      light: '#f8f9fa',
      white: '#ffffff',
      text: '#333333',
      muted: '#666666'
    };
  }

  /**
   * Generate a single ticket PDF
   */
  async generateTicket(ticketData, orderData) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          size: 'A4', 
          margin: 0,
          info: {
            Title: `A Lo Cubano Boulder Fest - Ticket ${ticketData.ticketId}`,
            Author: 'A Lo Cubano Boulder Fest',
            Subject: 'Festival Ticket',
            Creator: 'A Lo Cubano Boulder Fest Ticketing System'
          }
        });
        
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Generate QR code for ticket validation
        const qrData = await this.generateQRData(ticketData, orderData);
        const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
          width: 200,
          margin: 2,
          color: {
            dark: this.colors.primary,
            light: '#FFFFFF'
          }
        });
        
        const qrImageBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

        // Create ticket design
        await this.createTicketDesign(doc, ticketData, orderData, qrImageBuffer);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate multiple tickets in a single PDF
   */
  async generateTicketBundle(tickets, orderData) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          size: 'A4', 
          margin: 0,
          info: {
            Title: `A Lo Cubano Boulder Fest - Order ${orderData.orderId}`,
            Author: 'A Lo Cubano Boulder Fest',
            Subject: 'Festival Tickets Bundle'
          }
        });
        
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Generate tickets
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          
          // Generate QR code for this ticket
          const qrData = await this.generateQRData(ticket, orderData);
          const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
            width: 200,
            margin: 2,
            color: {
              dark: this.colors.primary,
              light: '#FFFFFF'
            }
          });
          
          const qrImageBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

          // Create ticket design
          await this.createTicketDesign(doc, ticket, orderData, qrImageBuffer);

          // Add new page for next ticket (except for last ticket)
          if (i < tickets.length - 1) {
            doc.addPage();
          }
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create the visual ticket design
   */
  async createTicketDesign(doc, ticketData, orderData, qrImageBuffer) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;

    // Background gradient effect
    this.addBackgroundDesign(doc, pageWidth, pageHeight);

    // Header section with festival branding
    this.addHeader(doc, margin);

    // Main ticket content
    this.addTicketContent(doc, ticketData, orderData, margin);

    // QR Code section
    this.addQRCodeSection(doc, qrImageBuffer, pageWidth, margin);

    // Important information section
    this.addImportantInfo(doc, margin, pageWidth);

    // Footer with contact info
    this.addFooter(doc, pageHeight, pageWidth, margin);

    // Decorative elements
    this.addDecorativeElements(doc, pageWidth, pageHeight);

    // Security features
    this.addSecurityFeatures(doc, ticketData, orderData, pageWidth, pageHeight);
  }

  /**
   * Add background design elements
   */
  addBackgroundDesign(doc, pageWidth, pageHeight) {
    // Subtle background pattern
    doc.save();
    doc.opacity(0.03);
    
    // Create a pattern of Cuban-inspired geometric shapes
    for (let x = 0; x < pageWidth; x += 60) {
      for (let y = 0; y < pageHeight; y += 60) {
        doc.fillColor(this.colors.primary)
           .circle(x, y, 3)
           .fill();
      }
    }
    
    doc.restore();

    // Top gradient bar
    const gradient = doc.linearGradient(0, 0, pageWidth, 80);
    gradient.stop(0, this.colors.primary)
           .stop(0.5, this.colors.secondary)
           .stop(1, this.colors.accent);
    
    doc.rect(0, 0, pageWidth, 80)
       .fill(gradient);
  }

  /**
   * Add header section
   */
  addHeader(doc, margin) {
    // Festival logo/name
    doc.fillColor(this.colors.white)
       .fontSize(52)
       .font('Helvetica-Bold')
       .text(this.festivalInfo.name, margin, 20, { 
         width: doc.page.width - (margin * 2), 
         align: 'center' 
       });

    doc.fillColor(this.colors.white)
       .fontSize(20)
       .font('Helvetica')
       .text(this.festivalInfo.subtitle, margin, 75, { 
         width: doc.page.width - (margin * 2), 
         align: 'center' 
       });

    // Festival dates
    doc.fillColor(this.colors.primary)
       .fontSize(24)
       .font('Helvetica-Bold')
       .text(this.festivalInfo.dates, margin, 120, { 
         width: doc.page.width - (margin * 2), 
         align: 'center' 
       });
  }

  /**
   * Add main ticket content
   */
  addTicketContent(doc, ticketData, orderData, margin) {
    const startY = 180;
    
    // Ticket type banner
    const ticketType = ticketData.type || 'Festival Pass';
    doc.fillColor(this.colors.primary)
       .rect(margin, startY, doc.page.width - (margin * 2), 40)
       .fill();

    doc.fillColor(this.colors.white)
       .fontSize(18)
       .font('Helvetica-Bold')
       .text(ticketType.toUpperCase(), margin + 20, startY + 12);

    // Venue information
    const venueY = startY + 60;
    doc.fillColor(this.colors.text)
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('VENUE:', margin, venueY);

    doc.fillColor(this.colors.text)
       .fontSize(14)
       .font('Helvetica')
       .text(this.festivalInfo.venue, margin, venueY + 25)
       .text(this.festivalInfo.address, margin, venueY + 45);

    // Attendee information
    const attendeeY = venueY + 80;
    doc.fillColor(this.colors.primary)
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('ATTENDEE INFORMATION:', margin, attendeeY);

    const infoStartY = attendeeY + 30;
    const lineHeight = 22;
    let currentY = infoStartY;

    const ticketInfo = [
      { label: 'Name:', value: orderData.customerName || 'Festival Guest' },
      { label: 'Email:', value: orderData.customerEmail },
      { label: 'Ticket ID:', value: ticketData.ticketId },
      { label: 'Order ID:', value: orderData.orderId },
      { label: 'Purchase Date:', value: new Date(orderData.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}
    ];

    ticketInfo.forEach(item => {
      doc.fillColor(this.colors.muted)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text(item.label, margin, currentY, { width: 120 });

      doc.fillColor(this.colors.text)
         .fontSize(12)
         .font('Helvetica')
         .text(item.value, margin + 120, currentY, { width: 300 });

      currentY += lineHeight;
    });
  }

  /**
   * Add QR code section
   */
  addQRCodeSection(doc, qrImageBuffer, pageWidth, margin) {
    const qrX = pageWidth - 180;
    const qrY = 180;
    const qrSize = 140;

    // QR code background
    doc.fillColor(this.colors.white)
       .rect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20)
       .fill();

    doc.strokeColor(this.colors.primary)
       .lineWidth(2)
       .rect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20)
       .stroke();

    // QR code image
    doc.image(qrImageBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // QR code instructions
    doc.fillColor(this.colors.muted)
       .fontSize(10)
       .font('Helvetica')
       .text('SCAN AT VENUE', qrX, qrY + qrSize + 15, { 
         width: qrSize, 
         align: 'center' 
       })
       .text('ENTRANCE', qrX, qrY + qrSize + 30, { 
         width: qrSize, 
         align: 'center' 
       });
  }

  /**
   * Add important information section
   */
  addImportantInfo(doc, margin, pageWidth) {
    const startY = 450;
    
    doc.fillColor(this.colors.primary)
       .fontSize(18)
       .font('Helvetica-Bold')
       .text('IMPORTANT INFORMATION', margin, startY);

    const importantNotes = [
      '• Please bring this ticket (digital or printed) to the event',
      '• Check-in opens 1 hour before the first workshop',
      '• This ticket is non-transferable and non-refundable',
      '• Valid ID required for entry (18+ event)',
      '• Photography and videography may occur during the festival',
      '• Festival schedule subject to change - check website for updates'
    ];

    let currentY = startY + 30;
    importantNotes.forEach(note => {
      doc.fillColor(this.colors.text)
         .fontSize(11)
         .font('Helvetica')
         .text(note, margin, currentY, { width: pageWidth - (margin * 2) });
      currentY += 18;
    });
  }

  /**
   * Add footer with contact information
   */
  addFooter(doc, pageHeight, pageWidth, margin) {
    const footerY = pageHeight - 120;
    
    // Divider line
    doc.strokeColor(this.colors.primary)
       .lineWidth(2)
       .moveTo(margin, footerY)
       .lineTo(pageWidth - margin, footerY)
       .stroke();

    // Spanish phrase
    doc.fillColor(this.colors.primary)
       .fontSize(20)
       .font('Helvetica-Bold')
       .text('¡NOS VEMOS EN LA PISTA!', margin, footerY + 20, { 
         width: pageWidth - (margin * 2), 
         align: 'center' 
       });

    // Contact information
    doc.fillColor(this.colors.muted)
       .fontSize(10)
       .font('Helvetica')
       .text(`${this.festivalInfo.website} | ${this.festivalInfo.instagram} | ${this.festivalInfo.email}`, 
              margin, footerY + 55, { 
                width: pageWidth - (margin * 2), 
                align: 'center' 
              });
  }

  /**
   * Add decorative elements
   */
  addDecorativeElements(doc, pageWidth, pageHeight) {
    // Corner decorations
    const cornerSize = 30;
    
    // Top left corner
    doc.save();
    doc.fillColor(this.colors.accent)
       .opacity(0.3)
       .polygon([0, 0], [cornerSize, 0], [0, cornerSize])
       .fill();
    
    // Top right corner
    doc.polygon([pageWidth, 0], [pageWidth - cornerSize, 0], [pageWidth, cornerSize])
       .fill();
    
    // Bottom left corner
    doc.polygon([0, pageHeight], [cornerSize, pageHeight], [0, pageHeight - cornerSize])
       .fill();
    
    // Bottom right corner
    doc.polygon([pageWidth, pageHeight], [pageWidth - cornerSize, pageHeight], [pageWidth, pageHeight - cornerSize])
       .fill();
    
    doc.restore();
  }

  /**
   * Add security features
   */
  addSecurityFeatures(doc, ticketData, orderData, pageWidth, pageHeight) {
    // Watermark
    doc.save();
    doc.fillColor(this.colors.primary)
       .opacity(0.02)
       .fontSize(72)
       .font('Helvetica-Bold')
       .text('A LO CUBANO', 0, pageHeight / 2 - 36, { 
         width: pageWidth, 
         align: 'center',
         angle: -45 
       });
    doc.restore();

    // Security hash in footer
    const securityHash = crypto.createHash('sha256')
      .update(`${ticketData.ticketId}:${orderData.orderId}:${process.env.TICKET_SECRET || 'secret'}`)
      .digest('hex')
      .substring(0, 12)
      .toUpperCase();

    doc.fillColor(this.colors.muted)
       .fontSize(8)
       .font('Helvetica')
       .text(`Security Code: ${securityHash}`, 40, pageHeight - 20);

    // Generation timestamp
    doc.text(`Generated: ${new Date().toISOString()}`, pageWidth - 200, pageHeight - 20);
  }

  /**
   * Generate QR code data with security checksum
   */
  async generateQRData(ticketData, orderData) {
    const timestamp = new Date().toISOString();
    const checksum = crypto.createHash('sha256')
      .update(`${ticketData.ticketId}:${orderData.orderId}:${orderData.customerEmail}:${process.env.TICKET_SECRET || 'secret'}`)
      .digest('hex')
      .substring(0, 16);

    return {
      version: '1.0',
      ticketId: ticketData.ticketId,
      orderId: orderData.orderId,
      customerEmail: orderData.customerEmail,
      ticketType: ticketData.type || 'Festival Pass',
      eventDate: '2026-05-15',
      venue: 'Avalon Ballroom',
      festivalName: 'A Lo Cubano Boulder Fest',
      checksum: checksum,
      generated: timestamp,
      validUntil: '2026-05-18T23:59:59Z'
    };
  }

  /**
   * Validate QR code data
   */
  validateQRData(qrData) {
    try {
      const data = JSON.parse(qrData);
      
      // Check required fields
      const requiredFields = ['ticketId', 'orderId', 'customerEmail', 'checksum'];
      if (!requiredFields.every(field => data[field])) {
        return { valid: false, reason: 'Missing required fields' };
      }

      // Verify checksum
      const expectedChecksum = crypto.createHash('sha256')
        .update(`${data.ticketId}:${data.orderId}:${data.customerEmail}:${process.env.TICKET_SECRET || 'secret'}`)
        .digest('hex')
        .substring(0, 16);

      if (data.checksum !== expectedChecksum) {
        return { valid: false, reason: 'Invalid security checksum' };
      }

      // Check expiration
      if (new Date() > new Date(data.validUntil)) {
        return { valid: false, reason: 'Ticket expired' };
      }

      return { valid: true, data };
    } catch (error) {
      return { valid: false, reason: 'Invalid QR code format' };
    }
  }

  /**
   * Generate ticket preview (smaller size for email thumbnails)
   */
  async generatePreview(ticketData, orderData) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          size: [400, 300], // Smaller preview size
          margin: 20 
        });
        
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Simple preview design
        doc.fillColor(this.colors.primary)
           .fontSize(24)
           .font('Helvetica-Bold')
           .text('A LO CUBANO', 20, 20, { align: 'center', width: 360 });

        doc.fillColor(this.colors.text)
           .fontSize(16)
           .text('Boulder Fest 2026', 20, 50, { align: 'center', width: 360 });

        doc.fontSize(12)
           .text(`Ticket: ${ticketData.ticketId}`, 20, 80)
           .text(`Order: ${orderData.orderId}`, 20, 100)
           .text(`Attendee: ${orderData.customerName}`, 20, 120);

        doc.fillColor(this.colors.primary)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('¡Nos vemos en la pista!', 20, 260, { align: 'center', width: 360 });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = PDFTicketGenerator;