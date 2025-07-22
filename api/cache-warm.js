/**
 * Vercel Edge Function for Cache Warming
 * A Lo Cubano Boulder Fest - Gallery Performance Optimization
 * 
 * Endpoint: /api/cache-warm
 * Purpose: Pre-populate edge cache with critical gallery resources
 */

export default async function handler(request) {
    const { searchParams } = new URL(request.url);
    const gallery = searchParams.get('gallery');
    const type = searchParams.get('type') || 'gallery';
    const limit = parseInt(searchParams.get('limit')) || 10;
    
    console.log(`[Edge] Cache warm request: gallery=${gallery}, type=${type}, limit=${limit}`);
    
    try {
        switch (type) {
            case 'gallery':
                return await warmGalleryCache(gallery, limit);
            case 'featured':
                return await warmFeaturedCache(limit);
            case 'critical':
                return await warmCriticalCache();
            default:
                return new Response('Invalid cache type', { status: 400 });
        }
    } catch (error) {
        console.error('[Edge] Cache warming failed:', error);
        return new Response('Cache warming failed', { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        });
    }
}

async function warmGalleryCache(gallery, limit) {
    if (!gallery) {
        return new Response('Gallery parameter required', { status: 400 });
    }
    
    const warmedItems = [];
    
    try {
        // Warm gallery metadata
        const metadataUrl = `${getBaseUrl()}/api/gallery/${gallery}`;
        const metadataResponse = await fetch(metadataUrl);
        
        if (metadataResponse.ok) {
            warmedItems.push({ url: metadataUrl, status: 'success', type: 'metadata' });
            
            const galleryData = await metadataResponse.json();
            
            // Warm thumbnails
            if (galleryData.photos && galleryData.photos.length > 0) {
                const thumbnailPromises = galleryData.photos
                    .slice(0, limit)
                    .map(photo => warmImage(photo.thumbnailUrl || photo.url, 'thumbnail'));
                
                const thumbnailResults = await Promise.allSettled(thumbnailPromises);
                warmedItems.push(...thumbnailResults.map((result, index) => ({
                    url: galleryData.photos[index].thumbnailUrl || galleryData.photos[index].url,
                    status: result.status === 'fulfilled' ? 'success' : 'failed',
                    type: 'thumbnail',
                    error: result.status === 'rejected' ? result.reason?.message : null
                })));
            }
        } else {
            warmedItems.push({ 
                url: metadataUrl, 
                status: 'failed', 
                type: 'metadata',
                error: `HTTP ${metadataResponse.status}`
            });
        }
        
    } catch (error) {
        console.error('[Edge] Gallery cache warming error:', error);
        warmedItems.push({ 
            url: `gallery/${gallery}`, 
            status: 'failed', 
            type: 'gallery',
            error: error.message 
        });
    }
    
    return new Response(JSON.stringify({
        success: true,
        gallery,
        itemsWarmed: warmedItems.filter(item => item.status === 'success').length,
        totalItems: warmedItems.length,
        details: warmedItems
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        }
    });
}

async function warmFeaturedCache(limit) {
    const warmedItems = [];
    
    try {
        // Warm featured photos endpoint
        const featuredUrl = `${getBaseUrl()}/api/featured-photos.js`;
        const featuredResponse = await fetch(featuredUrl);
        
        if (featuredResponse.ok) {
            warmedItems.push({ url: featuredUrl, status: 'success', type: 'featured-metadata' });
            
            const featuredData = await featuredResponse.json();
            
            // Warm featured images
            if (featuredData.photos && featuredData.photos.length > 0) {
                const imagePromises = featuredData.photos
                    .slice(0, limit)
                    .map(photo => warmImage(photo.url, 'featured'));
                
                const imageResults = await Promise.allSettled(imagePromises);
                warmedItems.push(...imageResults.map((result, index) => ({
                    url: featuredData.photos[index].url,
                    status: result.status === 'fulfilled' ? 'success' : 'failed',
                    type: 'featured-image',
                    error: result.status === 'rejected' ? result.reason?.message : null
                })));
            }
        } else {
            warmedItems.push({ 
                url: featuredUrl, 
                status: 'failed', 
                type: 'featured-metadata',
                error: `HTTP ${featuredResponse.status}`
            });
        }
        
    } catch (error) {
        console.error('[Edge] Featured cache warming error:', error);
        warmedItems.push({ 
            url: 'featured-photos', 
            status: 'failed', 
            type: 'featured',
            error: error.message 
        });
    }
    
    return new Response(JSON.stringify({
        success: true,
        type: 'featured',
        itemsWarmed: warmedItems.filter(item => item.status === 'success').length,
        totalItems: warmedItems.length,
        details: warmedItems
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300'
        }
    });
}

async function warmCriticalCache() {
    const criticalResources = [
        '/css/base.css',
        '/css/components.css',
        '/css/typography.css',
        '/js/main.js',
        '/js/navigation.js',
        '/images/logo.png',
        '/images/hero-default.jpg'
    ];
    
    const warmedItems = [];
    
    const warmPromises = criticalResources.map(resource => 
        warmResource(resource, 'critical')
    );
    
    const results = await Promise.allSettled(warmPromises);
    
    results.forEach((result, index) => {
        warmedItems.push({
            url: criticalResources[index],
            status: result.status === 'fulfilled' ? 'success' : 'failed',
            type: 'critical',
            error: result.status === 'rejected' ? result.reason?.message : null
        });
    });
    
    return new Response(JSON.stringify({
        success: true,
        type: 'critical',
        itemsWarmed: warmedItems.filter(item => item.status === 'success').length,
        totalItems: warmedItems.length,
        details: warmedItems
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300'
        }
    });
}

async function warmImage(imageUrl, type) {
    if (!imageUrl) {
        throw new Error('Image URL is required');
    }
    
    // Handle relative URLs
    const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${getBaseUrl()}${imageUrl}`;
    
    const response = await fetch(fullUrl, {
        method: 'HEAD', // Use HEAD to avoid downloading full image
        headers: {
            'User-Agent': 'A-Lo-Cubano-Cache-Warmer/1.0'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to warm image: HTTP ${response.status}`);
    }
    
    return { url: fullUrl, type, status: 'success' };
}

async function warmResource(resourceUrl, type) {
    if (!resourceUrl) {
        throw new Error('Resource URL is required');
    }
    
    // Handle relative URLs
    const fullUrl = resourceUrl.startsWith('http') ? resourceUrl : `${getBaseUrl()}${resourceUrl}`;
    
    const response = await fetch(fullUrl, {
        method: 'HEAD',
        headers: {
            'User-Agent': 'A-Lo-Cubano-Cache-Warmer/1.0'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to warm resource: HTTP ${response.status}`);
    }
    
    return { url: fullUrl, type, status: 'success' };
}

function getBaseUrl() {
    // In production, this would be the actual domain
    // For development, we'll use localhost
    return process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:8000';
}