/**
 * A Lo Cubano Boulder Fest - Link Checker
 * Comprehensive link validation with detailed reporting
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';
import { TestReporter } from './utils/test-reporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

class LinkChecker {
    constructor(options = {}) {
        this.options = {
            timeout: 5000,
            followRedirects: true,
            checkExternal: true,
            maxRetries: 2,
            verbose: false,
            ...options
        };
        
        this.reporter = new TestReporter('Link Validation');
        this.results = {
            total: 0,
            broken: 0,
            fixed: 0,
            external: 0,
            internal: 0,
            byType: {
                navigation: { total: 0, broken: 0 },
                content: { total: 0, broken: 0 },
                asset: { total: 0, broken: 0 },
                external: { total: 0, broken: 0 }
            },
            details: [],
            startTime: Date.now(),
            endTime: null
        };
        
        this.checkedUrls = new Map(); // Cache for URL results
        this.retryQueue = new Map(); // Track retries
    }

    /**
     * Main entry point for link checking
     */
    async checkAllLinks() {
        this.reporter.startTest();
        
        try {
            // Discover all HTML files
            const htmlFiles = await this.discoverHtmlFiles();
            this.reporter.log(`Found ${htmlFiles.length} HTML files to check`, 'info');
            
            // Extract all links from HTML files
            const allLinks = await this.extractAllLinks(htmlFiles);
            this.results.total = allLinks.length;
            
            this.reporter.log(`Extracted ${allLinks.length} total links`, 'info');
            
            // Check all links with progress indication
            await this.checkLinksWithProgress(allLinks);
            
            this.results.endTime = Date.now();
            
            // Generate comprehensive report
            const report = await this.generateReport();
            
            // Output results
            this.reporter.displayResults(this.results, report);
            
            return {
                success: this.results.broken === 0,
                results: this.results,
                report
            };
            
        } catch (error) {
            this.reporter.error(`Link checking failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Discover all HTML files in the project
     */
    async discoverHtmlFiles() {
        const htmlFiles = [];
        const searchDirs = [
            path.join(rootDir, 'pages'),
            rootDir // for index.html
        ];

        for (const dir of searchDirs) {
            if (fs.existsSync(dir)) {
                const files = await this.findHtmlFiles(dir);
                htmlFiles.push(...files);
            }
        }

        // Add specific files
        const specificFiles = ['index.html', '404.html'];
        for (const file of specificFiles) {
            const filePath = path.join(rootDir, file);
            if (fs.existsSync(filePath) && !htmlFiles.includes(filePath)) {
                htmlFiles.push(filePath);
            }
        }

        // Filter out unwanted files
        return htmlFiles.filter(file => {
            const relativePath = path.relative(rootDir, file);
            // Exclude coverage reports, node_modules, and other non-production files
            return !relativePath.startsWith('coverage/') && 
                   !relativePath.startsWith('node_modules/') && 
                   !relativePath.includes('/test/') &&
                   !relativePath.includes('/tests/');
        });
    }

    /**
     * Recursively find HTML files
     */
    async findHtmlFiles(dir) {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await this.findHtmlFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.html')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Extract all links from HTML files
     */
    async extractAllLinks(htmlFiles) {
        const allLinks = [];
        
        for (const filePath of htmlFiles) {
            const links = await this.extractLinksFromFile(filePath);
            allLinks.push(...links);
        }

        return allLinks;
    }

    /**
     * Extract links from a single HTML file
     */
    async extractLinksFromFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const links = [];
        const relativePath = path.relative(rootDir, filePath);

        // Regular expressions for different link types
        const linkPatterns = [
            { pattern: /href\s*=\s*["']([^"']+)["']/gi, type: 'navigation' },
            { pattern: /src\s*=\s*["']([^"']+)["']/gi, type: 'asset' },
            { pattern: /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi, type: 'asset' },
            { pattern: /@import\s+["']([^"']+)["']/gi, type: 'asset' }
        ];

        let lineNumber = 1;
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            lineNumber = i + 1;

            for (const { pattern, type } of linkPatterns) {
                let match;
                pattern.lastIndex = 0; // Reset regex
                
                while ((match = pattern.exec(line)) !== null) {
                    const url = match[1];
                    const context = line.trim();
                    
                    // Skip certain URLs (with context awareness)
                    if (this.shouldSkipUrl(url, context)) continue;
                    
                    const linkType = this.categorizeLink(url, type);
                    
                    links.push({
                        url,
                        type: linkType,
                        file: relativePath,
                        filePath,
                        lineNumber,
                        context: context
                    });
                }
            }
        }

        return links;
    }

    /**
     * Check if URL should be skipped
     */
    shouldSkipUrl(url, context = '') {
        const skipPatterns = [
            /^mailto:/,
            /^tel:/,
            /^javascript:/,
            /^#/,
            /^data:/,
            /^\s*$/,
            /\{\{.*\}\}/,  // Template variables
            /<%.*%>/,       // Template variables
            /^\/\/$/,       // Empty protocol-relative URLs
            /\$\{/,         // JavaScript template literals ${}
            /^(request\.|link\.|imageUrl|fileId|url|blob)$/,  // JavaScript variables
            /^(request\.url|link\.href)$/  // JavaScript object properties
        ];

        // Check against skip patterns
        if (skipPatterns.some(pattern => pattern.test(url))) {
            return true;
        }
        
        // Skip DNS prefetch and other resource hints based on context
        if (context.includes('rel="dns-prefetch"') || 
            context.includes('rel="preconnect"') || 
            context.includes('rel="prefetch"')) {
            return true;
        }
        
        // Skip known DNS prefetch URLs as they are external resources
        const dnsPrefetchUrls = [
            '//fonts.googleapis.com',
            '//fonts.gstatic.com',
            '//cdnjs.cloudflare.com',
            '//cdn.jsdelivr.net'
        ];
        
        return dnsPrefetchUrls.includes(url);
    }

    /**
     * Categorize link type
     */
    categorizeLink(url, defaultType) {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return 'external';
        }
        
        // Handle protocol-relative URLs (starting with //)
        if (url.startsWith('//')) {
            return 'external';
        }
        
        if (url.includes('.css') || url.includes('.js') || 
            url.includes('.png') || url.includes('.jpg') || 
            url.includes('.jpeg') || url.includes('.gif') || 
            url.includes('.svg') || url.includes('.ico')) {
            return 'asset';
        }
        
        if (url.includes('.html') || url.startsWith('/') || url.includes('../')) {
            return 'navigation';
        }
        
        return defaultType || 'content';
    }

    /**
     * Check links with progress indication
     */
    async checkLinksWithProgress(links) {
        const batchSize = 10; // Process links in batches
        const batches = [];
        
        for (let i = 0; i < links.length; i += batchSize) {
            batches.push(links.slice(i, i + batchSize));
        }

        this.reporter.startProgress(links.length);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const promises = batch.map(link => this.checkSingleLink(link));
            
            await Promise.all(promises);
            
            this.reporter.updateProgress((i + 1) * batchSize);
        }

        this.reporter.endProgress();
    }

    /**
     * Check a single link
     */
    async checkSingleLink(linkInfo) {
        const { url, type } = linkInfo;
        
        // Update counters
        this.results.byType[type].total++;
        if (type === 'external') {
            this.results.external++;
        } else {
            this.results.internal++;
        }

        try {
            // Check if we've already tested this URL
            if (this.checkedUrls.has(url)) {
                const cachedResult = this.checkedUrls.get(url);
                this.applyResult(linkInfo, cachedResult);
                return;
            }

            let result;
            if (type === 'external') {
                result = await this.checkExternalUrl(url);
            } else {
                result = await this.checkInternalUrl(url, linkInfo.filePath);
            }

            // Cache result
            this.checkedUrls.set(url, result);
            this.applyResult(linkInfo, result);

        } catch (error) {
            const result = {
                status: 'error',
                error: error.message,
                statusCode: null
            };
            
            this.checkedUrls.set(url, result);
            this.applyResult(linkInfo, result);
        }
    }

    /**
     * Apply check result to link info
     */
    applyResult(linkInfo, result) {
        const detail = {
            ...linkInfo,
            ...result,
            timestamp: new Date().toISOString()
        };

        this.results.details.push(detail);

        if (result.status === 'broken' || result.status === 'error') {
            this.results.broken++;
            this.results.byType[linkInfo.type].broken++;
        } else if (result.status === 'fixed') {
            this.results.fixed++;
        }
    }

    /**
     * Check external URL
     */
    async checkExternalUrl(url) {
        if (!this.options.checkExternal) {
            return { status: 'skipped', reason: 'External URL checking disabled' };
        }

        return new Promise((resolve) => {
            const protocol = url.startsWith('https:') ? https : http;
            const timeoutId = setTimeout(() => {
                resolve({ status: 'timeout', error: 'Request timeout' });
            }, this.options.timeout);

            const req = protocol.get(url, (res) => {
                clearTimeout(timeoutId);
                
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    resolve({ status: 'ok', statusCode: res.statusCode });
                } else {
                    resolve({ 
                        status: 'broken', 
                        statusCode: res.statusCode,
                        error: `HTTP ${res.statusCode}`
                    });
                }
            });

            req.on('error', (error) => {
                clearTimeout(timeoutId);
                resolve({ 
                    status: 'error', 
                    error: error.message,
                    statusCode: null 
                });
            });

            req.setTimeout(this.options.timeout, () => {
                req.destroy();
                resolve({ status: 'timeout', error: 'Request timeout' });
            });
        });
    }

    /**
     * Check internal URL with Vercel routing support
     */
    async checkInternalUrl(url, currentFilePath) {
        try {
            // Strip query parameters for file checking
            const cleanUrl = url.split('?')[0];
            
            // Handle Vercel clean URL routing
            const routingResult = this.checkServerRouting(cleanUrl);
            if (routingResult.status === 'ok') {
                return routingResult;
            }
            
            const resolvedPath = this.resolveInternalPath(cleanUrl, currentFilePath);
            
            if (!resolvedPath) {
                return { 
                    status: 'broken', 
                    error: 'Could not resolve path',
                    suggestion: 'Check if the path is correct relative to the current file'
                };
            }

            if (fs.existsSync(resolvedPath)) {
                return { status: 'ok', resolvedPath };
            } else {
                // Try common fixes including server routing
                const suggestion = this.suggestFixWithRouting(cleanUrl, resolvedPath);
                return { 
                    status: 'broken', 
                    error: 'File not found',
                    resolvedPath,
                    suggestion
                };
            }
        } catch (error) {
            return { 
                status: 'error', 
                error: error.message 
            };
        }
    }

    /**
     * Resolve internal path
     */
    resolveInternalPath(url, currentFilePath) {
        try {
            const currentDir = path.dirname(currentFilePath);
            
            if (url.startsWith('/')) {
                // Absolute path from root
                return path.join(rootDir, url.substring(1));
            } else if (url.startsWith('./') || url.startsWith('../')) {
                // Relative path
                return path.resolve(currentDir, url);
            } else {
                // Relative path without ./
                return path.resolve(currentDir, url);
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Check Vercel routing patterns from vercel.json
     */
    checkServerRouting(url) {
        // Handle API endpoints
        if (url.startsWith('/api/')) {
            const apiEndpoints = [
                '/api/featured-photos',
                '/api/gallery',
                '/api/drive-folders', 
                '/api/debug-gallery'
            ];
            
            const isValidApi = apiEndpoints.includes(url) || url.startsWith('/api/image-proxy/');
            
            return {
                status: isValidApi ? 'ok' : 'broken',
                serverRoute: true,
                routeType: 'api'
            };
        }
        
        // Handle gallery-data JSON redirects
        if (url.startsWith('/gallery-data/') && url.endsWith('.json')) {
            const publicPath = path.join(rootDir, 'public', url);
            return {
                status: fs.existsSync(publicPath) ? 'ok' : 'broken',
                serverRoute: true,
                routeType: 'gallery-data-redirect',
                resolvedPath: publicPath
            };
        }
        
        // Handle featured-photos.json redirect
        if (url === '/featured-photos.json') {
            const publicPath = path.join(rootDir, 'public', 'featured-photos.json');
            return {
                status: fs.existsSync(publicPath) ? 'ok' : 'broken', 
                serverRoute: true,
                routeType: 'featured-photos-redirect',
                resolvedPath: publicPath
            };
        }
        
        // Handle root path redirect
        if (url === '/') {
            const indexPath = path.join(rootDir, 'index.html');
            return {
                status: fs.existsSync(indexPath) ? 'ok' : 'broken',
                serverRoute: true,
                routeType: 'root-redirect',
                resolvedPath: indexPath
            };
        }
        
        // Handle Vercel clean URL rewrites
        if (url.startsWith('/') && !this.hasFileExtension(url)) {
            const cleanPath = url.slice(1); // Remove leading slash
            
            // Handle /home specifically (vercel.json: "/home" -> "/pages/home.html")
            if (cleanPath === 'home') {
                const homePath = path.join(rootDir, 'pages', 'home.html');
                if (fs.existsSync(homePath)) {
                    return {
                        status: 'ok',
                        serverRoute: true,
                        routeType: 'vercel-home-rewrite',
                        resolvedPath: homePath
                    };
                }
            }
            
            // Handle other paths (vercel.json: "/((?!api/|home)[^./]+)" -> "/pages/$1.html")
            // This regex excludes api/, home, and paths with dots/slashes
            const vercelPattern = /^(?!api\/|home$)[^./]+$/;
            if (vercelPattern.test(cleanPath)) {
                const pagesPath = path.join(rootDir, 'pages', cleanPath + '.html');
                if (fs.existsSync(pagesPath)) {
                    return {
                        status: 'ok',
                        serverRoute: true,
                        routeType: 'vercel-pages-rewrite',
                        resolvedPath: pagesPath
                    };
                }
            }
            
            // Check if it's a directory with index.html (fallback)
            const fullPath = path.join(rootDir, cleanPath);
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                const indexPath = path.join(fullPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    return {
                        status: 'ok',
                        serverRoute: true,
                        routeType: 'directory-index',
                        resolvedPath: indexPath
                    };
                }
            }
        }
        
        return { status: 'unknown', serverRoute: false };
    }
    
    /**
     * Check if URL has a file extension
     */
    hasFileExtension(url) {
        const extensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.json'];
        return extensions.some(ext => url.endsWith(ext));
    }

    /**
     * Suggest fixes for broken links with server routing awareness
     */
    suggestFixWithRouting(url, resolvedPath) {
        const suggestions = [];
        
        // Check server routing suggestions first
        if (url.startsWith('/')) {
            // Clean URL suggestion
            if (!this.hasFileExtension(url)) {
                const htmlPath = path.join(rootDir, url.slice(1) + '.html');
                if (fs.existsSync(htmlPath)) {
                    suggestions.push(`Server will route ${url} to ${url}.html automatically`);
                }
            }
            
            // Pages directory suggestion
            const pagesPath = path.join(rootDir, 'pages', path.basename(url) + '.html');
            if (fs.existsSync(pagesPath)) {
                suggestions.push(`File exists in pages directory - server routing should handle this`);
            }
        }
        
        // Check if file exists with .html extension
        if (!url.endsWith('.html')) {
            const htmlPath = resolvedPath + '.html';
            if (fs.existsSync(htmlPath)) {
                suggestions.push(`Try adding .html extension: ${url}.html`);
            }
        }
        
        // Check similar files in the same directory
        const dir = path.dirname(resolvedPath);
        const filename = path.basename(resolvedPath);
        
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            const similarFiles = files.filter(file => 
                file.toLowerCase().includes(filename.toLowerCase()) ||
                filename.toLowerCase().includes(file.toLowerCase())
            );
            
            if (similarFiles.length > 0) {
                suggestions.push(`Similar files found: ${similarFiles.join(', ')}`);
            }
        }
        
        // Check common directories
        const commonDirs = ['pages', 'assets', 'images', 'js', 'css'];
        const basename = path.basename(url);
        
        for (const dir of commonDirs) {
            const checkPath = path.join(rootDir, dir, basename);
            if (fs.existsSync(checkPath)) {
                const relativePath = path.relative(path.dirname(resolvedPath), checkPath);
                suggestions.push(`File exists at: ${relativePath}`);
                break;
            }
        }
        
        return suggestions.length > 0 ? suggestions[0] : 'Check file path and server routing configuration';
    }

    /**
     * Generate comprehensive report
     */
    async generateReport() {
        const duration = this.results.endTime - this.results.startTime;
        const successRate = this.results.total > 0 ? 
            ((this.results.total - this.results.broken) / this.results.total * 100).toFixed(1) : 
            100;

        const report = {
            summary: {
                totalLinks: this.results.total,
                brokenLinks: this.results.broken,
                fixedLinks: this.results.fixed,
                successRate: `${successRate}%`,
                duration: `${(duration / 1000).toFixed(2)}s`,
                timestamp: new Date().toISOString()
            },
            breakdown: {
                byType: this.results.byType,
                byStatus: this.getStatusBreakdown()
            },
            brokenLinks: this.getBrokenLinksReport(),
            suggestions: this.generateSuggestions(),
            healthScore: this.calculateHealthScore()
        };

        return report;
    }

    /**
     * Get status breakdown
     */
    getStatusBreakdown() {
        const statusCount = {};
        
        this.results.details.forEach(detail => {
            const status = detail.status;
            statusCount[status] = (statusCount[status] || 0) + 1;
        });

        return statusCount;
    }

    /**
     * Get broken links report
     */
    getBrokenLinksReport() {
        return this.results.details
            .filter(detail => detail.status === 'broken' || detail.status === 'error')
            .map(detail => ({
                url: detail.url,
                type: detail.type,
                file: detail.file,
                lineNumber: detail.lineNumber,
                error: detail.error,
                suggestion: detail.suggestion,
                context: detail.context
            }));
    }

    /**
     * Generate improvement suggestions
     */
    generateSuggestions() {
        const suggestions = [];
        
        if (this.results.broken > 0) {
            suggestions.push({
                priority: 'high',
                category: 'Critical',
                message: `Fix ${this.results.broken} broken links to improve site reliability`
            });
        }
        
        const externalBroken = this.results.byType.external.broken;
        if (externalBroken > 0) {
            suggestions.push({
                priority: 'medium',
                category: 'External Links',
                message: `Review ${externalBroken} broken external links - consider using link monitoring`
            });
        }
        
        const assetBroken = this.results.byType.asset.broken;
        if (assetBroken > 0) {
            suggestions.push({
                priority: 'high',
                category: 'Assets',
                message: `Fix ${assetBroken} broken asset links to prevent loading errors`
            });
        }
        
        if (this.results.total > 100) {
            suggestions.push({
                priority: 'low',
                category: 'Performance',
                message: 'Consider implementing periodic automated link checking'
            });
        }

        return suggestions;
    }

    /**
     * Calculate overall health score
     */
    calculateHealthScore() {
        if (this.results.total === 0) return 100;
        
        const baseScore = ((this.results.total - this.results.broken) / this.results.total) * 100;
        
        // Penalties for different types of issues
        let penalties = 0;
        
        // Critical asset failures
        if (this.results.byType.asset.broken > 0) {
            penalties += this.results.byType.asset.broken * 5;
        }
        
        // Navigation failures
        if (this.results.byType.navigation.broken > 0) {
            penalties += this.results.byType.navigation.broken * 3;
        }
        
        // External link failures (less critical)
        if (this.results.byType.external.broken > 0) {
            penalties += this.results.byType.external.broken * 1;
        }
        
        const finalScore = Math.max(0, baseScore - penalties);
        return Math.round(finalScore);
    }
}

export { LinkChecker };