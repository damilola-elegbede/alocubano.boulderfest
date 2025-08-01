const sgMail = require('@sendgrid/mail');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * Email Service for A Lo Cubano Boulder Fest
 * Handles transactional emails with SendGrid integration
 */
class EmailService {
  constructor() {
    this.initialized = false;
    this.templates = new Map();
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second base delay
    
    // Email configuration
    this.config = {
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@alocubanoboulderfest.com',
        name: 'A Lo Cubano Boulder Fest'
      },
      replyTo: process.env.FESTIVAL_EMAIL || 'alocubanoboulderfest@gmail.com'
    };
  }

  /**
   * Initialize the email service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Configure SendGrid
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey) {
        throw new Error('SENDGRID_API_KEY environment variable is required');
      }
      
      sgMail.setApiKey(apiKey);
      
      // Load email templates
      await this.loadTemplates();
      
      this.initialized = true;
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error);
      throw error;
    }
  }

  /**
   * Load and compile Handlebars templates
   */
  async loadTemplates() {
    const templateDir = path.join(__dirname, 'templates');
    
    try {
      const templateFiles = await fs.readdir(templateDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.hbs')) {
          const templateName = file.replace('.hbs', '');
          const templatePath = path.join(templateDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          
          this.templates.set(templateName, handlebars.compile(templateContent));
          console.log(`📧 Loaded email template: ${templateName}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Template directory not found, using inline templates');
      this.loadInlineTemplates();
    }
  }

  /**
   * Load inline templates as fallback
   */
  loadInlineTemplates() {
    const receiptTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Receipt - A Lo Cubano Boulder Fest</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:wght@400;600;700&display=swap');
          body { font-family: 'Open Sans', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #d32f2f, #c62828); color: white; padding: 40px 30px; text-align: center; }
          .logo { font-family: 'Bebas Neue', cursive; font-size: 48px; margin-bottom: 10px; letter-spacing: 3px; }
          .tagline { font-size: 16px; opacity: 0.9; }
          .content { padding: 40px 30px; }
          .title { font-family: 'Bebas Neue', cursive; font-size: 32px; color: #d32f2f; margin-bottom: 20px; }
          .receipt-details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .footer { background: #2c2c2c; color: white; padding: 30px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">A LO CUBANO</div>
            <div class="tagline">Boulder Fest 2026</div>
          </div>
          <div class="content">
            <h1 class="title">¡Gracias por tu compra!</h1>
            <p>Hi {{customerName}},</p>
            <p>Your payment has been processed successfully. Here are your purchase details:</p>
            
            <div class="receipt-details">
              <div class="detail-row">
                <strong>Order ID:</strong>
                <span>{{orderId}}</span>
              </div>
              <div class="detail-row">
                <strong>Payment Method:</strong>
                <span>{{paymentMethod}}</span>  
              </div>
              <div class="detail-row">
                <strong>Amount:</strong>
                <span>\${{amount}}</span>
              </div>
              <div class="detail-row">
                <strong>Transaction Date:</strong>
                <span>{{transactionDate}}</span>
              </div>
            </div>
            
            {{#if tickets}}
            <h2 class="title">Your Tickets</h2>
            <p>Your festival tickets are attached to this email. Please save them to your device and bring them to the event.</p>
            {{/if}}
            
            <p>We can't wait to see you dancing at A Lo Cubano Boulder Fest!</p>
            <p><strong>¡Nos vemos en la pista!</strong></p>
          </div>
          <div class="footer">
            <p>A Lo Cubano Boulder Fest | May 15-17, 2026</p>
            <p>Avalon Ballroom, 6185 Arapahoe Rd, Boulder, CO</p>
            <p>Questions? Contact us at alocubanoboulderfest@gmail.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    this.templates.set('receipt', handlebars.compile(receiptTemplate));
  }

  /**
   * Send receipt email with ticket attachments
   */
  async sendReceiptEmail(orderData) {
    await this.ensureInitialized();
    
    try {
      const template = this.templates.get('receipt');
      if (!template) {
        throw new Error('Receipt template not found');
      }

      const emailData = {
        customerName: orderData.customerName || 'Festival Friend',
        orderId: orderData.orderId,
        paymentMethod: orderData.paymentMethod || 'Credit Card',
        amount: orderData.amount,
        transactionDate: new Date(orderData.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        tickets: orderData.tickets && orderData.tickets.length > 0
      };

      const htmlContent = template(emailData);
      
      const mailOptions = {
        to: orderData.customerEmail,
        from: this.config.from,
        replyTo: this.config.replyTo,
        subject: `🎵 Payment Confirmation - A Lo Cubano Boulder Fest`,
        html: htmlContent,
        attachments: []
      };

      // Generate and attach tickets if available
      if (orderData.tickets && orderData.tickets.length > 0) {
        for (const ticket of orderData.tickets) {
          const pdfBuffer = await this.generateTicketPDF(ticket, orderData);
          mailOptions.attachments.push({
            content: pdfBuffer.toString('base64'),
            filename: `ticket-${ticket.ticketId}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment'
          });
        }
      }

      return await this.sendEmailWithRetry(mailOptions);
    } catch (error) {
      console.error('❌ Failed to send receipt email:', error);
      throw error;
    }
  }

  /**
   * Send payment failure notification
   */
  async sendPaymentFailureEmail(orderData, failureReason) {
    await this.ensureInitialized();
    
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:wght@400;600;700&display=swap');
            body { font-family: 'Open Sans', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #d32f2f, #c62828); color: white; padding: 40px 30px; text-align: center; }
            .logo { font-family: 'Bebas Neue', cursive; font-size: 48px; margin-bottom: 10px; letter-spacing: 3px; }
            .content { padding: 40px 30px; }
            .title { font-family: 'Bebas Neue', cursive; font-size: 32px; color: #d32f2f; margin-bottom: 20px; }
            .retry-button { background: #d32f2f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">A LO CUBANO</div>
              <div>Boulder Fest 2026</div>
            </div>
            <div class="content">
              <h1 class="title">Payment Issue</h1>
              <p>Hi ${orderData.customerName || 'Festival Friend'},</p>
              <p>We encountered an issue processing your payment for A Lo Cubano Boulder Fest.</p>
              <p><strong>Issue:</strong> ${failureReason}</p>
              <p>Don't worry - you can try again using the link below:</p>
              <a href="${process.env.FESTIVAL_URL}/checkout?retry=${orderData.orderId}" class="retry-button">Try Payment Again</a>
              <p>If you continue to experience issues, please contact us at alocubanoboulderfest@gmail.com</p>
              <p>We're here to help!</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        to: orderData.customerEmail,
        from: this.config.from,
        replyTo: this.config.replyTo,
        subject: `Payment Issue - A Lo Cubano Boulder Fest`,
        html: htmlContent
      };

      return await this.sendEmailWithRetry(mailOptions);
    } catch (error) {
      console.error('❌ Failed to send payment failure email:', error);
      throw error;
    }
  }

  /**
   * Send refund confirmation email
   */
  async sendRefundConfirmationEmail(orderData, refundData) {
    await this.ensureInitialized();
    
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:wght@400;600;700&display=swap');
            body { font-family: 'Open Sans', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #d32f2f, #c62828); color: white; padding: 40px 30px; text-align: center; }
            .logo { font-family: 'Bebas Neue', cursive; font-size: 48px; margin-bottom: 10px; letter-spacing: 3px; }
            .content { padding: 40px 30px; }
            .title { font-family: 'Bebas Neue', cursive; font-size: 32px; color: #d32f2f; margin-bottom: 20px; }
            .refund-details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">A LO CUBANO</div>
              <div>Boulder Fest 2026</div>
            </div>
            <div class="content">
              <h1 class="title">Refund Processed</h1>
              <p>Hi ${orderData.customerName || 'Festival Friend'},</p>
              <p>Your refund has been processed successfully.</p>
              
              <div class="refund-details">
                <div class="detail-row">
                  <strong>Refund ID:</strong>
                  <span>${refundData.refundId}</span>
                </div>
                <div class="detail-row">
                  <strong>Original Order:</strong>
                  <span>${orderData.orderId}</span>
                </div>
                <div class="detail-row">
                  <strong>Refund Amount:</strong>
                  <span>$${refundData.amount}</span>
                </div>
                <div class="detail-row">
                  <strong>Processing Time:</strong>
                  <span>3-5 business days</span>
                </div>
              </div>
              
              <p>The refund will appear on your original payment method within 3-5 business days.</p>
              <p>We're sorry to see you won't be joining us this time. ¡Esperamos verte pronto!</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        to: orderData.customerEmail,
        from: this.config.from,
        replyTo: this.config.replyTo,
        subject: `Refund Confirmation - A Lo Cubano Boulder Fest`,
        html: htmlContent
      };

      return await this.sendEmailWithRetry(mailOptions);
    } catch (error) {
      console.error('❌ Failed to send refund confirmation email:', error);
      throw error;
    }
  }

  /**
   * Generate PDF ticket with QR code
   */
  async generateTicketPDF(ticket, orderData) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Generate QR code for ticket validation
        const qrData = {
          ticketId: ticket.ticketId,
          orderId: orderData.orderId,
          customerEmail: orderData.customerEmail,
          eventDate: '2026-05-15',
          checksum: crypto.createHash('sha256')
            .update(`${ticket.ticketId}:${orderData.orderId}:${process.env.TICKET_SECRET || 'secret'}`)
            .digest('hex').substring(0, 8)
        };
        
        const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData));
        const qrImageBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

        // Header with festival branding
        doc.fillColor('#d32f2f')
           .fontSize(48)
           .font('Helvetica-Bold')
           .text('A LO CUBANO', 40, 40);
           
        doc.fillColor('#333')
           .fontSize(24)
           .font('Helvetica')
           .text('BOULDER FEST 2026', 40, 95);

        // Event details
        doc.fillColor('#d32f2f')
           .fontSize(20)
           .font('Helvetica-Bold')
           .text('May 15-17, 2026', 40, 140);
           
        doc.fillColor('#333')
           .fontSize(14)
           .font('Helvetica')
           .text('Avalon Ballroom', 40, 170)
           .text('6185 Arapahoe Rd, Boulder, CO', 40, 190);

        // Ticket information
        doc.fillColor('#d32f2f')
           .fontSize(18)
           .font('Helvetica-Bold')
           .text('TICKET INFORMATION', 40, 240);

        doc.fillColor('#333')
           .fontSize(12)
           .font('Helvetica')
           .text(`Ticket Type: ${ticket.type || 'Festival Pass'}`, 40, 270)
           .text(`Ticket ID: ${ticket.ticketId}`, 40, 290)
           .text(`Order ID: ${orderData.orderId}`, 40, 310)
           .text(`Attendee: ${orderData.customerName}`, 40, 330)
           .text(`Email: ${orderData.customerEmail}`, 40, 350);

        // QR Code
        doc.image(qrImageBuffer, 400, 240, { width: 120, height: 120 });
        
        doc.fillColor('#666')
           .fontSize(10)
           .font('Helvetica')
           .text('Scan at venue entrance', 400, 370, { width: 120, align: 'center' });

        // Important information
        doc.fillColor('#d32f2f')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('IMPORTANT INFORMATION', 40, 420);

        doc.fillColor('#333')
           .fontSize(11)
           .font('Helvetica')
           .text('• Please bring this ticket (digital or printed) to the event', 40, 450)
           .text('• Check-in opens 1 hour before first workshop', 40, 470)
           .text('• This ticket is non-transferable and non-refundable', 40, 490)
           .text('• For questions: alocubanoboulderfest@gmail.com', 40, 510);

        // Footer
        doc.fillColor('#d32f2f')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('¡NOS VEMOS EN LA PISTA!', 40, 560, { width: 520, align: 'center' });

        doc.fillColor('#666')
           .fontSize(10)
           .font('Helvetica')
           .text('www.alocubanoboulderfest.com | @alocubano.boulderfest', 40, 590, { width: 520, align: 'center' });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send email with retry logic and exponential backoff
   */
  async sendEmailWithRetry(mailOptions, attempt = 1) {
    try {
      const result = await sgMail.send(mailOptions);
      console.log(`✅ Email sent successfully to ${mailOptions.to}`);
      return result;
    } catch (error) {
      console.error(`❌ Email send attempt ${attempt} failed:`, error);
      
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendEmailWithRetry(mailOptions, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Validate email address format
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Track email delivery status
   */
  async trackDelivery(messageId) {
    // Implementation for SendGrid webhook handling
    // This would typically involve storing delivery status in database
    console.log(`📧 Tracking delivery for message: ${messageId}`);
  }
}

module.exports = EmailService;