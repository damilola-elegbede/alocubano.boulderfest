// Image proxy handler for serving Google Drive images
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, size = 'w1600' } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Image ID is required' });
    }

    // Try multiple URL formats
    const urls = [
      `https://lh3.googleusercontent.com/d/${id}=${size}`,
      `https://drive.google.com/thumbnail?id=${id}&sz=${size}`,
      `https://drive.google.com/uc?export=view&id=${id}`
    ];

    // Try each URL until one works
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)'
          }
        });

        if (response.ok) {
          // Set cache headers
          res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
          res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
          
          // Stream the image
          const buffer = await response.arrayBuffer();
          res.send(Buffer.from(buffer));
          return;
        }
      } catch (error) {
        console.error(`Failed to fetch from ${url}:`, error.message);
      }
    }

    // If all URLs fail, return error
    res.status(404).json({ error: 'Image not found or inaccessible' });
    
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to proxy image',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}