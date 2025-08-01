const EmailService = require('./service');
const PDFTicketGenerator = require('./pdf-generator');
const TemplateEngine = require('./template-engine');

/**
 * Email Service Integration Module
 * Main entry point for all email functionality
 */
class EmailServiceIntegration {
  constructor() {
    this.emailService = new EmailService();
    this.pdfGenerator = new PDFTicketGenerator();
    this.templateEngine = new TemplateEngine();
    this.initialized = false;
  }

  /**
   * Initialize all email services
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log('🚀 Initializing email service integration...');
      
      // Initialize all components in parallel
      await Promise.all([
        this.emailService.initialize(),
        this.templateEngine.initialize()
      ]);

      this.initialized = true;
      console.log('✅ Email service integration initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize email service integration:', error);
      throw error;
    }
  }

  /**
   * Send receipt email with tickets
   */
  async sendReceiptEmail(orderData) {
    await this.ensureInitialized();
    
    try {
      console.log(`📧 Sending receipt email to ${orderData.customerEmail}`);
      
      // Generate PDF tickets if tickets exist
      if (orderData.tickets && orderData.tickets.length > 0) {
        const ticketPDFs = [];
        
        for (const ticket of orderData.tickets) {
          const pdfBuffer = await this.pdfGenerator.generateTicket(ticket, orderData);
          ticketPDFs.push({
            content: pdfBuffer.toString('base64'),
            filename: `ticket-${ticket.ticketId}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment'
          });
        }
        
        // Add PDFs to order data for email service
        orderData.attachments = ticketPDFs;
      }

      const result = await this.emailService.sendReceiptEmail(orderData);
      console.log('✅ Receipt email sent successfully');
      return result;
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
      console.log(`📧 Sending payment failure email to ${orderData.customerEmail}`);
      
      const result = await this.emailService.sendPaymentFailureEmail(orderData, failureReason);
      console.log('✅ Payment failure email sent successfully');
      return result;
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
      console.log(`📧 Sending refund confirmation email to ${orderData.customerEmail}`);
      
      const result = await this.emailService.sendRefundConfirmationEmail(orderData, refundData);
      console.log('✅ Refund confirmation email sent successfully');
      return result;
    } catch (error) {
      console.error('❌ Failed to send refund confirmation email:', error);
      throw error;
    }
  }

  /**
   * Generate ticket PDF
   */
  async generateTicketPDF(ticketData, orderData) {
    try {
      console.log(`🎫 Generating PDF ticket for ${ticketData.ticketId}`);
      
      const pdfBuffer = await this.pdfGenerator.generateTicket(ticketData, orderData);
      console.log('✅ PDF ticket generated successfully');
      return pdfBuffer;
    } catch (error) {
      console.error('❌ Failed to generate PDF ticket:', error);
      throw error;
    }
  }

  /**
   * Generate multiple tickets in bundle
   */
  async generateTicketBundle(tickets, orderData) {
    try {
      console.log(`🎫 Generating PDF ticket bundle for order ${orderData.orderId}`);
      
      const pdfBuffer = await this.pdfGenerator.generateTicketBundle(tickets, orderData);
      console.log('✅ PDF ticket bundle generated successfully');
      return pdfBuffer;
    } catch (error) {
      console.error('❌ Failed to generate PDF ticket bundle:', error);
      throw error;
    }
  }

  /**
   * Validate QR code data
   */
  validateTicketQR(qrData) {
    return this.pdfGenerator.validateQRData(qrData);
  }

  /**
   * Render email template
   */
  async renderTemplate(templateName, data, options = {}) {
    await this.ensureInitialized();
    
    try {
      return await this.templateEngine.render(templateName, data, options);
    } catch (error) {
      console.error(`❌ Failed to render template '${templateName}':`, error);
      throw error;
    }
  }

  /**
   * Send custom email using template
   */
  async sendCustomEmail(to, subject, templateName, templateData, options = {}) {
    await this.ensureInitialized();
    
    try {
      console.log(`📧 Sending custom email to ${to} using template '${templateName}'`);
      
      const htmlContent = await this.templateEngine.render(templateName, templateData, options);
      
      const mailOptions = {
        to: to,
        from: this.emailService.config.from,
        replyTo: this.emailService.config.replyTo,
        subject: subject,
        html: htmlContent,
        attachments: options.attachments || []
      };

      const result = await this.emailService.sendEmailWithRetry(mailOptions);
      console.log('✅ Custom email sent successfully');
      return result;
    } catch (error) {
      console.error('❌ Failed to send custom email:', error);
      throw error;
    }
  }

  /**
   * Send bulk emails (for marketing campaigns)
   */
  async sendBulkEmails(recipients, subject, templateName, templateData, options = {}) {
    await this.ensureInitialized();
    
    try {
      console.log(`📧 Sending bulk emails to ${recipients.length} recipients`);
      
      const results = [];
      const batchSize = options.batchSize || 100;
      const delay = options.delay || 1000; // 1 second between batches
      
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        console.log(`📧 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(recipients.length / batchSize)}`);
        
        const batchPromises = batch.map(async (recipient) => {
          try {
            // Personalize template data for each recipient
            const personalizedData = {
              ...templateData,
              ...recipient.data,
              customerName: recipient.name,
              customerEmail: recipient.email
            };
            
            return await this.sendCustomEmail(
              recipient.email,
              subject,
              templateName,
              personalizedData,
              options
            );
          } catch (error) {
            console.error(`❌ Failed to send email to ${recipient.email}:`, error);
            return { error: error.message, recipient: recipient.email };
          }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Delay between batches to avoid rate limiting
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      const successful = results.filter(r => r.status === 'fulfilled' && !r.value.error).length;
      const failed = results.length - successful;
      
      console.log(`✅ Bulk email campaign completed: ${successful} sent, ${failed} failed`);
      
      return {
        total: recipients.length,
        successful,
        failed,
        results
      };
    } catch (error) {
      console.error('❌ Failed to send bulk emails:', error);
      throw error;
    }
  }

  /**
   * Get email service statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      emailService: this.emailService.initialized,
      templateEngine: this.templateEngine.getStats(),
      availableTemplates: this.templateEngine.getAvailableTemplates()
    };
  }

  /**
   * Health check for all services
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {}
    };

    try {
      // Check email service
      health.services.emailService = {
        status: this.emailService.initialized ? 'healthy' : 'not_initialized'
      };

      // Check template engine
      health.services.templateEngine = {
        status: this.templateEngine.initialized ? 'healthy' : 'not_initialized',
        templates: this.templateEngine.templates.size
      };

      // Check environment variables
      health.services.environment = {
        status: process.env.SENDGRID_API_KEY ? 'configured' : 'missing_config',
        sendgridConfigured: !!process.env.SENDGRID_API_KEY,
        fromEmailConfigured: !!process.env.SENDGRID_FROM_EMAIL
      };

      // Overall status
      const allHealthy = Object.values(health.services).every(
        service => service.status === 'healthy' || service.status === 'configured'
      );
      
      health.status = allHealthy ? 'healthy' : 'degraded';
      
    } catch (error) {
      health.status = 'error';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Ensure all services are initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Create singleton instance
const emailServiceIntegration = new EmailServiceIntegration();

module.exports = emailServiceIntegration;