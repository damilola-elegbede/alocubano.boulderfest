#!/usr/bin/env node

/**
 * Performance Optimization Verification Script
 *
 * Tests the implementation of QR cache and wallet performance optimizations
 * across all target pages to ensure proper integration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class PerformanceOptimizationVerifier {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.results = {
      files: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };
  }

  async verify() {
    console.log('🚀 Verifying Performance Optimization Implementation\n');

    // Check all required files exist
    await this.checkRequiredFiles();

    // Verify page integrations
    await this.verifyPageIntegrations();

    // Check module exports
    await this.checkModuleExports();

    // Verify service worker
    await this.verifyServiceWorker();

    // Print results
    this.printResults();

    return this.results.summary.failed === 0;
  }

  async checkRequiredFiles() {
    console.log('📁 Checking required files...');

    const requiredFiles = [
      'js/qr-cache-manager.js',
      'js/wallet-lazy-loader.js',
      'js/performance-dashboard.js',
      'js/performance-integration.js',
      'js/sw-registration.js',
      'public/sw-qr-cache.js',
      'docs/QR_WALLET_PERFORMANCE_GUIDE.md'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(this.projectRoot, file);
      const exists = fs.existsSync(filePath);

      this.recordResult(file, 'exists', exists, `File ${exists ? 'exists' : 'missing'}`);

      if (exists) {
        // Check file size (should not be empty)
        const stats = fs.statSync(filePath);
        const hasContent = stats.size > 100; // At least 100 bytes
        this.recordResult(file, 'content', hasContent, `File size: ${stats.size} bytes`);
      }
    }
  }

  async verifyPageIntegrations() {
    console.log('\n📄 Verifying page integrations...');

    const targetPages = [
      'pages/my-ticket.html',
      'pages/core/my-tickets.html',
      'pages/core/success.html',
      'pages/core/register-tickets.html'
    ];

    for (const page of targetPages) {
      const filePath = path.join(this.projectRoot, page);

      if (!fs.existsSync(filePath)) {
        this.recordResult(page, 'exists', false, 'Page file missing');
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // Check for performance optimization imports
      const hasQRCache = content.includes('qr-cache-manager.js');
      const hasWalletLazy = content.includes('wallet-lazy-loader.js');
      const hasIntegration = content.includes('performance-integration.js');

      // Check for resource hints
      const hasDNSPrefetch = content.includes('dns-prefetch');
      const hasPreconnect = content.includes('preconnect');

      // Check for lazy containers
      const hasLazyContainers = content.includes('wallet-lazy-container');

      this.recordResult(page, 'qr-cache', hasQRCache, 'QR Cache Manager import');
      this.recordResult(page, 'wallet-lazy', hasWalletLazy, 'Wallet Lazy Loader import');
      this.recordResult(page, 'integration', hasIntegration, 'Performance Integration script');
      this.recordResult(page, 'dns-prefetch', hasDNSPrefetch, 'DNS prefetch hints');
      this.recordResult(page, 'preconnect', hasPreconnect, 'Preconnect hints');
      this.recordResult(page, 'lazy-containers', hasLazyContainers, 'Lazy loading containers');
    }
  }

  async checkModuleExports() {
    console.log('\n🔧 Checking module exports...');

    const modules = [
      { file: 'js/qr-cache-manager.js', exports: ['QRCacheManager', 'window.qrCacheManager'] },
      { file: 'js/wallet-lazy-loader.js', exports: ['WalletLazyLoader', 'window.walletLazyLoader'] },
      { file: 'js/performance-dashboard.js', exports: ['PerformanceDashboard'] },
      { file: 'js/performance-integration.js', exports: ['PerformanceIntegration'] },
      { file: 'js/sw-registration.js', exports: ['ServiceWorkerManager'] }
    ];

    for (const module of modules) {
      const filePath = path.join(this.projectRoot, module.file);

      if (!fs.existsSync(filePath)) {
        this.recordResult(module.file, 'exports', false, 'File missing');
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      let allExportsFound = true;
      for (const exportName of module.exports) {
        if (!content.includes(exportName)) {
          allExportsFound = false;
          break;
        }
      }

      this.recordResult(module.file, 'exports', allExportsFound,
        `Required exports: ${module.exports.join(', ')}`);
    }
  }

  async verifyServiceWorker() {
    console.log('\n⚙️ Verifying Service Worker...');

    const swPath = path.join(this.projectRoot, 'public/sw-qr-cache.js');

    if (!fs.existsSync(swPath)) {
      this.recordResult('sw-qr-cache.js', 'exists', false, 'Service Worker file missing');
      return;
    }

    const content = fs.readFileSync(swPath, 'utf8');

    // Check for required SW features
    const features = [
      { name: 'install-event', pattern: /addEventListener\(['"]install['"]/ },
      { name: 'activate-event', pattern: /addEventListener\(['"]activate['"]/ },
      { name: 'fetch-event', pattern: /addEventListener\(['"]fetch['"]/ },
      { name: 'cache-api', pattern: /caches\.open/ },
      { name: 'qr-handling', pattern: /QR_API_PATTERN/ },
      { name: 'cache-first', pattern: /cache\.match/ },
      { name: 'background-sync', pattern: /addEventListener\(['"]sync['"]/ }
    ];

    for (const feature of features) {
      const hasFeature = feature.pattern.test(content);
      this.recordResult('sw-qr-cache.js', feature.name, hasFeature,
        `Feature: ${feature.name}`);
    }
  }

  recordResult(file, test, passed, description) {
    if (!this.results.files[file]) {
      this.results.files[file] = [];
    }

    this.results.files[file].push({
      test,
      passed,
      description
    });

    this.results.summary.total++;
    if (passed) {
      this.results.summary.passed++;
    } else {
      this.results.summary.failed++;
    }
  }

  printResults() {
    console.log('\n📊 Verification Results\n');

    for (const [file, tests] of Object.entries(this.results.files)) {
      console.log(`📁 ${file}`);

      for (const test of tests) {
        const icon = test.passed ? '✅' : '❌';
        console.log(`  ${icon} ${test.test}: ${test.description}`);
      }

      console.log('');
    }

    const { total, passed, failed } = this.results.summary;
    const percentage = Math.round((passed / total) * 100);

    console.log('═'.repeat(60));
    console.log(`📈 Summary: ${passed}/${total} tests passed (${percentage}%)`);

    if (failed === 0) {
      console.log('🎉 All performance optimizations verified successfully!');
      console.log('\n🚀 Next steps:');
      console.log('  1. Test on development server');
      console.log('  2. Open performance dashboard (Ctrl+Shift+P)');
      console.log('  3. Verify QR cache and wallet lazy loading');
      console.log('  4. Check service worker registration');
    } else {
      console.log(`⚠️  ${failed} issues found. Please review and fix before deployment.`);
    }

    console.log('═'.repeat(60));
  }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new PerformanceOptimizationVerifier();
  verifier.verify()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

export default PerformanceOptimizationVerifier;