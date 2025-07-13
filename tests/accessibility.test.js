const { AxePuppeteer } = require('@axe-core/puppeteer');

describe('Accessibility Tests', () => {
    const baseUrl = 'http://localhost:8000/pages/typographic';
    const pages = [
        'home.html',
        'about.html',
        'artists.html',
        'schedule.html',
        'gallery.html',
        'tickets.html',
        'donations.html'
    ];

    pages.forEach(page => {
        test(`${page} should be accessible`, async() => {
            await page.goto(`${baseUrl}/${page}`);
            
            const results = await new AxePuppeteer(page)
                .withTags(['wcag2a', 'wcag2aa'])
                .analyze();
            
            expect(results.violations).toHaveLength(0);
        });
    });

    test('Navigation should be keyboard accessible', async() => {
        await page.goto(`${baseUrl}/home.html`);
        
        // Tab through navigation
        await page.keyboard.press('Tab');
        const firstLink = await page.evaluate(() => document.activeElement.tagName);
        expect(firstLink).toBe('A');
    });

    test('All images should have alt text', async() => {
        for (const pageName of pages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const imagesWithoutAlt = await page.evaluate(() => {
                const images = Array.from(document.querySelectorAll('img'));
                return images.filter(img => !img.hasAttribute('alt')).length;
            });
            
            expect(imagesWithoutAlt).toBe(0);
        }
    });

    test('Form elements should have labels', async() => {
        const formsPages = ['about.html', 'tickets.html', 'donations.html'];
        
        for (const pageName of formsPages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const unlabeledInputs = await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                return inputs.filter(input => {
                    const id = input.id;
                    if (!id) return true;
                    const label = document.querySelector(`label[for="${id}"]`);
                    return !label && input.type !== 'submit' && input.type !== 'button';
                }).length;
            });
            
            expect(unlabeledInputs).toBe(0);
        }
    });

    test('Color contrast should meet WCAG standards', async() => {
        await page.goto(`${baseUrl}/home.html`);
        
        const results = await new AxePuppeteer(page)
            .withRules(['color-contrast'])
            .analyze();
        
        expect(results.violations).toHaveLength(0);
    });

    test('Page should have proper heading hierarchy', async() => {
        for (const pageName of pages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const headingHierarchy = await page.evaluate(() => {
                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                let lastLevel = 0;
                let valid = true;
                
                headings.forEach(heading => {
                    const level = parseInt(heading.tagName.charAt(1));
                    if (level > lastLevel + 1) {
                        valid = false;
                    }
                    lastLevel = level;
                });
                
                return valid;
            });
            
            expect(headingHierarchy).toBe(true);
        }
    });
});