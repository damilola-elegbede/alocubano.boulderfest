#!/usr/bin/env node

import 'dotenv/config';

const BREVO_API_KEY = process.env.BREVO_API_KEY;

if (!BREVO_API_KEY) {
  console.error('❌ BREVO_API_KEY not found in environment variables');
  process.exit(1);
}

async function testBrevoEmail() {
  const emailData = {
    to: [{ email: 'damilola.elegbede@gmail.com', name: 'Test User' }],
    templateId: 10,
    params: {
      ORDER_NUMBER: 'TEST-2025-90004',
      CUSTOMER_NAME: 'Test User',
      EVENT_DATE: '2026-05-15',
      TOTAL_AMOUNT: '225.00',
      REGISTRATION_URL: 'https://preview.alocubanoboulderfest.com/registration/test-token',
      TICKET_COUNT: '2',
      TICKETS: [
        {
          type: '3-Day Pass',
          quantity: 1,
          price: '$125.00'
        },
        {
          type: 'Single Day Pass - Saturday',
          quantity: 1,
          price: '$100.00'
        }
      ]
    }
  };

  console.log('📧 Testing Brevo email send...');
  console.log('API Key:', BREVO_API_KEY.substring(0, 10) + '...');
  console.log('Request payload:', JSON.stringify(emailData, null, 2));

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify(emailData)
    });

    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response body:', responseText);

    if (!response.ok) {
      console.error('❌ Email send failed:', response.status, responseText);
      return;
    }

    const result = JSON.parse(responseText);
    console.log('✅ Email sent successfully!', result);
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
}

// Run the test
testBrevoEmail();