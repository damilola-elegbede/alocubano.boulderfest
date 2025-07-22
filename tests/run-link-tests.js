#!/usr/bin/env node

/**
 * A Lo Cubano Boulder Fest - Link Test Runner
 * Main entry point for link validation with comprehensive reporting
 */

import { LinkChecker } from './link-checker.js';
import { TestReporter } from './utils/test-reporter.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class LinkTestRunner {
    constructor() {
        this.options = this.parseArgs();
        this.reporter = new TestReporter('Link Validation', this.options);
    }

    /**
     * Parse command line arguments
     */
    parseArgs() {
        const args = process.argv.slice(2);
        const options = {
            verbose: false,
            checkExternal: true,
            jsonOutput: false,
            outputDir: path.join(__dirname, '..', 'test-reports'),
            timeout: 5000,
            maxRetries: 2
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            switch (arg) {
                case '--verbose':
                case '-v':
                    options.verbose = true;
                    break;
                    
                case '--no-external':
                    options.checkExternal = false;
                    break;
                    
                case '--json':
                    options.jsonOutput = true;
                    break;
                    
                case '--output-dir':
                case '-o':
                    options.outputDir = args[++i];
                    break;
                    
                case '--timeout':
                case '-t':
                    options.timeout = parseInt(args[++i]) || 5000;
                    break;
                    
                case '--retries':
                case '-r':
                    options.maxRetries = parseInt(args[++i]) || 2;
                    break;
                    
                case '--help':
                case '-h':
                    this.printHelp();
                    process.exit(0);
                    break;
                    
                default:
                    if (arg.startsWith('-')) {
                        console.error(`Unknown option: ${arg}`);
                        console.error('Use --help for usage information.');
                        process.exit(1);
                    }
            }
        }

        return options;
    }

    /**
     * Print help information
     */
    printHelp() {
        console.log(`
A Lo Cubano Boulder Fest - Link Test Runner

Usage: node run-link-tests.js [options]

Options:
  -v, --verbose          Enable verbose output
  --no-external          Skip external link checking
  --json                 Generate JSON report
  -o, --output-dir DIR   Output directory for reports (default: test-reports)
  -t, --timeout MS       Timeout for external requests (default: 5000)
  -r, --retries NUM      Max retries for failed requests (default: 2)
  -h, --help             Show this help message

Examples:
  node run-link-tests.js                    # Basic link checking
  node run-link-tests.js --verbose          # Verbose output
  node run-link-tests.js --no-external      # Skip external links
  node run-link-tests.js --json -o reports  # JSON report in custom directory
        `);
    }

    /**
     * Run all link tests
     */
    async run() {
        try {
            console.log('🚀 Starting A Lo Cubano Boulder Fest Link Validation\n');

            // Initialize link checker
            const linkChecker = new LinkChecker(this.options);

            // Run the link checking process
            const result = await linkChecker.checkAllLinks();

            // Exit with appropriate code
            process.exit(result.success ? 0 : 1);

        } catch (error) {
            console.error('❌ Fatal error during link checking:');
            console.error(error.message);
            
            if (this.options.verbose) {
                console.error(error.stack);
            }
            
            process.exit(1);
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n❌ Link validation interrupted by user');
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('\n\n❌ Link validation terminated');
    process.exit(1);
});

// Run the tests
const runner = new LinkTestRunner();
runner.run().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});