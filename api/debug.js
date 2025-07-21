// Debug endpoint for Vercel routing troubleshooting

export default async function handler(req, res) {
  console.log('=== DEBUG ENDPOINT CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Path:', req.path || 'undefined');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query:', JSON.stringify(req.query, null, 2));
  console.log('Body:', req.body || 'empty');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Node version:', process.version);
  console.log('Platform:', process.platform);
  console.log('=== END DEBUG ===');

  // CORS headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://alocubano.boulderfest.com',
    'https://www.alocubano.boulderfest.com',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    /\.vercel\.app$/
  ];
  
  if (allowedOrigins.some(allowed => {
    if (typeof allowed === 'string') return allowed === origin;
    return allowed.test && allowed.test(origin);
  })) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return comprehensive debug information
  const debugInfo = {
    success: true,
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      url: req.url,
      path: req.path || 'undefined',
      headers: req.headers,
      query: req.query,
      body: req.body
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      vercelRegion: process.env.VERCEL_REGION || 'unknown',
      vercelEnv: process.env.VERCEL_ENV || 'unknown'
    },
    routing: {
      message: 'This endpoint is working correctly',
      apiEndpoint: '/api/debug',
      expectedRoutes: [
        '/ -> index.html (redirects to /home)',
        '/home -> /pages/home.html (rewrite)', 
        '/about -> /pages/about.html (rewrite)',
        '/gallery -> /pages/gallery.html (rewrite)',
        '/api/debug -> this endpoint',
        '/api/gallery -> gallery API'
      ]
    },
    files: {
      message: 'File structure validation',
      expectedFiles: [
        '/index.html (redirects to home)',
        '/pages/home.html',
        '/pages/about.html', 
        '/pages/gallery.html',
        '/api/debug.js',
        '/api/gallery.js',
        '/vercel.json'
      ]
    }
  };

  res.status(200).json(debugInfo);
}