import { getMemoryCache } from '../../lib/cache/memory-cache.js';
import { getRedisCache } from '../../lib/cache/redis-cache.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin authentication for manual warming
  const adminKey = req.headers['x-admin-key'];
  const isManual = !!adminKey;
  
  if (isManual && adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { types = ['all'], priority = 'high' } = req.body || {};
    const results = {
      timestamp: new Date().toISOString(),
      warmed: {},
      errors: [],
      totalKeys: 0,
      duration: 0,
    };

    const startTime = Date.now();
    
    // Initialize database connection
    const dbPath = path.join(__dirname, '..', '..', 'data', 
      process.env.NODE_ENV === 'production' ? 'production.db' : 'development.db'
    );
    
    const db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });

    // Get cache instances
    const memCache = getMemoryCache('static');
    const apiCache = getMemoryCache('api');
    const dbCache = getMemoryCache('database');
    const redisCache = getRedisCache();

    // Warm different cache types based on priority
    if (types.includes('all') || types.includes('static')) {
      results.warmed.static = await warmStaticData(memCache, redisCache, priority);
      results.totalKeys += results.warmed.static.count;
    }

    if (types.includes('all') || types.includes('tickets')) {
      results.warmed.tickets = await warmTicketData(db, dbCache, redisCache, priority);
      results.totalKeys += results.warmed.tickets.count;
    }

    if (types.includes('all') || types.includes('analytics')) {
      results.warmed.analytics = await warmAnalyticsData(db, dbCache, redisCache, priority);
      results.totalKeys += results.warmed.analytics.count;
    }

    if (types.includes('all') || types.includes('api')) {
      results.warmed.api = await warmApiEndpoints(apiCache, redisCache, priority);
      results.totalKeys += results.warmed.api.count;
    }

    // Close database connection
    db.close();

    results.duration = Date.now() - startTime;

    // Log warming event
    console.log('Cache warmed:', {
      types,
      priority,
      results,
      triggeredBy: isManual ? 'manual' : 'automatic',
    });

    return res.status(200).json({
      success: true,
      message: `Warmed ${results.totalKeys} cache keys in ${results.duration}ms`,
      results,
    });
  } catch (error) {
    console.error('Cache warming error:', error);
    return res.status(500).json({
      error: 'Failed to warm cache',
      message: error.message,
    });
  }
}

async function warmStaticData(memCache, redisCache, priority) {
  const warmed = { count: 0, keys: [] };
  
  // Static data that rarely changes
  const staticData = [
    {
      key: 'event:info',
      value: {
        name: 'A Lo Cubano Boulder Fest',
        dates: 'May 15-17, 2026',
        location: 'Avalon Ballroom, Boulder, CO',
        description: 'Cuban salsa festival featuring workshops and social dancing',
      },
      ttl: 21600, // 6 hours
    },
    {
      key: 'ticket:types',
      value: [
        { id: 'full-pass', name: 'Full Festival Pass', price: 175 },
        { id: 'workshop-pass', name: 'Workshop Pass', price: 120 },
        { id: 'social-pass', name: 'Social Dancing Pass', price: 85 },
      ],
      ttl: 3600, // 1 hour
    },
    {
      key: 'venue:info',
      value: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Rd, Boulder, CO 80303',
        capacity: 500,
        parking: 'Free parking available',
      },
      ttl: 21600, // 6 hours
    },
  ];

  if (priority === 'high' || priority === 'all') {
    for (const item of staticData) {
      memCache.set(item.key, item.value, item.ttl);
      
      if (redisCache.connected) {
        await redisCache.set(item.key, item.value, item.ttl, 'static');
      }
      
      warmed.count++;
      warmed.keys.push(item.key);
    }
  }

  return warmed;
}

async function warmTicketData(db, dbCache, redisCache, priority) {
  const warmed = { count: 0, keys: [] };
  
  try {
    // Get ticket availability
    const availability = db.prepare(`
      SELECT 
        ticket_type,
        COUNT(*) as sold,
        (SELECT capacity FROM ticket_types WHERE type = tickets.ticket_type) as capacity
      FROM tickets
      WHERE status = 'active'
      GROUP BY ticket_type
    `).all();
    
    const availabilityKey = 'tickets:availability';
    dbCache.set(availabilityKey, availability, 60); // 1 minute TTL
    
    if (redisCache.connected) {
      await redisCache.set(availabilityKey, availability, 60, 'tickets');
    }
    
    warmed.count++;
    warmed.keys.push(availabilityKey);
    
    if (priority === 'all') {
      // Get recent tickets for quick validation
      const recentTickets = db.prepare(`
        SELECT ticket_id, qr_code, status
        FROM tickets
        WHERE created_at > datetime('now', '-1 day')
        LIMIT 100
      `).all();
      
      for (const ticket of recentTickets) {
        const key = `ticket:${ticket.ticket_id}`;
        dbCache.set(key, ticket, 300); // 5 minute TTL
        warmed.count++;
        warmed.keys.push(key);
      }
    }
  } catch (error) {
    console.error('Error warming ticket data:', error);
  }
  
  return warmed;
}

async function warmAnalyticsData(db, dbCache, redisCache, priority) {
  const warmed = { count: 0, keys: [] };
  
  try {
    // Get sales statistics
    const salesStats = db.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        SUM(amount) as total_revenue,
        AVG(amount) as avg_ticket_price,
        COUNT(DISTINCT user_email) as unique_customers
      FROM tickets
      WHERE status = 'active'
    `).get();
    
    const statsKey = 'analytics:sales';
    dbCache.set(statsKey, salesStats, 900); // 15 minute TTL
    
    if (redisCache.connected) {
      await redisCache.set(statsKey, salesStats, 900, 'analytics');
    }
    
    warmed.count++;
    warmed.keys.push(statsKey);
    
    // Get check-in statistics
    const checkinStats = db.prepare(`
      SELECT 
        COUNT(*) as total_checkins,
        COUNT(DISTINCT device_id) as active_devices,
        AVG(julianday('now') - julianday(checked_in_at)) * 24 * 60 as avg_checkin_time_minutes
      FROM tickets
      WHERE checked_in_at IS NOT NULL
    `).get();
    
    const checkinKey = 'analytics:checkins';
    dbCache.set(checkinKey, checkinStats, 300); // 5 minute TTL
    
    if (redisCache.connected) {
      await redisCache.set(checkinKey, checkinStats, 300, 'analytics');
    }
    
    warmed.count++;
    warmed.keys.push(checkinKey);
  } catch (error) {
    console.error('Error warming analytics data:', error);
  }
  
  return warmed;
}

async function warmApiEndpoints(apiCache, redisCache, priority) {
  const warmed = { count: 0, keys: [] };
  
  // Common API responses to cache
  const apiResponses = [
    {
      key: 'api:/health/check',
      value: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          cache: 'connected',
          stripe: 'connected',
        },
      },
      ttl: 30, // 30 seconds
    },
    {
      key: 'api:/tickets/types',
      value: {
        types: [
          { id: 'full-pass', name: 'Full Festival Pass', price: 175, available: true },
          { id: 'workshop-pass', name: 'Workshop Pass', price: 120, available: true },
          { id: 'social-pass', name: 'Social Dancing Pass', price: 85, available: true },
        ],
      },
      ttl: 120, // 2 minutes
    },
  ];
  
  for (const item of apiResponses) {
    apiCache.set(item.key, item.value, item.ttl);
    
    if (redisCache.connected) {
      await redisCache.set(item.key, item.value, item.ttl, 'api');
    }
    
    warmed.count++;
    warmed.keys.push(item.key);
  }
  
  return warmed;
}

// Export warming functions for use in other modules
export { warmStaticData, warmTicketData, warmAnalyticsData, warmApiEndpoints };