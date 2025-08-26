/**
 * Robots.txt API endpoint
 * Serves robots.txt for search engine crawlers
 */

export default function handler(req, res) {
  // Set appropriate content type
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  
  // Generate robots.txt content
  const robotsContent = `User-agent: *
Allow: /

# Sitemap location
Sitemap: ${req.headers.host ? `https://${req.headers.host}/sitemap.xml` : 'https://alocubanoboulderfest.com/sitemap.xml'}

# Disallow admin and API paths
Disallow: /api/
Disallow: /admin/
Disallow: /.tmp/
Disallow: /logs/

# Allow public content
Allow: /pages/
Allow: /js/
Allow: /css/
Allow: /images/
Allow: /public/
`;

  res.status(200).send(robotsContent);
}