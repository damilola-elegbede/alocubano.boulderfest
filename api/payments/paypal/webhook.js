/**
 * PayPal Webhook Handler
 * Processes PayPal webhook events for payment status updates
 * Enhanced with comprehensive financial audit logging for compliance
 *
 * Supported Events:
 * - PAYMENT.CAPTURE.COMPLETED - Payment capture successful
 * - PAYMENT.CAPTURE.DENIED - Payment capture denied
 * - PAYMENT.CAPTURE.REFUNDED - Payment refund processed
 * - CHECKOUT.ORDER.APPROVED - Order approved by customer
 * - CHECKOUT.ORDER.COMPLETED - Order completed (alternative to capture)
 */

import crypto from 'crypto';
import transactionService from "../../../lib/transaction-service.js";
import { getDatabaseClient } from "../../../lib/database.js";
import auditService from "../../../lib/audit-service.js";
import { detectPaymentProcessor, extractPaymentSourceDetails } from "../../../lib/paypal-payment-source-detector.js";
import { diagnoseAuthError, getPayPalEnvironmentInfo } from "../../../lib/paypal-config-validator.js";

// PayPal webhook verification URL
const PAYPAL_API_URL = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';

// PayPal webhook configuration
if (!process.env.PAYPAL_WEBHOOK_ID) {
  console.warn('⚠️ WARNING: PAYPAL_WEBHOOK_ID not configured - webhook verification will be skipped');
}

// Helper to get PayPal access token for webhook verification
async function getPayPalAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    const env = getPayPalEnvironmentInfo();
    throw new Error(
      'PayPal credentials not configured. ' +
      `Current environment: ${env.mode}, API URL: ${env.apiUrl}. ` +
      'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Vercel environment variables.'
    );
  }

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const tokenResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!tokenResponse.ok) {
    // Use diagnostic utility to provide helpful error message
    const diagnosis = await diagnoseAuthError(tokenResponse);
    throw new Error(`Failed to authenticate with PayPal for webhook verification\n${diagnosis}`);
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

// Helper to verify PayPal webhook signature
async function verifyWebhookSignature(headers, body, webhookId) {
  if (!webhookId) {
    console.warn('PayPal webhook verification skipped - PAYPAL_WEBHOOK_ID not configured');
    return { verified: false, reason: 'webhook_id_not_configured' };
  }

  try {
    const accessToken = await getPayPalAccessToken();

    // Extract required headers for verification
    const authAlgo = headers['paypal-auth-algo'];
    const transmission_id = headers['paypal-transmission-id'];
    const cert_id = headers['paypal-cert-id'];
    const transmission_time = headers['paypal-transmission-time'];
    const webhook_signature = headers['paypal-auth-version'];
    const auth_version = headers['paypal-auth-version'];

    if (!authAlgo || !transmission_id || !cert_id || !transmission_time) {
      return { verified: false, reason: 'missing_verification_headers' };
    }

    // Verify webhook with PayPal
    const verificationResponse = await fetch(
      `${PAYPAL_API_URL}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          transmission_id,
          cert_id,
          payload: body,
          transmission_time,
          webhook_id: webhookId,
          auth_version
        })
      }
    );

    if (!verificationResponse.ok) {
      const errorData = await verificationResponse.json();
      console.error('PayPal webhook verification failed:', errorData);
      return { verified: false, reason: 'paypal_verification_failed', error: errorData };
    }

    const verificationData = await verificationResponse.json();
    return {
      verified: verificationData.verification_status === 'SUCCESS',
      reason: verificationData.verification_status,
      details: verificationData
    };

  } catch (error) {
    console.error('Webhook verification error:', error);
    return { verified: false, reason: 'verification_error', error: error.message };
  }
}

// Helper to log financial audit events (non-blocking)
async function logFinancialAudit(params) {
  try {
    await auditService.logFinancialEvent(params);
  } catch (auditError) {
    console.error('Financial audit logging failed (non-blocking):', auditError.message);
    // Never throw - audit failures must not break payment processing
  }
}

// Helper to store PayPal webhook event
async function storeWebhookEvent(event, verificationResult, transactionId = null) {
  const db = await getDatabaseClient();

  try {
    // Extract event details
    const eventId = event.id;
    const eventType = event.event_type;
    const webhookId = process.env.PAYPAL_WEBHOOK_ID || null;

    // Extract PayPal resource information
    const resource = event.resource || {};
    const paypalOrderId = resource.invoice_id || resource.custom_id || resource.id || null;
    const paypalCaptureId = resource.id && eventType.includes('CAPTURE') ? resource.id : null;

    // Determine verification and processing status
    const verificationStatus = verificationResult.verified ? 'verified' : 'failed';
    const processingStatus = 'pending'; // Will be updated after processing

    const result = await db.execute({
      sql: `INSERT INTO paypal_webhook_events (
        event_id, event_type, webhook_id,
        paypal_order_id, paypal_capture_id, transaction_id,
        event_data, verification_status, processing_status,
        created_at, resource_type, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        eventId,
        eventType,
        webhookId,
        paypalOrderId,
        paypalCaptureId,
        transactionId,
        JSON.stringify(event),
        verificationStatus,
        processingStatus,
        new Date().toISOString(),
        resource.resource_type || eventType.split('.')[0],
        event.summary || `PayPal ${eventType} event`
      ]
    });

    return result.lastInsertRowid;
  } catch (error) {
    console.error('Failed to store webhook event:', error);
    // Check for duplicate event
    if (error.message && error.message.includes('UNIQUE')) {
      console.log(`Duplicate webhook event detected: ${event.id}`);
      return 'duplicate';
    }
    throw error;
  }
}

// Helper to update webhook event processing status
async function updateWebhookEventStatus(eventId, status, errorMessage = null) {
  const db = await getDatabaseClient();

  try {
    await db.execute({
      sql: `UPDATE paypal_webhook_events
            SET processing_status = ?, error_message = ?, processed_at = ?, updated_at = ?
            WHERE event_id = ?`,
      args: [
        status,
        errorMessage,
        new Date().toISOString(),
        new Date().toISOString(),
        eventId
      ]
    });
  } catch (error) {
    console.error('Failed to update webhook event status:', error);
    // Non-blocking - continue processing
  }
}

// For Vercel, we need the raw body for webhook verification
export const config = {
  api: {
    bodyParser: false
  }
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
  // Ensure all services are initialized to prevent race conditions
  if (auditService.ensureInitialized) {
    await auditService.ensureInitialized();
  }
  if (transactionService.ensureInitialized) {
    await transactionService.ensureInitialized();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  let rawBody;

  try {
    rawBody = await getRawBody(req);
    const bodyString = rawBody.toString('utf8');

    try {
      event = JSON.parse(bodyString);
    } catch (parseError) {
      console.error('Failed to parse webhook body:', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log(`PayPal webhook received: ${event.event_type}`, {
      id: event.id,
      type: event.event_type
    });

    // Verify webhook signature
    const verificationResult = await verifyWebhookSignature(
      req.headers,
      bodyString,
      process.env.PAYPAL_WEBHOOK_ID
    );

    if (!verificationResult.verified && process.env.PAYPAL_WEBHOOK_ID) {
      console.error('PayPal webhook signature verification failed:', verificationResult);
      return res.status(401).json({
        error: 'Webhook signature verification failed',
        reason: verificationResult.reason
      });
    }

    // Store the webhook event first (for idempotency and audit)
    let storedEventId;
    try {
      storedEventId = await storeWebhookEvent(event, verificationResult);

      if (storedEventId === 'duplicate') {
        console.log(`Skipping duplicate PayPal webhook event: ${event.id}`);
        return res.json({ received: true, status: 'duplicate' });
      }
    } catch (error) {
      console.error('Failed to store webhook event:', error);
      // Continue processing even if storage fails initially
    }

    // Handle the event based on type
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        console.log(`Processing PAYMENT.CAPTURE.COMPLETED for ${event.id}`);

        try {
          const resource = event.resource;
          const captureId = resource.id;
          const orderId = resource.supplementary_data?.related_ids?.order_id;
          const amountCents = Math.round(parseFloat(resource.amount.value) * 100);
          const currency = resource.amount.currency_code;

          // Detect payment processor from webhook resource
          // Webhook resource may have payment_source directly or need reconstruction
          let paymentProcessor = 'paypal'; // Default
          if (resource.payment_source) {
            // Construct capture-like response for detector
            const captureResponse = {
              purchase_units: [{
                payments: {
                  captures: [{
                    payment_source: resource.payment_source
                  }]
                }
              }]
            };
            paymentProcessor = detectPaymentProcessor(captureResponse);
            const sourceDetails = extractPaymentSourceDetails(captureResponse);
            console.log('Webhook payment source detected:', {
              processor: paymentProcessor,
              sourceType: sourceDetails.type,
              webhookEventId: event.id
            });
          } else {
            console.log('Webhook resource missing payment_source, defaulting to paypal');
          }

          // Find transaction by PayPal order ID or capture ID
          let transaction = null;
          if (orderId) {
            transaction = await transactionService.getByPayPalOrderId(orderId);
          }

          if (!transaction && captureId) {
            transaction = await transactionService.getByPayPalCaptureId(captureId);
          }

          if (!transaction) {
            console.warn(`No transaction found for PayPal capture: ${captureId}, order: ${orderId}`);
            await updateWebhookEventStatus(event.id, 'skipped', 'Transaction not found');

            // Log audit for orphaned webhook
            await logFinancialAudit({
              requestId: `paypal_webhook_${event.id}`,
              action: 'PAYPAL_WEBHOOK_ORPHANED',
              amountCents,
              currency,
              transactionReference: null,
              paymentStatus: 'webhook_orphaned',
              targetType: 'paypal_capture',
              targetId: captureId,
              metadata: {
                webhook_event_id: event.id,
                paypal_capture_id: captureId,
                paypal_order_id: orderId,
                event_type: event.event_type
              },
              severity: 'warning'
            });

            return res.json({ received: true, status: 'transaction_not_found' });
          }

          // Check if already processed
          if (transaction.status === 'completed' && transaction.paypal_capture_id === captureId) {
            // If payment processor detection differs, correct it even for completed transactions
            if (paymentProcessor && transaction.payment_processor !== paymentProcessor) {
              await transactionService.updatePayPalCapture(
                transaction.uuid,
                captureId,
                'completed',
                paymentProcessor
              );
              console.log(`Processor corrected for ${transaction.uuid}: ${transaction.payment_processor} -> ${paymentProcessor}`);
            } else {
              console.log(`Transaction already completed: ${transaction.uuid}`);
            }
            await updateWebhookEventStatus(event.id, 'processed', null);
            return res.json({ received: true, status: 'already_processed' });
          }

          // Update transaction status to completed with detected payment processor
          await transactionService.updatePayPalCapture(
            transaction.uuid,
            captureId,
            'completed',
            paymentProcessor
          );

          // Log financial audit for capture completion
          await logFinancialAudit({
            requestId: `paypal_webhook_${event.id}`,
            action: transaction.is_test ? 'TEST_PAYPAL_CAPTURE_COMPLETED' : 'PAYPAL_CAPTURE_COMPLETED',
            amountCents,
            currency,
            transactionReference: transaction.uuid,
            paymentStatus: 'completed',
            targetType: 'paypal_capture',
            targetId: captureId,
            metadata: {
              webhook_event_id: event.id,
              paypal_capture_id: captureId,
              paypal_order_id: orderId,
              transaction_id: transaction.id,
              capture_status: resource.status,
              final_capture: resource.final_capture,
              payment_processor: paymentProcessor,
              test_mode: transaction.is_test === 1
            },
            severity: transaction.is_test ? 'debug' : 'info'
          });

          await updateWebhookEventStatus(event.id, 'processed', null);
          console.log(`PayPal capture completed webhook processed for transaction: ${transaction.uuid}`);

        } catch (error) {
          console.error('Failed to process PAYMENT.CAPTURE.COMPLETED:', error);
          await updateWebhookEventStatus(event.id, 'failed', error.message);
          // Don't throw - we've logged the error, let PayPal retry if needed
        }

        break;
      }

      case 'PAYMENT.CAPTURE.DENIED': {
        console.log(`Processing PAYMENT.CAPTURE.DENIED for ${event.id}`);

        try {
          const resource = event.resource;
          const captureId = resource.id;
          const orderId = resource.supplementary_data?.related_ids?.order_id;
          const amountCents = Math.round(parseFloat(resource.amount.value) * 100);
          const currency = resource.amount.currency_code;

          // Find transaction
          let transaction = null;
          if (orderId) {
            transaction = await transactionService.getByPayPalOrderId(orderId);
          }

          if (transaction) {
            // Update transaction status to failed
            await transactionService.updateStatus(transaction.uuid, 'failed');

            // Log financial audit for capture denial
            await logFinancialAudit({
              requestId: `paypal_webhook_${event.id}`,
              action: 'PAYPAL_CAPTURE_DENIED',
              amountCents,
              currency,
              transactionReference: transaction.uuid,
              paymentStatus: 'denied',
              targetType: 'paypal_capture',
              targetId: captureId,
              metadata: {
                webhook_event_id: event.id,
                paypal_capture_id: captureId,
                paypal_order_id: orderId,
                transaction_id: transaction.id,
                denial_reason: resource.reason_code || 'Unknown'
              },
              severity: 'warning'
            });
          }

          await updateWebhookEventStatus(event.id, 'processed', null);

        } catch (error) {
          console.error('Failed to process PAYMENT.CAPTURE.DENIED:', error);
          await updateWebhookEventStatus(event.id, 'failed', error.message);
        }

        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        console.log(`Processing PAYMENT.CAPTURE.REFUNDED for ${event.id}`);

        try {
          const resource = event.resource;
          const refundId = resource.id;
          const captureId = resource.supplementary_data?.related_ids?.capture_id;
          const amountCents = Math.round(parseFloat(resource.amount.value) * 100);
          const currency = resource.amount.currency_code;

          // Find transaction by capture ID
          let transaction = null;
          if (captureId) {
            transaction = await transactionService.getByPayPalCaptureId(captureId);
          }

          if (transaction) {
            // Determine if this is a full or partial refund
            const isFullRefund = amountCents >= transaction.amount_cents;
            const status = isFullRefund ? 'refunded' : 'partially_refunded';

            await transactionService.updateStatus(transaction.uuid, status);

            // Log comprehensive refund audit
            await logFinancialAudit({
              requestId: `paypal_webhook_${event.id}`,
              action: isFullRefund ? 'PAYPAL_REFUND_FULL' : 'PAYPAL_REFUND_PARTIAL',
              amountCents,
              currency,
              transactionReference: transaction.uuid,
              paymentStatus: status,
              targetType: 'paypal_refund',
              targetId: refundId,
              metadata: {
                webhook_event_id: event.id,
                paypal_refund_id: refundId,
                paypal_capture_id: captureId,
                transaction_id: transaction.id,
                original_amount_cents: transaction.amount_cents,
                refunded_amount_cents: amountCents,
                is_full_refund: isFullRefund,
                refund_status: resource.status,
                refund_reason: resource.reason || 'Not specified'
              },
              severity: 'warning'
            });
          }

          await updateWebhookEventStatus(event.id, 'processed', null);

        } catch (error) {
          console.error('Failed to process PAYMENT.CAPTURE.REFUNDED:', error);
          await updateWebhookEventStatus(event.id, 'failed', error.message);
        }

        break;
      }

      case 'CHECKOUT.ORDER.APPROVED': {
        console.log(`Processing CHECKOUT.ORDER.APPROVED for ${event.id}`);

        try {
          const resource = event.resource;
          const orderId = resource.id;

          // This is informational - order is approved but not yet captured
          // Log for audit trail but don't change transaction status

          await logFinancialAudit({
            requestId: `paypal_webhook_${event.id}`,
            action: 'PAYPAL_ORDER_APPROVED',
            amountCents: 0, // Amount not available in approval event
            currency: 'USD',
            transactionReference: null,
            paymentStatus: 'approved',
            targetType: 'paypal_order',
            targetId: orderId,
            metadata: {
              webhook_event_id: event.id,
              paypal_order_id: orderId,
              event_type: event.event_type
            },
            severity: 'info'
          });

          await updateWebhookEventStatus(event.id, 'processed', null);

        } catch (error) {
          console.error('Failed to process CHECKOUT.ORDER.APPROVED:', error);
          await updateWebhookEventStatus(event.id, 'failed', error.message);
        }

        break;
      }

      default:
        console.log(`Unhandled PayPal event type: ${event.event_type}`);
        await updateWebhookEventStatus(event.id, 'skipped', `Unhandled event type: ${event.event_type}`);

        // Log unhandled event for monitoring
        await logFinancialAudit({
          requestId: `paypal_webhook_${event.id}`,
          action: 'PAYPAL_WEBHOOK_UNHANDLED',
          amountCents: 0,
          currency: 'USD',
          transactionReference: null,
          paymentStatus: 'unhandled',
          targetType: 'paypal_webhook',
          targetId: event.id,
          metadata: {
            webhook_event_id: event.id,
            event_type: event.event_type,
            resource_type: event.resource?.resource_type
          },
          severity: 'info'
        });
    }

    // Return a response to acknowledge receipt of the event
    res.status(200).json({ received: true });

  } catch (err) {
    console.error('PayPal webhook error:', err.message);

    // Try to update webhook event status if we have event info
    if (event?.id) {
      await updateWebhookEventStatus(event.id, 'failed', err.message);
    }

    // Log comprehensive error audit
    await logFinancialAudit({
      requestId: `paypal_webhook_error_${Date.now()}`,
      action: 'PAYPAL_WEBHOOK_ERROR',
      amountCents: 0,
      currency: 'USD',
      transactionReference: null,
      paymentStatus: 'webhook_error',
      targetType: 'paypal_webhook_handler',
      targetId: event?.id || 'unknown',
      metadata: {
        error_message: err.message,
        error_stack: err.stack,
        event_type: event?.event_type || 'unknown',
        webhook_event_id: event?.id || null
      },
      severity: 'error'
    });

    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
}