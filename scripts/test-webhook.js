import fetch from 'node-fetch';

// Simulate a Stripe webhook event for testing
async function testWebhook() {
  const timestamp = Math.floor(Date.now() / 1000);
  const eventId = `evt_test_${timestamp}`;
  const sessionId = `cs_test_${timestamp}`;
  const paymentIntentId = `pi_test_${timestamp}`;

  const event = {
    id: eventId,
    type: 'checkout.session.completed',
    created: timestamp,
    data: {
      object: {
        id: sessionId,
        amount_total: 12500, // $125.00 in cents
        currency: 'usd',
        customer_email: 'test@example.com',
        customer_details: {
          email: 'test@example.com',
          name: 'Test User',
          address: {
            city: 'Boulder',
            country: 'US',
            line1: '123 Test St',
            line2: null,
            postal_code: '80301',
            state: 'CO'
          }
        },
        line_items: {
          data: [
            {
              description: 'Weekend Pass Ticket',
              amount_total: 12500,
              quantity: 1,
              price: {
                unit_amount: 12500,
                product: {
                  description: 'Full weekend access to A Lo Cubano Boulder Fest',
                  metadata: {
                    ticket_type: 'weekend-pass'
                  }
                }
              }
            }
          ]
        },
        metadata: {
          event_id: 'boulder-fest-2026',
          type: 'tickets',
          event_name: 'Boulder Fest 2026'
        },
        payment_intent: paymentIntentId,
        payment_method_types: ['card'],
        payment_status: 'paid',
        mode: 'payment'
      }
    }
  };

  try {
    console.log('🚀 Sending test webhook to http://localhost:3001/api/payments/stripe-webhook');
    console.log('Event ID:', eventId);
    console.log('Session ID:', sessionId);
    
    const response = await fetch('http://localhost:3001/api/payments/stripe-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Without a real signature, the webhook will process but won't verify
        'stripe-signature': 'test'
      },
      body: JSON.stringify(event)
    });

    const result = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', result);

    if (response.ok) {
      console.log('✅ Webhook processed successfully');
      console.log('\n📊 To check the results, run:');
      console.log('node scripts/check-webhooks.js');
    } else {
      console.log('❌ Webhook processing failed');
    }
  } catch (error) {
    console.error('Error sending webhook:', error.message);
    console.log('\n💡 Make sure the server is running:');
    console.log('npm start');
  }
}

testWebhook();