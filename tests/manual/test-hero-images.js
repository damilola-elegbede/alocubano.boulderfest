// Test script for hero image functionality across all pages
// Run this in the browser console to debug hero image issues

(function() {
  console.log('🧪 Testing Hero Image Functionality...');
  
  // Test 1: Check current page detection
  console.group('✅ Test 1: Page Detection');
  if (window.ImageCacheManager) {
    const currentPageId = window.ImageCacheManager.getCurrentPageId();
    console.log('Current page ID:', currentPageId);
    console.log('Current pathname:', window.location.pathname);
    console.log('Page mapping:', window.ImageCacheManager.pageMapping);
  } else {
    console.error('❌ ImageCacheManager not loaded');
  }
  console.groupEnd();
  
  // Test 2: Check hero image element
  console.group('✅ Test 2: Hero Image Element');
  const heroImg = document.getElementById('hero-splash-image');
  if (heroImg) {
    console.log('Hero image found:', {
      src: heroImg.src,
      display: window.getComputedStyle(heroImg).display,
      dataset: heroImg.dataset,
      naturalWidth: heroImg.naturalWidth,
      naturalHeight: heroImg.naturalHeight,
      complete: heroImg.complete
    });
  } else {
    console.error('❌ No hero image element found');
  }
  console.groupEnd();
  
  // Test 3: Check session storage assignments
  console.group('✅ Test 3: Session Storage');
  const cacheKey = 'alocubano_image_cache_v2';
  const assignments = sessionStorage.getItem(cacheKey);
  if (assignments) {
    const parsed = JSON.parse(assignments);
    console.log('Session assignments:', parsed);
    console.log('Pages with assignments:', Object.keys(parsed));
  } else {
    console.warn('⚠️ No session assignments found');
  }
  console.groupEnd();
  
  // Test 4: Check featured photos availability
  console.group('✅ Test 4: Featured Photos');
  fetch('/featured-photos.json')
    .then(res => res.json())
    .then(data => {
      console.log('Featured photos available:', data.totalCount);
      console.log('First few photos:', data.items.slice(0, 3).map(item => ({
        id: item.id,
        name: item.name
      })));
    })
    .catch(err => console.error('❌ Failed to load featured photos:', err));
  console.groupEnd();
  
  // Test 5: Force reload hero image
  console.group('✅ Test 5: Force Reload Test');
  console.log('To force reload hero image, run:');
  console.log('sessionStorage.clear(); location.reload();');
  console.groupEnd();
  
  // Test 6: Check for errors
  console.group('✅ Test 6: Console Errors');
  console.log('Check browser console for any red error messages above');
  console.log('Common issues:');
  console.log('- API proxy returns 404 (normal in dev without credentials)');
  console.log('- Default hero image missing (need to add /images/hero-default.jpg)');
  console.log('- CORS errors (check server configuration)');
  console.groupEnd();
  
  // Summary
  console.log('\n📊 Debug Summary:');
  if (heroImg && heroImg.src && heroImg.naturalWidth > 0) {
    console.log('✅ Hero image is loading successfully');
  } else {
    console.log('❌ Hero image is not loading properly');
    console.log('💡 Try: sessionStorage.clear(); location.reload();');
  }
  
  console.log('\n🎉 Hero image test complete!');
  console.log('💡 Add ?debug to URL for visual error messages');
})();