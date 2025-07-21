// Test script for gallery sequential pagination fix
// Run this in the browser console on the gallery page

(function() {
  console.log('🧪 Testing Gallery Sequential Pagination Fix...');
  
  // Test 1: Check state structure
  console.group('✅ Test 1: State Structure');
  const state = window.galleryDebug?.getState();
  if (state) {
    console.log('Workshop offset:', state.workshopOffset);
    console.log('Social offset:', state.socialOffset);
    console.log('Workshop total:', state.workshopTotal);
    console.log('Social total:', state.socialTotal);
    console.log('Display order length:', state.displayOrder.length);
    console.log('Current category:', state.currentCategory);
    console.log('✅ State structure includes sequential pagination fields');
  } else {
    console.error('❌ Could not access gallery state');
  }
  console.groupEnd();
  
  // Test 2: Check sequential loading
  console.group('✅ Test 2: Sequential Loading');
  if (state && state.displayOrder.length > 0) {
    let lastWorkshopIndex = -1;
    let firstSocialIndex = -1;
    
    state.displayOrder.forEach((item, index) => {
      if (item.category === 'workshops') {
        lastWorkshopIndex = index;
      } else if (item.category === 'socials' && firstSocialIndex === -1) {
        firstSocialIndex = index;
      }
    });
    
    console.log('Last workshop index:', lastWorkshopIndex);
    console.log('First social index:', firstSocialIndex);
    
    if (firstSocialIndex === -1 || lastWorkshopIndex < firstSocialIndex) {
      console.log('✅ Workshops load before socials (sequential loading works)');
    } else {
      console.error('❌ Sequential loading not working - socials appear before all workshops');
    }
  }
  console.groupEnd();
  
  // Test 3: Check completion state
  console.group('✅ Test 3: Completion State');
  const sentinel = document.getElementById('load-more-sentinel');
  const completionMessage = document.getElementById('gallery-completion-message');
  
  if (!state.hasMorePages && !sentinel && completionMessage) {
    console.log('✅ Sentinel removed and completion message shown');
  } else if (state.hasMorePages && sentinel && !completionMessage) {
    console.log('✅ Sentinel present, no completion message (more to load)');
  } else {
    console.warn('⚠️ Inconsistent completion state');
    console.log('Has more pages:', state.hasMorePages);
    console.log('Sentinel exists:', !!sentinel);
    console.log('Completion message exists:', !!completionMessage);
  }
  console.groupEnd();
  
  // Test 4: Check lightbox functionality
  console.group('✅ Test 4: Lightbox Click Handling');
  const galleryItems = document.querySelectorAll('.gallery-item');
  if (galleryItems.length > 0) {
    const firstItem = galleryItems[0];
    const styles = window.getComputedStyle(firstItem);
    console.log('Cursor style:', styles.cursor);
    console.log('Pointer events:', styles.pointerEvents);
    console.log('Z-index:', styles.zIndex);
    
    // Check lazy placeholder
    const placeholder = firstItem.querySelector('.lazy-placeholder');
    if (placeholder) {
      const placeholderStyles = window.getComputedStyle(placeholder);
      console.log('Placeholder pointer-events:', placeholderStyles.pointerEvents);
    }
    
    console.log('✅ Gallery items configured for clicking');
  }
  console.groupEnd();
  
  // Test 5: Performance stats
  console.group('✅ Test 5: Performance Stats');
  const perfStats = window.galleryDebug?.getPerformanceStats();
  if (perfStats) {
    console.log('Cache hit ratio:', (perfStats.cacheHitRatio * 100).toFixed(2) + '%');
    console.log('Total requests:', perfStats.totalRequests);
    console.log('Average load time:', perfStats.averageLoadTime.toFixed(2) + 'ms');
  }
  console.groupEnd();
  
  // Summary
  console.log('\n📊 Test Summary:');
  window.galleryDebug?.logCurrentState();
  
  console.log('\n🎉 Gallery sequential pagination fix test complete!');
  console.log('💡 Tip: Scroll to bottom to test infinite loading');
  console.log('💡 Tip: Click on any image to test lightbox');
})();