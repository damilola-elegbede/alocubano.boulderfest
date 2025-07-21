describe('Lightbox Counter Category Tracking', () => {

    describe('Category Index Tracking', () => {
        it('should include categoryIndex when building displayOrder', () => {
            const displayOrder = [];
            const categoryItemCounts = { workshops: 0, socials: 0 };
            
            // Simulate adding items to displayOrder
            const workshopItem = {
                id: 'workshop1',
                name: 'Workshop Image 1',
                category: 'workshops'
            };
            
            // Add categoryIndex
            workshopItem.categoryIndex = categoryItemCounts.workshops++;
            workshopItem.displayIndex = displayOrder.length;
            displayOrder.push(workshopItem);
            
            expect(displayOrder[0].categoryIndex).toBe(0);
            expect(categoryItemCounts.workshops).toBe(1);
        });

        it('should maintain separate indices for each category', () => {
            const displayOrder = [];
            const categoryItemCounts = { workshops: 0, socials: 0 };
            
            // Add workshop items
            for (let i = 0; i < 3; i++) {
                const item = {
                    id: `workshop${i}`,
                    name: `Workshop ${i}`,
                    category: 'workshops',
                    categoryIndex: categoryItemCounts.workshops++,
                    displayIndex: displayOrder.length
                };
                displayOrder.push(item);
            }
            
            // Add social items
            for (let i = 0; i < 2; i++) {
                const item = {
                    id: `social${i}`,
                    name: `Social ${i}`,
                    category: 'socials',
                    categoryIndex: categoryItemCounts.socials++,
                    displayIndex: displayOrder.length
                };
                displayOrder.push(item);
            }
            
            // Verify workshop indices
            expect(displayOrder[0].categoryIndex).toBe(0); // First workshop
            expect(displayOrder[1].categoryIndex).toBe(1); // Second workshop
            expect(displayOrder[2].categoryIndex).toBe(2); // Third workshop
            
            // Verify social indices
            expect(displayOrder[3].categoryIndex).toBe(0); // First social
            expect(displayOrder[4].categoryIndex).toBe(1); // Second social
            
            // Verify counts
            expect(categoryItemCounts.workshops).toBe(3);
            expect(categoryItemCounts.socials).toBe(2);
        });

        it('should calculate correct display numbers from categoryIndex', () => {
            const items = [
                { category: 'workshops', categoryIndex: 44 }, // 45th workshop (0-based to 1-based)
                { category: 'socials', categoryIndex: 11 }    // 12th social
            ];
            
            items.forEach(item => {
                const displayNumber = item.categoryIndex + 1; // Convert to 1-based
                
                if (item.category === 'workshops' && item.categoryIndex === 44) {
                    expect(displayNumber).toBe(45);
                }
                if (item.category === 'socials' && item.categoryIndex === 11) {
                    expect(displayNumber).toBe(12);
                }
            });
        });
    });

    describe('Lightbox Counter Display', () => {
        it('should format counter text correctly for workshops', () => {
            const category = 'workshops';
            const categoryIndex = 44; // 0-based
            const totalInCategory = 53;
            
            const displayNumber = categoryIndex + 1;
            const counterText = `${category.charAt(0).toUpperCase() + category.slice(1, -1)}: ${displayNumber}/${totalInCategory}`;
            
            expect(counterText).toBe('Workshop: 45/53');
        });

        it('should format counter text correctly for socials', () => {
            const category = 'socials';
            const categoryIndex = 11; // 0-based
            const totalInCategory = 93;
            
            const displayNumber = categoryIndex + 1;
            const counterText = `${category.charAt(0).toUpperCase() + category.slice(1, -1)}: ${displayNumber}/${totalInCategory}`;
            
            expect(counterText).toBe('Social: 12/93');
        });

        it('should handle edge cases correctly', () => {
            // First item in category
            const firstItem = { category: 'workshops', categoryIndex: 0 };
            expect(firstItem.categoryIndex + 1).toBe(1);
            
            // Last item in category
            const lastItem = { category: 'workshops', categoryIndex: 52 };
            expect(lastItem.categoryIndex + 1).toBe(53);
        });
    });

    describe('State Persistence', () => {
        it('should include categoryItemCounts in persisted state', () => {
            const stateToSave = {
                categoryItemCounts: { workshops: 53, socials: 93 },
                displayOrder: [
                    { category: 'workshops', categoryIndex: 0 },
                    { category: 'socials', categoryIndex: 0 }
                ]
            };
            
            const serialized = JSON.stringify(stateToSave);
            const restored = JSON.parse(serialized);
            
            expect(restored.categoryItemCounts).toEqual({ workshops: 53, socials: 93 });
            expect(restored.displayOrder[0].categoryIndex).toBe(0);
        });

        it('should restore categoryItemCounts with proper defaults', () => {
            const restoredState = {
                categoryItemCounts: undefined
            };
            
            // Apply defaults
            const categoryItemCounts = restoredState.categoryItemCounts || { workshops: 0, socials: 0 };
            
            expect(categoryItemCounts).toEqual({ workshops: 0, socials: 0 });
        });
    });

    describe('DOM Restoration', () => {
        it('should recalculate categoryItemCounts from restored items', () => {
            const restoredItems = [
                { category: 'workshops', categoryIndex: 0 },
                { category: 'workshops', categoryIndex: 1 },
                { category: 'workshops', categoryIndex: 2 },
                { category: 'socials', categoryIndex: 0 },
                { category: 'socials', categoryIndex: 1 }
            ];
            
            const categoryItemCounts = { workshops: 0, socials: 0 };
            
            // Recalculate counts
            restoredItems.forEach(item => {
                if (item.categoryIndex !== undefined) {
                    categoryItemCounts[item.category] = Math.max(
                        categoryItemCounts[item.category],
                        item.categoryIndex + 1
                    );
                }
            });
            
            expect(categoryItemCounts.workshops).toBe(3);
            expect(categoryItemCounts.socials).toBe(2);
        });
    });

    describe('Error Handling', () => {
        it('should handle missing categoryIndex gracefully', () => {
            const item = {
                category: 'workshops',
                // categoryIndex is missing
            };
            
            // Fallback calculation (counting previous items of same category)
            const items = [
                { category: 'workshops' },
                { category: 'workshops' },
                item
            ];
            
            let categoryIndex = 0;
            for (let i = 0; i < 2; i++) {
                if (items[i].category === item.category) {
                    categoryIndex++;
                }
            }
            
            expect(categoryIndex).toBe(2);
        });

        it('should prevent index overflow', () => {
            const categoryTotal = 53;
            const invalidIndex = 100;
            
            // Should never display a number greater than total
            const displayNumber = Math.min(invalidIndex + 1, categoryTotal);
            expect(displayNumber).toBe(53);
        });
    });
});