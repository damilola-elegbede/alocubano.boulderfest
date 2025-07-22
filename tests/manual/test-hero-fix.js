// Quick test to verify page mapping fix
(function() {
  console.log('🧪 Testing Page Mapping Fix...');
  
  // Test URLs
  const testUrls = [
    '/artists',
    '/about', 
    '/schedule',
    '/gallery',
    '/tickets',
    '/donations'
  ];
  
  // Mock window.location for testing
  const originalPathname = window.location.pathname;
  
  testUrls.forEach(url => {
    // Temporarily override pathname
    Object.defineProperty(window.location, 'pathname', {
      value: url,
      configurable: true
    });
    
    const pageId = window.ImageCacheManager?.getCurrentPageId();
    const expected = url.substring(1); // Remove leading slash
    
    console.log(`URL: ${url} => Page ID: ${pageId} ${pageId === expected ? '✅' : '❌ Expected: ' + expected}`);
  });
  
  // Restore original pathname
  Object.defineProperty(window.location, 'pathname', {
    value: originalPathname,
    configurable: true
  });
  
  console.log('\n📊 Current Page Detection:');
  console.log('Pathname:', window.location.pathname);
  console.log('Detected Page ID:', window.ImageCacheManager?.getCurrentPageId());
  
  // Check session assignments
  const assignments = sessionStorage.getItem('alocubano_image_cache_v2');
  if (assignments) {
    const parsed = JSON.parse(assignments);
    console.log('\n🖼️ Hero Image Assignments:');
    Object.entries(parsed).forEach(([page, imageId]) => {
      console.log(`${page}: ${imageId}`);
    });
  }
})();