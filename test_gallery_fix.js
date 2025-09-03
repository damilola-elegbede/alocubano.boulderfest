// Test script to verify gallery loading logic

const state = {
    itemsDisplayed: 0,
    totalItemsAvailable: 0,
    loadedPages: 0,
    workshopOffset: 0,
    socialOffset: 0,
    hasMorePages: true,
    hasCompleteDataset: false,
    allCategories: {}
};

// Simulate API response
const apiResponse = {
    totalCount: 69,
    hasMore: true,
    categories: {
        workshops: new Array(20).fill(null).map((_, i) => ({
            id: `item-${i}`,
            name: `Workshop ${i}.jpg`
        }))
    },
    returnedCount: 20,
    offset: 0,
    limit: 20
};

console.log('Testing gallery fix...\n');
console.log('Initial state:', state);
console.log('\nAPI Response:', {
    totalCount: apiResponse.totalCount,
    categoriesCount: Object.keys(apiResponse.categories).length,
    workshopsCount: apiResponse.categories.workshops.length
});

// Apply our fix logic
const data = apiResponse;
const isStaticFetch = false;

if (!isStaticFetch) {
    console.log('\n=== PAGINATED API PATH ===');
    
    // Update total counts from API response
    state.totalItemsAvailable = data.totalCount || 0;
    
    // The API returns paginated categories directly
    const paginatedCategories = data.categories || {};
    
    // Count items in this page
    let pageItemCount = 0;
    Object.values(paginatedCategories).forEach(items => {
        pageItemCount += (items || []).length;
    });
    
    state.itemsDisplayed += pageItemCount;
    state.loadedPages++;
    
    // Update offsets
    if (paginatedCategories.workshops) {
        state.workshopOffset += paginatedCategories.workshops.length;
    }
    
    // Update hasMorePages
    state.hasMorePages = data.hasMore === true || 
                       (state.itemsDisplayed < state.totalItemsAvailable);
    
    console.log('\nProcessed results:');
    console.log('- Page items count:', pageItemCount);
    console.log('- Items displayed:', state.itemsDisplayed);
    console.log('- Total available:', state.totalItemsAvailable);
    console.log('- Has more pages:', state.hasMorePages);
    console.log('- Workshop offset:', state.workshopOffset);
    
    if (pageItemCount > 0) {
        console.log('\n✅ SUCCESS: Gallery would display', pageItemCount, 'items');
    } else {
        console.log('\n❌ FAILURE: No items would be displayed');
    }
}
