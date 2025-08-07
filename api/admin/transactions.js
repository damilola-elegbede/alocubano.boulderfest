import { getDatabase } from '../lib/database.js';

export default async function handler(req, res) {
  // Simple auth check (enhance in Phase 5)
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDatabase();

  try {
    if (req.method === 'GET') {
      // Get query parameters
      const { email, status, limit = 50, offset = 0 } = req.query;
      
      // Build query
      let sql = `
        SELECT 
          t.*,
          COUNT(DISTINCT ti.id) as item_count,
          GROUP_CONCAT(DISTINCT ti.item_name) as items
        FROM transactions t
        LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
        WHERE 1=1
      `;
      
      const args = [];
      
      if (email) {
        sql += ' AND t.customer_email = ?';
        args.push(email);
      }
      
      if (status) {
        sql += ' AND t.status = ?';
        args.push(status);
      }
      
      sql += ' GROUP BY t.id ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
      args.push(parseInt(limit), parseInt(offset));
      
      const result = await db.execute({ sql, args });
      
      // Get total count
      let countSql = 'SELECT COUNT(*) as total FROM transactions WHERE 1=1';
      const countArgs = [];
      
      if (email) {
        countSql += ' AND customer_email = ?';
        countArgs.push(email);
      }
      
      if (status) {
        countSql += ' AND status = ?';
        countArgs.push(status);
      }
      
      const countResult = await db.execute({ sql: countSql, args: countArgs });
      
      res.status(200).json({
        transactions: result.rows,
        total: countResult.rows[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } else if (req.method === 'POST') {
      // Manual transaction creation (for testing)
      const { amount, email, name, type = 'tickets' } = req.body;
      
      if (!amount || !email) {
        return res.status(400).json({ error: 'Amount and email are required' });
      }
      
      const uuid = `MANUAL-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      await db.execute({
        sql: `INSERT INTO transactions (
          uuid, order_type, status, total_amount, currency,
          customer_email, customer_name, order_details, payment_method, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuid,
          type,
          'paid',  // Use valid status
          Math.round(amount * 100),
          'USD',
          email,
          name || null,
          JSON.stringify({ manual: true, created_by: 'admin' }),
          'stripe_checkout',  // Use valid payment method
          new Date().toISOString()
        ]
      });
      
      res.status(201).json({ transactionId: uuid, message: 'Transaction created' });
      
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    
  } catch (error) {
    console.error('Transaction API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}