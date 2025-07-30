/**
 * Email Service Usage Examples
 * Demonstrates how to use the email service integration
 */

const emailService = require('./index');

/**
 * Example: Send Receipt Email with Tickets
 */
async function sendReceiptExample() {
  try {
    const orderData = {
      orderId: 'ALB-2026-001',
      customerName: 'Maria Rodriguez',
      customerEmail: 'maria@example.com',
      amount: 299.99,
      paymentMethod: 'Credit Card',
      createdAt: new Date().toISOString(),
      tickets: [
        {
          ticketId: 'TKT-ALB-001',
          type: 'Festival Pass',
          price: 149.99
        },
        {
          ticketId: 'TKT-ALB-002',
          type: 'Workshop Only',
          price: 149.99
        }
      ]
    };

    const result = await emailService.sendReceiptEmail(orderData);
    console.log('Receipt email sent:', result);
  } catch (error) {
    console.error('Failed to send receipt email:', error);
  }
}

/**
 * Example: Send Payment Failure Email
 */
async function sendPaymentFailureExample() {
  try {
    const orderData = {
      orderId: 'ALB-2026-002',
      customerName: 'Carlos Martinez',
      customerEmail: 'carlos@example.com',
      amount: 199.99,
      paymentMethod: 'Credit Card'
    };

    const failureReason = 'Your card was declined. Please check with your bank or try a different payment method.';

    const result = await emailService.sendPaymentFailureEmail(orderData, failureReason);
    console.log('Payment failure email sent:', result);
  } catch (error) {
    console.error('Failed to send payment failure email:', error);
  }
}

/**
 * Example: Send Refund Confirmation Email
 */
async function sendRefundExample() {
  try {
    const orderData = {
      orderId: 'ALB-2026-003',
      customerName: 'Ana Gonzalez',
      customerEmail: 'ana@example.com',
      amount: 299.99
    };

    const refundData = {
      refundId: 'REF-ALB-001',
      amount: 299.99,
      refundDate: new Date().toISOString(),
      processingTime: '3-5 business days'
    };

    const result = await emailService.sendRefundConfirmationEmail(orderData, refundData);
    console.log('Refund confirmation email sent:', result);
  } catch (error) {
    console.error('Failed to send refund confirmation email:', error);
  }
}

/**
 * Example: Generate Ticket PDF
 */
async function generateTicketExample() {
  try {
    const ticketData = {
      ticketId: 'TKT-ALB-004',
      type: 'VIP Festival Pass',
      price: 399.99
    };

    const orderData = {
      orderId: 'ALB-2026-004',
      customerName: 'Diego Fernandez',
      customerEmail: 'diego@example.com',
      createdAt: new Date().toISOString()
    };

    const pdfBuffer = await emailService.generateTicketPDF(ticketData, orderData);
    
    // Save to file for testing
    const fs = require('fs').promises;
    await fs.writeFile(`./ticket-${ticketData.ticketId}.pdf`, pdfBuffer);
    
    console.log('Ticket PDF generated successfully');
  } catch (error) {
    console.error('Failed to generate ticket PDF:', error);
  }
}

/**
 * Example: Generate Ticket Bundle
 */
async function generateTicketBundleExample() {
  try {
    const tickets = [
      { ticketId: 'TKT-ALB-005', type: 'Festival Pass', price: 149.99 },
      { ticketId: 'TKT-ALB-006', type: 'Festival Pass', price: 149.99 },
      { ticketId: 'TKT-ALB-007', type: 'Workshop Only', price: 99.99 }
    ];

    const orderData = {
      orderId: 'ALB-2026-005',
      customerName: 'Isabella Torres',
      customerEmail: 'isabella@example.com',
      createdAt: new Date().toISOString()
    };

    const pdfBuffer = await emailService.generateTicketBundle(tickets, orderData);
    
    // Save to file for testing
    const fs = require('fs').promises;
    await fs.writeFile(`./ticket-bundle-${orderData.orderId}.pdf`, pdfBuffer);
    
    console.log('Ticket bundle PDF generated successfully');
  } catch (error) {
    console.error('Failed to generate ticket bundle PDF:', error);
  }
}

/**
 * Example: Send Custom Email Using Template
 */
async function sendCustomEmailExample() {
  try {
    const templateData = {
      customerName: 'Roberto Silva',
      eventDate: '2026-05-15',
      specialMessage: 'Get ready for an incredible weekend of Cuban salsa!'
    };

    const result = await emailService.sendCustomEmail(
      'roberto@example.com',
      '🕺 Welcome to A Lo Cubano Boulder Fest!',
      'welcome',
      templateData,
      { language: 'en' }
    );

    console.log('Custom email sent:', result);
  } catch (error) {
    console.error('Failed to send custom email:', error);
  }
}

/**
 * Example: Send Bulk Marketing Emails
 */
async function sendBulkEmailsExample() {
  try {
    const recipients = [
      {
        name: 'Maria Rodriguez',
        email: 'maria@example.com',
        data: { preferredLanguage: 'es', lastEvent: '2025' }
      },
      {
        name: 'John Smith',
        email: 'john@example.com',
        data: { preferredLanguage: 'en', lastEvent: 'never' }
      },
      {
        name: 'Carmen Lopez',
        email: 'carmen@example.com',
        data: { preferredLanguage: 'es', lastEvent: '2024' }
      }
    ];

    const templateData = {
      eventDate: 'May 15-17, 2026',
      earlyBirdDiscount: '25%',
      registrationUrl: 'https://alocubanoboulderfest.com/register'
    };

    const result = await emailService.sendBulkEmails(
      recipients,
      '🎵 Early Bird Special - A Lo Cubano Boulder Fest 2026',
      'early-bird-campaign',
      templateData,
      {
        batchSize: 50,
        delay: 2000, // 2 seconds between batches
        language: 'en'
      }
    );

    console.log('Bulk email campaign results:', result);
  } catch (error) {
    console.error('Failed to send bulk emails:', error);
  }
}

/**
 * Example: Validate QR Code
 */
async function validateQRCodeExample() {
  try {
    // Sample QR code data (would normally come from scanning)
    const qrData = JSON.stringify({
      version: '1.0',
      ticketId: 'TKT-ALB-008',
      orderId: 'ALB-2026-006',
      customerEmail: 'test@example.com',
      ticketType: 'Festival Pass',
      eventDate: '2026-05-15',
      venue: 'Avalon Ballroom',
      festivalName: 'A Lo Cubano Boulder Fest',
      checksum: 'abc123def456',
      generated: new Date().toISOString(),
      validUntil: '2026-05-18T23:59:59Z'
    });

    const validation = emailService.validateTicketQR(qrData);
    
    if (validation.valid) {
      console.log('✅ QR code is valid:', validation.data);
    } else {
      console.log('❌ QR code is invalid:', validation.reason);
    }
  } catch (error) {
    console.error('Failed to validate QR code:', error);
  }
}

/**
 * Example: Health Check
 */
async function healthCheckExample() {
  try {
    const health = await emailService.healthCheck();
    console.log('Email service health:', JSON.stringify(health, null, 2));
  } catch (error) {
    console.error('Health check failed:', error);
  }
}

/**
 * Example: Get Service Statistics
 */
async function getStatsExample() {
  try {
    const stats = emailService.getStats();
    console.log('Email service statistics:', JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Failed to get stats:', error);
  }
}

/**
 * Integration with Payment Webhooks Example
 */
async function paymentWebhookIntegrationExample() {
  // This would typically be called from your webhook handler
  
  const handlePaymentSuccess = async (paymentData) => {
    try {
      console.log('Processing successful payment:', paymentData.orderId);
      
      // Send receipt email with tickets
      await emailService.sendReceiptEmail({
        orderId: paymentData.orderId,
        customerName: paymentData.customerName,
        customerEmail: paymentData.customerEmail,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        createdAt: paymentData.createdAt,
        tickets: paymentData.tickets
      });
      
      console.log('✅ Receipt email sent for successful payment');
    } catch (error) {
      console.error('❌ Failed to process payment success:', error);
    }
  };

  const handlePaymentFailure = async (paymentData, error) => {
    try {
      console.log('Processing failed payment:', paymentData.orderId);
      
      // Send payment failure email
      await emailService.sendPaymentFailureEmail(
        {
          orderId: paymentData.orderId,
          customerName: paymentData.customerName,
          customerEmail: paymentData.customerEmail,
          amount: paymentData.amount
        },
        error.message
      );
      
      console.log('✅ Payment failure email sent');
    } catch (error) {
      console.error('❌ Failed to process payment failure:', error);
    }
  };

  const handleRefundProcessed = async (refundData) => {
    try {
      console.log('Processing refund:', refundData.refundId);
      
      // Send refund confirmation email
      await emailService.sendRefundConfirmationEmail(
        {
          orderId: refundData.originalOrderId,
          customerName: refundData.customerName,
          customerEmail: refundData.customerEmail
        },
        {
          refundId: refundData.refundId,
          amount: refundData.amount,
          refundDate: refundData.processedAt
        }
      );
      
      console.log('✅ Refund confirmation email sent');
    } catch (error) {
      console.error('❌ Failed to process refund confirmation:', error);
    }
  };

  // Example webhook data
  const successfulPayment = {
    orderId: 'ALB-2026-WEBHOOK-001',
    customerName: 'Webhook Test User',
    customerEmail: 'webhook@example.com',
    amount: 199.99,
    paymentMethod: 'Credit Card',
    createdAt: new Date().toISOString(),
    tickets: [
      { ticketId: 'TKT-WEBHOOK-001', type: 'Festival Pass', price: 199.99 }
    ]
  };

  // Simulate webhook calls
  await handlePaymentSuccess(successfulPayment);
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 Running Email Service Examples...\n');

  try {
    // Initialize the email service
    await emailService.initialize();
    console.log('✅ Email service initialized\n');

    // Run examples
    console.log('📧 Sending receipt email example...');
    await sendReceiptExample();
    
    console.log('\n📧 Sending payment failure email example...');
    await sendPaymentFailureExample();
    
    console.log('\n📧 Sending refund confirmation email example...');
    await sendRefundExample();
    
    console.log('\n🎫 Generating ticket PDF example...');
    await generateTicketExample();
    
    console.log('\n🎫 Generating ticket bundle PDF example...');
    await generateTicketBundleExample();
    
    console.log('\n✅ Validating QR code example...');
    await validateQRCodeExample();
    
    console.log('\n🏥 Health check example...');
    await healthCheckExample();
    
    console.log('\n📊 Statistics example...');
    await getStatsExample();
    
    console.log('\n🔗 Payment webhook integration example...');
    await paymentWebhookIntegrationExample();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Export examples for testing
module.exports = {
  sendReceiptExample,
  sendPaymentFailureExample,
  sendRefundExample,
  generateTicketExample,
  generateTicketBundleExample,
  sendCustomEmailExample,
  sendBulkEmailsExample,
  validateQRCodeExample,
  healthCheckExample,
  getStatsExample,
  paymentWebhookIntegrationExample,
  runAllExamples
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}