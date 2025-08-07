import ticketService from '../lib/ticket-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { qrData, checkInLocation, checkInBy } = req.body;

    if (!qrData) {
      return res.status(400).json({ 
        error: 'QR code data is required' 
      });
    }

    // Validate and check in
    const result = await ticketService.validateAndCheckIn(
      qrData, 
      checkInLocation || 'Main Entry',
      checkInBy || 'Scanner'
    );

    if (!result.success) {
      return res.status(400).json({ 
        success: false,
        error: result.error,
        checkedInAt: result.checkedInAt // For already used tickets
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Ticket successfully validated and checked in',
      attendee: result.attendee,
      ticketType: result.ticketType,
      ticketId: result.ticket.ticket_id,
      checkedInAt: result.ticket.checked_in_at
    });

  } catch (error) {
    console.error('Ticket validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}