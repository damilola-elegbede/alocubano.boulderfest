describe('Link Validation Tests', () => {
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

    test('All internal links should work', async() => {
        const brokenLinks = [];

        for (const pageName of pages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const links = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(link => link.href)
                    .filter(href => !href.startsWith('mailto:') && !href.startsWith('tel:'));
            });

            for (const link of links) {
                if (link.startsWith('http://localhost:8000')) {
                    const response = await page.goto(link, { waitUntil: 'domcontentloaded' });
                    if (response.status() >= 400) {
                        brokenLinks.push({ page: pageName, link, status: response.status() });
                    }
                }
            }
        }

        expect(brokenLinks).toHaveLength(0);
    });

    test('Navigation links should be consistent across all pages', async() => {
        const navStructures = [];

        for (const pageName of pages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const navLinks = await page.evaluate(() => {
                const nav = document.querySelector('.nav-list');
                if (!nav) return [];
                
                return Array.from(nav.querySelectorAll('a')).map(link => ({
                    text: link.textContent.trim(),
                    href: link.getAttribute('href')
                }));
            });

            navStructures.push({ page: pageName, links: navLinks });
        }

        // All pages should have the same navigation structure
        const firstNav = navStructures[0].links;
        navStructures.forEach(({ page, links }) => {
            expect(links).toHaveLength(firstNav.length);
            links.forEach((link, index) => {
                expect(link.text).toBe(firstNav[index].text);
            });
        });
    });

    test('External links should have proper attributes', async() => {
        for (const pageName of pages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const externalLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href^="http"]:not([href*="localhost"])'))
                    .map(link => ({
                        href: link.href,
                        target: link.target,
                        rel: link.rel
                    }));
            });

            externalLinks.forEach(link => {
                expect(link.target).toBe('_blank');
                expect(link.rel).toContain('noopener');
            });
        }
    });

    test('Mailto links should be properly formatted', async() => {
        const pagesWithForms = ['about.html', 'tickets.html'];

        for (const pageName of pagesWithForms) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const mailtoLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href^="mailto:"], form[action^="mailto:"]'))
                    .map(element => element.href || element.action);
            });

            mailtoLinks.forEach(mailto => {
                expect(mailto).toMatch(/^mailto:[\w.-]+@[\w.-]+\.\w+/);
                expect(mailto).toContain('alocubanoboulderfest@gmail.com');
            });
        }
    });

    test('CSS and JS files should load successfully', async() => {
        await page.goto(`${baseUrl}/home.html`);
        
        const resources = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
            const scripts = Array.from(document.querySelectorAll('script[src]'));
            
            return {
                css: links.map(link => link.href),
                js: scripts.map(script => script.src)
            };
        });

        // Check CSS files
        for (const cssUrl of resources.css) {
            const response = await page.goto(cssUrl);
            expect(response.status()).toBe(200);
        }

        // Check JS files
        for (const jsUrl of resources.js) {
            const response = await page.goto(jsUrl);
            expect(response.status()).toBe(200);
        }
    });

    test('Images should load successfully', async() => {
        const failedImages = [];

        for (const pageName of pages) {
            await page.goto(`${baseUrl}/${pageName}`);
            
            const images = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('img')).map(img => ({
                    src: img.src,
                    alt: img.alt,
                    loaded: img.complete && img.naturalHeight !== 0
                }));
            });

            images.forEach(img => {
                if (!img.loaded && !img.src.includes('placeholder')) {
                    failedImages.push({ page: pageName, src: img.src });
                }
            });
        }

        expect(failedImages).toHaveLength(0);
    });
});