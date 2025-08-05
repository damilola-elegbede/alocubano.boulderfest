/**
 * Create Payment Intent API Endpoint
 * Handles Stripe payment intent creation and order storage
 */

import Stripe from 'stripe';
import { openDb } from '../lib/database.js';

// Initialize Stripe with API key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { 
            amount, 
            currency = 'usd',
            orderType, // 'tickets' or 'donation'
            orderDetails,
            customerInfo 
        } = req.body;

        // Validate required fields
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (!orderType || !['tickets', 'donation'].includes(orderType)) {
            return res.status(400).json({ error: 'Invalid order type' });
        }

        if (!orderDetails) {
            return res.status(400).json({ error: 'Order details required' });
        }

        if (!customerInfo?.email || !customerInfo?.firstName || !customerInfo?.lastName) {
            return res.status(400).json({ error: 'Customer information incomplete' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customerInfo.email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Create payment intent with Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                orderType,
                customerEmail: customerInfo.email,
                customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
                environment: process.env.NODE_ENV || 'development'
            },
            description: orderType === 'tickets' 
                ? `A Lo Cubano Boulder Fest - Ticket Purchase`
                : `A Lo Cubano Boulder Fest - Donation`
        });

        // Generate order ID
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Store order in database
        const db = await openDb();
        
        try {
            await db.run(`
                INSERT INTO orders (
                    id, 
                    stripe_payment_intent_id, 
                    customer_email, 
                    customer_name, 
                    customer_phone, 
                    order_type, 
                    order_details, 
                    order_total,
                    special_requests
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId,
                paymentIntent.id,
                customerInfo.email,
                `${customerInfo.firstName} ${customerInfo.lastName}`,
                customerInfo.phone || null,
                orderType,
                JSON.stringify(orderDetails),
                Math.round(amount * 100),
                customerInfo.specialRequests || null
            ]);

            console.log(`Order created: ${orderId} for ${customerInfo.email}`);
        } catch (dbError) {
            // If database insert fails, cancel the payment intent
            await stripe.paymentIntents.cancel(paymentIntent.id);
            console.error('Database error:', dbError);
            return res.status(500).json({ error: 'Failed to create order' });
        }

        // Return client secret and order info
        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            orderId,
            amount: amount,
            currency: currency
        });

    } catch (error) {
        console.error('Payment intent creation failed:', error);
        
        // Handle specific Stripe errors
        if (error.type === 'StripeCardError') {
            return res.status(400).json({ 
                error: 'Card error', 
                message: error.message 
            });
        } else if (error.type === 'StripeInvalidRequestError') {
            return res.status(400).json({ 
                error: 'Invalid request', 
                message: error.message 
            });
        } else if (error.type === 'StripeAPIError') {
            return res.status(500).json({ 
                error: 'Stripe API error', 
                message: 'Payment service temporarily unavailable' 
            });
        } else if (error.type === 'StripeConnectionError') {
            return res.status(500).json({ 
                error: 'Connection error', 
                message: 'Unable to connect to payment service' 
            });
        } else if (error.type === 'StripeAuthenticationError') {
            console.error('Stripe authentication error - check API keys');
            return res.status(500).json({ 
                error: 'Configuration error', 
                message: 'Payment service configuration error' 
            });
        } else {
            return res.status(500).json({ 
                error: 'Payment setup failed', 
                message: 'An unexpected error occurred' 
            });
        }
    }
}