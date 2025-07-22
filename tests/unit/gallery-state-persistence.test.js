// Note: This test was originally written for Vitest but converted to Jest
// Some functionality may need adjustment for Jest environment

describe('Gallery State Persistence', () => {
  let dom;
  let window;
  let document;
  let sessionStorage;
  let originalSessionStorage;

  beforeEach(() => {
    // Create a mock DOM environment (simplified for Jest)
    dom = {
      window: {
        sessionStorage: {
          getItem: jest.fn(),
          setItem: jest.fn(),
          removeItem: jest.fn(),
          clear: jest.fn()
        }
      }
    };
    
    // Mock JSDOM creation
    /* Original JSDOM setup:
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="gallery-detail-loading">Loading...</div>
          <div id="gallery-detail-content" style="display: none;">
            <div id="workshops-section" style="display: none;">
              <div id="workshops-gallery"></div>
            </div>
            <div id="socials-section" style="display: none;">
              <div id="socials-gallery"></div>
            </div>
          </div>
          <main></main>
        </body>
      </html>
    `, { url: 'http://localhost/gallery-2025.html' });
    */

    window = dom.window;
    document = window.document || {
      getElementById: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn()
    };
    global.window = window;
    global.document = document;

    // Mock sessionStorage with quota simulation
    const STORAGE_QUOTA = 5 * 1024 * 1024; // 5MB typical limit
    let currentSize = 0;

    sessionStorage = {
      store: {},
      getItem(key) {
        return this.store[key] || null;
      },
      setItem(key, value) {
        const oldValue = this.store[key] || '';
        const newSize = currentSize - oldValue.length + value.length;
        
        if (newSize > STORAGE_QUOTA) {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        
        this.store[key] = value;
        currentSize = newSize;
      },
      removeItem(key) {
        const value = this.store[key] || '';
        delete this.store[key];
        currentSize -= value.length;
      },
      clear() {
        this.store = {};
        currentSize = 0;
      },
      get length() {
        return Object.keys(this.store).length;
      },
      key(index) {
        return Object.keys(this.store)[index];
      }
    };

    originalSessionStorage = window.sessionStorage;
    window.sessionStorage = sessionStorage;
  });

  afterEach(() => {
    sessionStorage.clear();
    window.sessionStorage = originalSessionStorage;
  });

  describe('SessionStorage Management', () => {
    it('should save state with timestamp', () => {
      const mockState = {
        allCategories: {
          workshops: [{ id: 'w1', name: 'Workshop 1' }],
          socials: [{ id: 's1', name: 'Social 1' }]
        },
        displayOrder: [
          { id: 'w1', name: 'Workshop 1', category: 'workshops' },
          { id: 's1', name: 'Social 1', category: 'socials' }
        ]
      };

      // Mock saveState function
      const saveState = () => {
        const year = '2025';
        const stateKey = `gallery_${year}_state`;
        
        const persistedState = {
          timestamp: Date.now(),
          ...mockState
        };
        
        sessionStorage.setItem(stateKey, JSON.stringify(persistedState));
      };

      // Execute save
      saveState();

      // Verify state was saved with timestamp
      const savedState = JSON.parse(sessionStorage.getItem('gallery_2025_state'));
      expect(savedState).toBeDefined();
      expect(savedState.timestamp).toBeDefined();
      expect(typeof savedState.timestamp).toBe('number');
      expect(savedState.timestamp).toBeLessThanOrEqual(Date.now());
      expect(savedState.timestamp).toBeGreaterThan(Date.now() - 1000); // Within last second
    });

    it('should handle sessionStorage quota exceeded', () => {
      // Create a large state that exceeds quota
      const largeArray = new Array(1000000).fill({ 
        id: 'x', 
        name: 'Very long name with lots of data to exceed storage quota limits' 
      });

      const largeState = {
        timestamp: Date.now(),
        allCategories: {
          workshops: largeArray
        }
      };

      // Attempt to save large state
      const saveState = () => {
        try {
          sessionStorage.setItem('gallery_2025_state', JSON.stringify(largeState));
          return true;
        } catch (error) {
          if (error.name === 'QuotaExceededError') {
            console.error('Storage quota exceeded, state not saved');
            return false;
          }
          throw error;
        }
      };

      // Should handle quota error gracefully
      const saved = saveState();
      expect(saved).toBe(false);
    });

    it('should compress state if needed', () => {
      // Test state compression strategy (to be implemented)
      const state = {
        timestamp: Date.now(),
        allCategories: {
          workshops: Array(100).fill(null).map((_, i) => ({
            id: `w${i}`,
            name: `Workshop ${i}`,
            description: 'A very long description that could be compressed'
          }))
        }
      };

      // Mock compression function
      const compressState = (state) => {
        // Simple compression: remove redundant data
        const compressed = {
          ...state,
          allCategories: {
            workshops: state.allCategories.workshops.map(item => ({
              id: item.id,
              name: item.name
              // Remove description to save space
            }))
          }
        };
        return compressed;
      };

      const original = JSON.stringify(state);
      const compressed = JSON.stringify(compressState(state));

      expect(compressed.length).toBeLessThan(original.length);
    });

    it('should clean up old state data', () => {
      // Add multiple state entries
      sessionStorage.setItem('gallery_2023_state', JSON.stringify({ old: true }));
      sessionStorage.setItem('gallery_2024_state', JSON.stringify({ old: true }));
      sessionStorage.setItem('gallery_2025_state', JSON.stringify({ current: true }));
      sessionStorage.setItem('other_data', 'keep this');

      // Mock cleanup function
      const cleanupOldStates = (currentYear) => {
        const keysToRemove = [];
        
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('gallery_') && key.endsWith('_state')) {
            const year = key.match(/gallery_(\d{4})_state/)?.[1];
            if (year && year !== currentYear) {
              keysToRemove.push(key);
            }
          }
        }

        keysToRemove.forEach(key => sessionStorage.removeItem(key));
        return keysToRemove.length;
      };

      // Run cleanup
      const removed = cleanupOldStates('2025');

      // Verify old states were removed
      expect(removed).toBe(2);
      expect(sessionStorage.getItem('gallery_2023_state')).toBeNull();
      expect(sessionStorage.getItem('gallery_2024_state')).toBeNull();
      expect(sessionStorage.getItem('gallery_2025_state')).toBeTruthy();
      expect(sessionStorage.getItem('other_data')).toBe('keep this');
    });
  });

  describe('State Validation', () => {
    it('should validate state structure before restoration', () => {
      const validateState = (state) => {
        if (!state || typeof state !== 'object') return false;
        if (typeof state.timestamp !== 'number') return false;
        if (!state.allCategories || typeof state.allCategories !== 'object') return false;
        if (!Array.isArray(state.displayOrder)) return false;
        
        // Validate category structure
        for (const [category, items] of Object.entries(state.allCategories)) {
          if (!Array.isArray(items)) return false;
          for (const item of items) {
            if (!item.id || !item.name) return false;
          }
        }
        
        return true;
      };

      // Valid state
      const validState = {
        timestamp: Date.now(),
        allCategories: {
          workshops: [{ id: 'w1', name: 'Workshop 1' }]
        },
        displayOrder: [{ id: 'w1', category: 'workshops' }]
      };

      expect(validateState(validState)).toBe(true);

      // Invalid states
      expect(validateState(null)).toBe(false);
      expect(validateState({})).toBe(false);
      expect(validateState({ timestamp: 'not-a-number' })).toBe(false);
      expect(validateState({ 
        timestamp: Date.now(), 
        allCategories: 'not-an-object' 
      })).toBe(false);
      expect(validateState({
        timestamp: Date.now(),
        allCategories: { workshops: 'not-an-array' },
        displayOrder: []
      })).toBe(false);
    });

    it('should detect and handle corrupted state', () => {
      const detectCorruption = (state) => {
        try {
          // Check for data inconsistencies
          const displayedIds = new Set(state.displayOrder.map(item => `${item.category}_${item.id}`));
          const loadedIds = new Set(state.loadedItemIds || []);
          
          // All displayed items should be in loaded items
          for (const id of displayedIds) {
            if (!loadedIds.has(id)) {
              return { corrupted: true, reason: 'displayOrder contains unloaded items' };
            }
          }

          // Check category counts match
          const actualCounts = {};
          for (const [category, items] of Object.entries(state.allCategories || {})) {
            actualCounts[category] = items.length;
          }

          for (const [category, count] of Object.entries(state.categoryCounts || {})) {
            if (actualCounts[category] !== count) {
              return { corrupted: true, reason: 'category count mismatch' };
            }
          }

          return { corrupted: false };
        } catch (error) {
          return { corrupted: true, reason: error.message };
        }
      };

      // Corrupted state with mismatched counts
      const corruptedState = {
        allCategories: {
          workshops: [{ id: 'w1' }, { id: 'w2' }]
        },
        categoryCounts: {
          workshops: 5 // Mismatch!
        },
        displayOrder: [],
        loadedItemIds: []
      };

      const result = detectCorruption(corruptedState);
      expect(result.corrupted).toBe(true);
      expect(result.reason).toContain('category count mismatch');
    });

    it('should verify category counts match items', () => {
      const verifyCategoryCounts = (state) => {
        const expectedCounts = {};
        
        // Count actual items
        for (const [category, items] of Object.entries(state.allCategories || {})) {
          expectedCounts[category] = items.length;
        }

        // Compare with stored counts
        for (const [category, storedCount] of Object.entries(state.categoryCounts || {})) {
          if (expectedCounts[category] !== storedCount) {
            return false;
          }
        }

        return true;
      };

      const validState = {
        allCategories: {
          workshops: [{ id: 'w1' }, { id: 'w2' }],
          socials: [{ id: 's1' }]
        },
        categoryCounts: {
          workshops: 2,
          socials: 1
        }
      };

      const invalidState = {
        allCategories: {
          workshops: [{ id: 'w1' }]
        },
        categoryCounts: {
          workshops: 3 // Wrong count
        }
      };

      expect(verifyCategoryCounts(validState)).toBe(true);
      expect(verifyCategoryCounts(invalidState)).toBe(false);
    });

    it('should ensure displayOrder integrity', () => {
      const validateDisplayOrder = (state) => {
        const errors = [];
        const seenIds = new Set();
        const expectedIndices = new Set();

        state.displayOrder.forEach((item, index) => {
          // Check for duplicates
          const itemKey = `${item.category}_${item.id}`;
          if (seenIds.has(itemKey)) {
            errors.push(`Duplicate item in displayOrder: ${itemKey}`);
          }
          seenIds.add(itemKey);

          // Check display index matches position
          if (item.displayIndex !== index) {
            errors.push(`Display index mismatch at position ${index}: expected ${index}, got ${item.displayIndex}`);
          }

          // Check item exists in allCategories
          const categoryItems = state.allCategories[item.category];
          if (!categoryItems || !categoryItems.find(cat => cat.id === item.id)) {
            errors.push(`Item ${itemKey} in displayOrder not found in allCategories`);
          }
        });

        return errors;
      };

      const validState = {
        allCategories: {
          workshops: [{ id: 'w1' }, { id: 'w2' }]
        },
        displayOrder: [
          { id: 'w1', category: 'workshops', displayIndex: 0 },
          { id: 'w2', category: 'workshops', displayIndex: 1 }
        ]
      };

      const invalidState = {
        allCategories: {
          workshops: [{ id: 'w1' }]
        },
        displayOrder: [
          { id: 'w1', category: 'workshops', displayIndex: 0 },
          { id: 'w2', category: 'workshops', displayIndex: 1 }, // Doesn't exist
          { id: 'w1', category: 'workshops', displayIndex: 2 }  // Duplicate
        ]
      };

      expect(validateDisplayOrder(validState)).toEqual([]);
      
      const errors = validateDisplayOrder(invalidState);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('not found in allCategories'))).toBe(true);
      expect(errors.some(e => e.includes('Duplicate item'))).toBe(true);
    });
  });

  describe('Cross-Session Compatibility', () => {
    it('should handle state from different gallery years', () => {
      // Save states for different years
      const state2024 = {
        timestamp: Date.now(),
        year: '2024',
        allCategories: { workshops: [] }
      };

      const state2025 = {
        timestamp: Date.now(),
        year: '2025',
        allCategories: { socials: [] }
      };

      sessionStorage.setItem('gallery_2024_state', JSON.stringify(state2024));
      sessionStorage.setItem('gallery_2025_state', JSON.stringify(state2025));

      // Mock function to get state for specific year
      const getStateForYear = (year) => {
        const stateKey = `gallery_${year}_state`;
        const stateStr = sessionStorage.getItem(stateKey);
        return stateStr ? JSON.parse(stateStr) : null;
      };

      // Verify correct state is retrieved for each year
      const retrieved2024 = getStateForYear('2024');
      const retrieved2025 = getStateForYear('2025');

      expect(retrieved2024?.year).toBe('2024');
      expect(retrieved2025?.year).toBe('2025');
    });

    it('should clear state when switching years', () => {
      // Mock year switching function
      const switchGalleryYear = (fromYear, toYear) => {
        // Clear old year state
        const oldStateKey = `gallery_${fromYear}_state`;
        sessionStorage.removeItem(oldStateKey);

        // Initialize new year state
        const newStateKey = `gallery_${toYear}_state`;
        const newState = {
          timestamp: Date.now(),
          year: toYear,
          allCategories: {},
          displayOrder: []
        };
        sessionStorage.setItem(newStateKey, JSON.stringify(newState));
      };

      // Set initial state
      sessionStorage.setItem('gallery_2024_state', JSON.stringify({ data: 'old' }));

      // Switch years
      switchGalleryYear('2024', '2025');

      // Verify old state is cleared and new state exists
      expect(sessionStorage.getItem('gallery_2024_state')).toBeNull();
      expect(sessionStorage.getItem('gallery_2025_state')).toBeTruthy();

      const newState = JSON.parse(sessionStorage.getItem('gallery_2025_state'));
      expect(newState.year).toBe('2025');
    });

    it('should preserve user preferences across sessions', () => {
      // Mock user preferences that should persist across gallery years
      const userPrefs = {
        viewMode: 'grid',
        sortOrder: 'newest',
        autoplayEnabled: false
      };

      const saveUserPreferences = (prefs) => {
        sessionStorage.setItem('gallery_user_preferences', JSON.stringify(prefs));
      };

      const getUserPreferences = () => {
        const prefsStr = sessionStorage.getItem('gallery_user_preferences');
        return prefsStr ? JSON.parse(prefsStr) : null;
      };

      // Save preferences
      saveUserPreferences(userPrefs);

      // Clear gallery state (simulating year switch)
      sessionStorage.removeItem('gallery_2024_state');
      sessionStorage.removeItem('gallery_2025_state');

      // Preferences should still exist
      const retrievedPrefs = getUserPreferences();
      expect(retrievedPrefs).toEqual(userPrefs);
    });
  });
});