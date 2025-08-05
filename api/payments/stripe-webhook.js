/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events for payment status updates
 */

import Stripe from 'stripe';
import { openDb } from '../lib/database.js';
import { getBrevoService } from '../lib/brevo-service.js';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// For Vercel, we need the raw body for webhook verification
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper to get raw body
async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let event;
    let rawBody;

    try {
        // Get raw body for signature verification
        rawBody = await getRawBody(req);
        const sig = req.headers['stripe-signature'];

        if (!sig) {
            console.error('No Stripe signature found in headers');
            return res.status(400).json({ error: 'No signature provided' });
        }

        // Verify webhook signature
        try {
            event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({ error: `Webhook Error: ${err.message}` });
        }

    } catch (error) {
        console.error('Error processing webhook body:', error);
        return res.status(400).json({ error: 'Invalid request body' });
    }

    // Process the event
    try {
        const db = await openDb();
        const brevoService = getBrevoService();

        console.log(`Processing webhook event: ${event.type}`);

        switch (event.type) {
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                
                // Update order status to paid
                const result = await db.run(`
                    UPDATE orders 
                    SET fulfillment_status = 'paid', 
                        updated_at = datetime('now')
                    WHERE stripe_payment_intent_id = ?
                `, [paymentIntent.id]);

                if (result.changes > 0) {
                    // Get order details for email
                    const order = await db.get(`
                        SELECT * FROM orders 
                        WHERE stripe_payment_intent_id = ?
                    `, [paymentIntent.id]);

                    if (order) {
                        console.log(`Payment succeeded for order: ${order.id}`);
                        
                        // Parse order details
                        const orderDetails = JSON.parse(order.order_details);
                        
                        // Prepare email data
                        const emailData = {
                            email: order.customer_email,
                            templateId: process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID || 2, // Default template ID
                            params: {
                                customerName: order.customer_name,
                                orderId: order.id,
                                orderType: order.order_type,
                                totalAmount: (order.order_total / 100).toFixed(2), // Convert cents to dollars
                                orderDetails: orderDetails,
                                paymentDate: new Date().toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })
                            }
                        };

                        // Send confirmation email
                        try {
                            await brevoService.sendTransactionalEmail(
                                emailData.email,
                                emailData.templateId,
                                emailData.params
                            );
                            console.log(`Confirmation email sent to ${order.customer_email}`);
                        } catch (emailError) {
                            console.error('Failed to send confirmation email:', emailError);
                            // Don't fail the webhook if email fails
                        }
                    }
                } else {
                    console.warn(`No order found for payment intent: ${paymentIntent.id}`);
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object;
                
                // Update order status to failed
                const result = await db.run(`
                    UPDATE orders 
                    SET fulfillment_status = 'failed', 
                        updated_at = datetime('now')
                    WHERE stripe_payment_intent_id = ?
                `, [paymentIntent.id]);

                if (result.changes > 0) {
                    console.log(`Payment failed for payment intent: ${paymentIntent.id}`);
                    
                    // Get order details
                    const order = await db.get(`
                        SELECT customer_email, customer_name 
                        FROM orders 
                        WHERE stripe_payment_intent_id = ?
                    `, [paymentIntent.id]);

                    if (order) {
                        // Optionally send failure notification email
                        console.log(`Payment failed for customer: ${order.customer_email}`);
                    }
                }
                break;
            }

            case 'payment_intent.canceled': {
                const paymentIntent = event.data.object;
                
                // Update order status to cancelled
                await db.run(`
                    UPDATE orders 
                    SET fulfillment_status = 'cancelled', 
                        updated_at = datetime('now')
                    WHERE stripe_payment_intent_id = ?
                `, [paymentIntent.id]);

                console.log(`Payment cancelled for payment intent: ${paymentIntent.id}`);
                break;
            }

            case 'charge.refunded': {
                const charge = event.data.object;
                
                // Update order status to refunded
                await db.run(`
                    UPDATE orders 
                    SET fulfillment_status = 'refunded', 
                        updated_at = datetime('now')
                    WHERE stripe_payment_intent_id = ?
                `, [charge.payment_intent]);

                console.log(`Refund processed for payment intent: ${charge.payment_intent}`);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        // Return 200 to acknowledge receipt of the event
        res.status(200).json({ received: true });

    } catch (error) {
        console.error('Webhook processing error:', error);
        // Return 200 anyway to prevent Stripe from retrying
        res.status(200).json({ 
            received: true, 
            error: 'Processing error logged' 
        });
    }
}