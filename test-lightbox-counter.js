// Test script for lightbox counter functionality
// Run this in browser console on gallery pages to verify counter accuracy

(function() {
    console.log('🧪 Testing Lightbox Counter Functionality...\n');
    
    // Test 1: Check if categoryIndex is being tracked
    console.group('✅ Test 1: Category Index Tracking');
    if (window.galleryDebug) {
        const state = window.galleryDebug.getState();
        
        console.log('Display Order Sample (first 5 items):');
        state.displayOrder.slice(0, 5).forEach((item, i) => {
            console.log(`Item ${i}:`, {
                category: item.category,
                displayIndex: item.displayIndex,
                categoryIndex: item.categoryIndex,
                name: item.name?.substring(0, 30) + '...'
            });
        });
        
        console.log('\nCategory Item Counts:', state.categoryItemCounts);
        
        // Verify categoryIndex is sequential within each category
        const categoryIndices = {
            workshops: [],
            socials: []
        };
        
        state.displayOrder.forEach(item => {
            if (item.category && item.categoryIndex !== undefined) {
                categoryIndices[item.category].push(item.categoryIndex);
            }
        });
        
        let indexingCorrect = true;
        
        // Check workshops
        if (categoryIndices.workshops.length > 0) {
            const workshopsSorted = [...categoryIndices.workshops].sort((a, b) => a - b);
            const workshopsExpected = Array.from({length: workshopsSorted.length}, (_, i) => i);
            const workshopsCorrect = JSON.stringify(workshopsSorted) === JSON.stringify(workshopsExpected);
            console.log('Workshop indices sequential:', workshopsCorrect ? '✅' : '❌');
            if (!workshopsCorrect) {
                console.log('  Expected:', workshopsExpected);
                console.log('  Got:', workshopsSorted);
                indexingCorrect = false;
            }
        }
        
        // Check socials
        if (categoryIndices.socials.length > 0) {
            const socialsSorted = [...categoryIndices.socials].sort((a, b) => a - b);
            const socialsExpected = Array.from({length: socialsSorted.length}, (_, i) => i);
            const socialsCorrect = JSON.stringify(socialsSorted) === JSON.stringify(socialsExpected);
            console.log('Social indices sequential:', socialsCorrect ? '✅' : '❌');
            if (!socialsCorrect) {
                console.log('  Expected:', socialsExpected);
                console.log('  Got:', socialsSorted);
                indexingCorrect = false;
            }
        }
        
        console.log('\nOverall category indexing:', indexingCorrect ? '✅ PASS' : '❌ FAIL');
    } else {
        console.error('❌ Gallery debug not available');
    }
    console.groupEnd();
    
    // Test 2: Simulate lightbox opening
    console.group('✅ Test 2: Lightbox Counter Display');
    
    function testLightboxCounter(itemIndex, expectedCategory, expectedCategoryIndex, expectedCategoryTotal) {
        const galleryItems = document.querySelectorAll('.gallery-item');
        if (galleryItems.length > itemIndex) {
            console.log(`\nTesting item ${itemIndex}:`);
            console.log(`Expected: ${expectedCategory} ${expectedCategoryIndex + 1}/${expectedCategoryTotal}`);
            
            // Get the state to check the actual values
            if (window.galleryDebug) {
                const state = window.galleryDebug.getState();
                const item = state.displayOrder[itemIndex];
                if (item) {
                    console.log('Actual item data:', {
                        category: item.category,
                        categoryIndex: item.categoryIndex,
                        categoryTotal: state.categoryCounts[item.category]
                    });
                    
                    const indexCorrect = item.categoryIndex === expectedCategoryIndex;
                    const categoryCorrect = item.category === expectedCategory;
                    const totalCorrect = state.categoryCounts[item.category] === expectedCategoryTotal;
                    
                    console.log('Validation:');
                    console.log('  Category match:', categoryCorrect ? '✅' : '❌');
                    console.log('  Index match:', indexCorrect ? '✅' : '❌');
                    console.log('  Total match:', totalCorrect ? '✅' : '❌');
                    
                    return categoryCorrect && indexCorrect && totalCorrect;
                } else {
                    console.error('Item not found in displayOrder');
                    return false;
                }
            }
        } else {
            console.error(`Item ${itemIndex} not found in DOM`);
            return false;
        }
        return false;
    }
    
    // Test first workshop
    const test1 = testLightboxCounter(0, 'workshops', 0, 53);
    
    // Test last workshop (assuming 53 workshops)
    const test2 = testLightboxCounter(52, 'workshops', 52, 53);
    
    // Test first social (assuming it starts at index 53)
    const test3 = testLightboxCounter(53, 'socials', 0, 93);
    
    console.log('\nCounter display tests:', (test1 && test2 && test3) ? '✅ PASS' : '❌ FAIL');
    console.groupEnd();
    
    // Test 3: Navigation test
    console.group('✅ Test 3: Lightbox Navigation');
    console.log('To test navigation:');
    console.log('1. Click on any image to open lightbox');
    console.log('2. Check if counter shows correct format: "Category X/Y"');
    console.log('3. Navigate with arrows and verify counter updates correctly');
    console.log('4. Verify transition between categories shows correct counts');
    console.groupEnd();
    
    // Test 4: State persistence
    console.group('✅ Test 4: State Persistence');
    const savedState = sessionStorage.getItem(`gallery_${window.location.pathname.includes('2024') ? '2024' : '2025'}_state`);
    if (savedState) {
        const parsed = JSON.parse(savedState);
        console.log('Saved categoryItemCounts:', parsed.categoryItemCounts);
        console.log('CategoryItemCounts in session storage:', parsed.categoryItemCounts ? '✅' : '❌');
        
        // Check if displayOrder items have categoryIndex
        const hasCategoryIndices = parsed.displayOrder && 
            parsed.displayOrder.length > 0 && 
            parsed.displayOrder[0].categoryIndex !== undefined;
        console.log('Display order items have categoryIndex:', hasCategoryIndices ? '✅' : '❌');
    } else {
        console.log('No saved state yet - navigate away and back to test persistence');
    }
    console.groupEnd();
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log('The lightbox counter should now show:');
    console.log('- "Workshop X/53" for workshop images');
    console.log('- "Social X/93" for social images');
    console.log('- Where X is the position within that category (1-based)');
    console.log('\n💡 Manual Testing Required:');
    console.log('1. Click on the last workshop image');
    console.log('2. Verify it shows "Workshop 53/53" NOT something like "93/53"');
    console.log('3. Click on the first social image');
    console.log('4. Verify it shows "Social 1/93" NOT "54/93"');
})();