// Gallery Test Helper Functions

/**
 * Create a mock saved state with specified age
 * @param {number} age - Age in minutes
 * @param {number} itemCount - Number of items to include
 * @returns {Object} Mock saved state
 */
export const mockSavedState = (age = 0, itemCount = 20) => {
  const workshops = [];
  const socials = [];
  const displayOrder = [];
  const loadedItemIds = [];
  const displayedItemIds = [];

  // Create workshop items (70% of total)
  const workshopCount = Math.floor(itemCount * 0.7);
  for (let i = 0; i < workshopCount; i++) {
    const item = {
      id: `w${i + 1}`,
      name: `Workshop ${i + 1}`,
      thumbnailUrl: `/api/image-proxy/w${i + 1}`,
      viewUrl: `/api/image-proxy/w${i + 1}`,
      category: 'workshops',
      createdAt: new Date(Date.now() - i * 60000).toISOString()
    };
    workshops.push(item);
    
    const displayItem = {
      ...item,
      category: 'workshops',
      displayIndex: displayOrder.length,
      categoryIndex: i
    };
    displayOrder.push(displayItem);
    
    const itemId = `workshops_${item.id}`;
    loadedItemIds.push(itemId);
    displayedItemIds.push(itemId);
  }

  // Create social items (30% of total)
  const socialCount = itemCount - workshopCount;
  for (let i = 0; i < socialCount; i++) {
    const item = {
      id: `s${i + 1}`,
      name: `Social ${i + 1}`,
      thumbnailUrl: `/api/image-proxy/s${i + 1}`,
      viewUrl: `/api/image-proxy/s${i + 1}`,
      category: 'socials',
      createdAt: new Date(Date.now() - (workshopCount + i) * 60000).toISOString()
    };
    socials.push(item);
    
    const displayItem = {
      ...item,
      category: 'socials',
      displayIndex: displayOrder.length,
      categoryIndex: i
    };
    displayOrder.push(displayItem);
    
    const itemId = `socials_${item.id}`;
    loadedItemIds.push(itemId);
    displayedItemIds.push(itemId);
  }

  return {
    timestamp: Date.now() - (age * 60 * 1000),
    allCategories: {
      workshops,
      socials
    },
    categoryCounts: {
      workshops: workshops.length,
      socials: socials.length
    },
    workshopOffset: workshops.length,
    socialOffset: socials.length,
    workshopTotal: workshops.length,
    socialTotal: socials.length,
    totalItemsAvailable: itemCount,
    itemsDisplayed: itemCount,
    hasCompleteDataset: true,
    hasMorePages: false,
    loadedPages: Math.ceil(itemCount / 20),
    displayOrder,
    loadedItemIds,
    displayedItemIds,
    failedImages: [],
    successfulImages: [],
    categoryItemCounts: {
      workshops: workshops.length,
      socials: socials.length
    }
  };
};

/**
 * Create mock gallery data for API responses
 * @param {number} workshops - Number of workshop items
 * @param {number} socials - Number of social items
 * @returns {Object} Mock gallery data
 */
export const createMockGalleryData = (workshops = 10, socials = 5) => {
  const categories = {
    workshops: [],
    socials: []
  };

  // Create workshop items
  for (let i = 0; i < workshops; i++) {
    categories.workshops.push({
      id: `w${i + 1}`,
      name: `Workshop ${i + 1}`,
      type: 'image',
      mimeType: 'image/jpeg',
      category: 'workshops',
      thumbnailUrl: `/api/image-proxy/w${i + 1}`,
      viewUrl: `/api/image-proxy/w${i + 1}`,
      downloadUrl: `/api/image-proxy/w${i + 1}`,
      size: 1024 * 1024 * (1 + Math.random() * 4), // 1-5MB
      createdAt: new Date(Date.now() - i * 3600000).toISOString()
    });
  }

  // Create social items
  for (let i = 0; i < socials; i++) {
    categories.socials.push({
      id: `s${i + 1}`,
      name: `Social Event ${i + 1}`,
      type: 'image',
      mimeType: 'image/jpeg',
      category: 'socials',
      thumbnailUrl: `/api/image-proxy/s${i + 1}`,
      viewUrl: `/api/image-proxy/s${i + 1}`,
      downloadUrl: `/api/image-proxy/s${i + 1}`,
      size: 1024 * 1024 * (1 + Math.random() * 4), // 1-5MB
      createdAt: new Date(Date.now() - (workshops + i) * 3600000).toISOString()
    });
  }

  return {
    year: '2025',
    categories,
    totalCount: workshops + socials,
    cacheTimestamp: new Date().toISOString(),
    source: 'test-mock'
  };
};

/**
 * Simulate state corruption for testing
 * @param {Object} state - Valid state object
 * @returns {Object} Corrupted state
 */
export const simulateStateCorruption = (state) => {
  const corrupted = JSON.parse(JSON.stringify(state)); // Deep clone
  
  // Apply random corruption
  const corruptionTypes = [
    () => {
      // Mismatched counts
      corrupted.categoryCounts.workshops = corrupted.allCategories.workshops.length + 5;
    },
    () => {
      // Invalid display order
      corrupted.displayOrder.push({
        id: 'invalid',
        category: 'nonexistent',
        displayIndex: 999
      });
    },
    () => {
      // Missing required fields
      delete corrupted.timestamp;
    },
    () => {
      // Duplicate items in display order
      if (corrupted.displayOrder.length > 0) {
        corrupted.displayOrder.push(corrupted.displayOrder[0]);
      }
    },
    () => {
      // Invalid data types
      corrupted.allCategories = 'not-an-object';
    }
  ];

  // Apply random corruption
  const corruption = corruptionTypes[Math.floor(Math.random() * corruptionTypes.length)];
  corruption();

  return corrupted;
};

/**
 * Measure restoration performance
 * @param {Function} scenario - Async function to measure
 * @returns {Object} Performance metrics
 */
export const measureRestorationTime = async (scenario) => {
  const metrics = {
    startTime: performance.now(),
    endTime: 0,
    duration: 0,
    memoryBefore: 0,
    memoryAfter: 0,
    memoryDelta: 0
  };

  // Measure initial memory if available
  if (performance.memory) {
    metrics.memoryBefore = performance.memory.usedJSHeapSize;
  }

  // Run scenario
  await scenario();

  // Measure end time and memory
  metrics.endTime = performance.now();
  metrics.duration = metrics.endTime - metrics.startTime;

  if (performance.memory) {
    metrics.memoryAfter = performance.memory.usedJSHeapSize;
    metrics.memoryDelta = metrics.memoryAfter - metrics.memoryBefore;
  }

  return metrics;
};

/**
 * Create a mock DOM structure for gallery testing
 * @returns {Object} DOM elements
 */
export const createMockGalleryDOM = () => {
  const container = document.createElement('div');
  container.innerHTML = `
    <div id="gallery-detail-loading">Loading...</div>
    <div id="gallery-detail-content" style="display: none;">
      <div id="workshops-section" style="display: none;">
        <h2>WORKSHOPS</h2>
        <div id="workshops-gallery" class="gallery-grid"></div>
      </div>
      <div id="socials-section" style="display: none;">
        <h2>SOCIALS</h2>
        <div id="socials-gallery" class="gallery-grid"></div>
      </div>
    </div>
    <div id="gallery-detail-static" style="display: none;">
      <p>No images available</p>
    </div>
    <section class="gallery-stats"></section>
    <main></main>
  `;

  return {
    container,
    loading: container.querySelector('#gallery-detail-loading'),
    content: container.querySelector('#gallery-detail-content'),
    static: container.querySelector('#gallery-detail-static'),
    workshopsSection: container.querySelector('#workshops-section'),
    workshopsGallery: container.querySelector('#workshops-gallery'),
    socialsSection: container.querySelector('#socials-section'),
    socialsGallery: container.querySelector('#socials-gallery'),
    statsSection: container.querySelector('.gallery-stats'),
    main: container.querySelector('main')
  };
};

/**
 * Wait for DOM updates
 * @param {number} delay - Milliseconds to wait
 * @returns {Promise} Resolves after delay
 */
export const waitForDOM = (delay = 0) => {
  return new Promise(resolve => {
    if (delay > 0) {
      setTimeout(resolve, delay);
    } else {
      // Use requestAnimationFrame for next paint
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    }
  });
};

/**
 * Verify gallery item structure
 * @param {Element} item - Gallery item element
 * @returns {Object} Validation result
 */
export const validateGalleryItem = (item) => {
  const errors = [];
  
  if (!item.classList.contains('gallery-item')) {
    errors.push('Missing gallery-item class');
  }

  const index = item.dataset.index;
  if (index === undefined || index === '') {
    errors.push('Missing data-index attribute');
  }

  const category = item.dataset.category;
  if (!['workshops', 'socials'].includes(category)) {
    errors.push(`Invalid category: ${category}`);
  }

  const img = item.querySelector('img');
  if (!img) {
    errors.push('Missing image element');
  } else {
    if (!img.dataset.src && !img.src) {
      errors.push('Missing image source');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Simulate network conditions
 * @param {Object} options - Network simulation options
 * @returns {Function} Fetch wrapper
 */
export const simulateNetwork = (options = {}) => {
  const {
    latency = 0,
    failureRate = 0,
    bandwidth = Infinity
  } = options;

  return async (url, fetchOptions) => {
    // Simulate latency
    if (latency > 0) {
      await new Promise(resolve => setTimeout(resolve, latency));
    }

    // Simulate failure
    if (Math.random() < failureRate) {
      throw new Error('Network request failed');
    }

    // Simulate bandwidth limit (simplified)
    const response = await fetch(url, fetchOptions);
    
    if (bandwidth < Infinity) {
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      const downloadTime = (contentLength / bandwidth) * 1000; // Convert to ms
      await new Promise(resolve => setTimeout(resolve, downloadTime));
    }

    return response;
  };
};

/**
 * Generate performance report
 * @param {Array} metrics - Array of performance measurements
 * @returns {Object} Performance summary
 */
export const generatePerformanceReport = (metrics) => {
  const durations = metrics.map(m => m.duration);
  const memoryDeltas = metrics.map(m => m.memoryDelta).filter(d => d !== 0);

  return {
    timing: {
      min: Math.min(...durations),
      max: Math.max(...durations),
      average: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
    },
    memory: memoryDeltas.length > 0 ? {
      min: Math.min(...memoryDeltas),
      max: Math.max(...memoryDeltas),
      average: memoryDeltas.reduce((a, b) => a + b, 0) / memoryDeltas.length
    } : null,
    sampleSize: metrics.length
  };
};