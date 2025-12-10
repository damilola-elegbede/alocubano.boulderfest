import { getDatabaseClient } from "../../lib/database.js";
import ticketService from "../../lib/ticket-service.js";
import tokenService from "../../lib/token-service.js";
import { formatTicketType, TOKEN_ACTIONS } from "../../lib/ticket-config.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import timeUtils from "../../lib/time-utils.js";
import jwt from "jsonwebtoken";

/**
 * Verify JWT token created by verify-code.js for ticket viewing
 * These tokens are signed with REGISTRATION_SECRET and have purpose: 'ticket_viewing'
 */
function verifyTicketViewingJwt(token) {
  const secret = process.env.REGISTRATION_SECRET;
  if (!secret) {
    return { valid: false, error: 'Server configuration error' };
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'alocubano-tickets'
    });

    // Verify this is a ticket viewing token
    if (payload.purpose !== 'ticket_viewing') {
      return { valid: false, error: 'Invalid token purpose' };
    }

    return { valid: true, email: payload.email };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Session expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
}

export default async function handler(req, res) {
  let db;

  try {
    db = await getDatabaseClient();
    if (req.method === 'GET') {
      const { email, ticket_id, transaction_id, token } = req.query;

      if (ticket_id) {
        // Get single ticket
        const ticket = await ticketService.getByTicketId(ticket_id);

        if (!ticket) {
          return res.status(404).json({ error: 'Ticket not found' });
        }

        // Enhance with Mountain Time fields
        const enhancedTicket = timeUtils.enhanceApiResponse(ticket,
          ['created_at', 'updated_at', 'event_date', 'registered_at', 'registration_deadline', 'checked_in_at'],
          { includeDeadline: false }
        );

        return res.status(200).json({ ticket: enhancedTicket });
      }

      if (token) {
        // First, try to validate as JWT token (from verify-code.js)
        // JWT tokens are used by the my-tickets page after email verification
        const jwtResult = verifyTicketViewingJwt(token);

        if (jwtResult.valid) {
          // JWT is valid - fetch tickets by the verified email
          const tickets = await ticketService.getTicketsByEmail(jwtResult.email);
          const enhancedTickets = timeUtils.enhanceApiResponse(tickets,
            ['created_at', 'updated_at', 'event_date', 'registered_at', 'registration_deadline', 'checked_in_at'],
            { includeDeadline: false }
          );
          return res.status(200).json({
            tickets: enhancedTickets.map((ticket) => ({
              ...ticket,
              formatted_type: formatTicketType(ticket.ticket_type)
            }))
          });
        }

        // If JWT validation failed with a definitive error (expired, wrong purpose), return 401
        if (jwtResult.error === 'Session expired' || jwtResult.error === 'Invalid token purpose') {
          return res.status(401).json({ error: jwtResult.error });
        }

        // Fall back to database access token validation
        // This handles tokens stored in access_tokens table (different token system)
        try {
          const tickets = await ticketService.getTicketsByAccessToken(token);
          const enhancedTickets = timeUtils.enhanceApiResponse(tickets,
            ['created_at', 'updated_at', 'event_date', 'registered_at', 'registration_deadline', 'checked_in_at'],
            { includeDeadline: false }
          );
          return res.status(200).json({
            tickets: enhancedTickets.map((ticket) => ({
              ...ticket,
              formatted_type: formatTicketType(ticket.ticket_type)
            }))
          });
        } catch (error) {
          return res.status(401).json({ error: error.message });
        }
      }

      if (email) {
        // Get tickets by email (legacy method - consider deprecating)
        const tickets = await ticketService.getTicketsByEmail(email);
        // Enhance with Mountain Time fields
        const enhancedTickets = timeUtils.enhanceApiResponse(tickets,
          ['created_at', 'updated_at', 'event_date', 'registered_at', 'registration_deadline', 'checked_in_at'],
          { includeDeadline: false }
        );
        return res.status(200).json({
          tickets: enhancedTickets.map((ticket) => ({
            ...ticket,
            formatted_type: formatTicketType(ticket.ticket_type)
          }))
        });
      }

      if (transaction_id) {
        // Get tickets for a transaction
        const result = await db.execute({
          sql: 'SELECT id FROM transactions WHERE uuid = ?',
          args: [transaction_id]
        });

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Transaction not found' });
        }

        // Process database result to handle BigInt values
        const processedResult = processDatabaseResult(result);
        const tickets = await ticketService.getTransactionTickets(
          processedResult.rows[0].id
        );
        // Enhance with Mountain Time fields
        const processedTickets = processDatabaseResult(tickets);
        const enhancedTickets = timeUtils.enhanceApiResponse(processedTickets,
          ['created_at', 'updated_at', 'event_date', 'registered_at', 'registration_deadline', 'checked_in_at'],
          { includeDeadline: false }
        );
        return res.status(200).json({ tickets: enhancedTickets });
      }

      return res
        .status(400)
        .json({ error: 'Token, email, ticket_id, or transaction_id required' });
    } else if (req.method === 'PUT') {
      // Update ticket attendee information
      const { ticket_id } = req.query;
      const { firstName, lastName, email, phone } = req.body;

      if (!ticket_id) {
        return res.status(400).json({ error: 'Ticket ID required' });
      }

      const updatedTicket = await ticketService.updateAttendeeInfo(ticket_id, {
        firstName,
        lastName,
        email,
        phone
      });

      if (!updatedTicket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      return res.status(200).json({ ticket: updatedTicket });
    } else if (req.method === 'POST') {
      // Handle ticket actions
      const { action, ticket_id, actionToken } = req.body;

      if (!ticket_id) {
        return res.status(400).json({ error: 'Ticket ID required' });
      }

      // Action token is required for security-critical operations
      if (!actionToken && (action === 'cancel' || action === 'transfer')) {
        return res.status(400).json({
          error: 'Action token required for security-critical operations'
        });
      }

      switch (action) {
      case 'cancel': {
        const { reason } = req.body;

        // Validate action token
        const tokenValidation = await tokenService.validateActionToken(
          actionToken,
          TOKEN_ACTIONS.CANCEL,
          ticket_id
        );

        if (!tokenValidation.valid) {
          return res.status(401).json({ error: tokenValidation.error });
        }

        const cancelledTicket = await ticketService.cancelTicket(
          ticket_id,
          reason
        );
        return res.status(200).json({ ticket: cancelledTicket });
      }

      case 'transfer': {
        const { firstName, lastName, email, phone } = req.body;

        if (!email) {
          return res
            .status(400)
            .json({ error: 'New attendee email required' });
        }

        // Validate action token
        const tokenValidation = await tokenService.validateActionToken(
          actionToken,
          TOKEN_ACTIONS.TRANSFER,
          ticket_id
        );

        if (!tokenValidation.valid) {
          return res.status(401).json({ error: tokenValidation.error });
        }

        const transferredTicket = await ticketService.transferTicket(
          ticket_id,
          {
            firstName,
            lastName,
            email,
            phone
          }
        );

        return res.status(200).json({ ticket: transferredTicket });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'PUT', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Ticket API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
