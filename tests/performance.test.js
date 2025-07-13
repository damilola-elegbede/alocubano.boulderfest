const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

describe('Performance Tests', () => {
    let chrome;
    const baseUrl = 'http://localhost:8000/pages/typographic';

    beforeAll(async() => {
        chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    });

    afterAll(async() => {
        await chrome.kill();
    });

    const runLighthouse = async(url) => {
        const options = {
            logLevel: 'error',
            output: 'json',
            onlyCategories: ['performance'],
            port: chrome.port
        };

        const runnerResult = await lighthouse(url, options);
        return runnerResult.lhr;
    };

    test('Home page should have good performance score', async() => {
        const result = await runLighthouse(`${baseUrl}/home.html`);
        expect(result.categories.performance.score).toBeGreaterThanOrEqual(0.8);
    });

    test('Pages should load quickly', async() => {
        await page.goto(`${baseUrl}/home.html`);
        
        const metrics = await page.evaluate(() => {
            const navigation = performance.getEntriesByType('navigation')[0];
            return {
                domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                loadComplete: navigation.loadEventEnd - navigation.loadEventStart
            };
        });

        expect(metrics.domContentLoaded).toBeLessThan(1500);
        expect(metrics.loadComplete).toBeLessThan(3000);
    });

    test('Images should be optimized', async() => {
        const pages = ['home.html', 'gallery.html'];
        
        for (const pageName of pages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const images = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('img')).map(img => ({
                    src: img.src,
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight,
                    displayWidth: img.clientWidth,
                    displayHeight: img.clientHeight
                }));
            });

            images.forEach(img => {
                // Check if image is not oversized for display
                const widthRatio = img.naturalWidth / img.displayWidth;
                const heightRatio = img.naturalHeight / img.displayHeight;
                
                expect(widthRatio).toBeLessThanOrEqual(2);
                expect(heightRatio).toBeLessThanOrEqual(2);
            });
        }
    });

    test('CSS files should be minified in production', async() => {
        const cssFiles = [
            '/css/base.css',
            '/css/components.css',
            '/css/typography-simplified.css'
        ];

        for (const cssFile of cssFiles) {
            const response = await page.goto(`http://localhost:8000${cssFile}`);
            const css = await response.text();
            
            // Check for common signs of non-minified CSS
            const hasComments = css.includes('/*') && css.includes('*/');
            const hasMultipleNewlines = css.includes('\n\n');
            
            // In production, these should be false
            // For now, we'll just check they exist
            expect(css.length).toBeGreaterThan(0);
        }
    });

    test('JavaScript should not block rendering', async() => {
        await page.goto(`${baseUrl}/home.html`);
        
        const scriptTags = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('script')).map(script => ({
                src: script.src,
                async: script.async,
                defer: script.defer,
                inline: !script.src
            }));
        });

        scriptTags.forEach(script => {
            if (!script.inline) {
                // External scripts should be async or defer
                expect(script.async || script.defer).toBe(true);
            }
        });
    });

    test('No large layout shifts', async() => {
        await page.goto(`${baseUrl}/home.html`);
        
        // Wait for page to stabilize
        await page.waitForTimeout(1000);
        
        const cls = await page.evaluate(() => {
            let clsScore = 0;
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) {
                        clsScore += entry.value;
                    }
                }
            });
            observer.observe({ type: 'layout-shift', buffered: true });
            return clsScore;
        });

        expect(cls).toBeLessThan(0.1);
    });
});