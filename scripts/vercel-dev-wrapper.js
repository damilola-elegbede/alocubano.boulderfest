#!/usr/bin/env node

/**
 * Vercel Dev Wrapper Script
 * 
 * A simplified wrapper around the enhanced Vercel dev starter
 * for local development with proper port management and startup protection.
 */

import VercelDevStarter from './vercel-dev-start.js';

class VercelDevWrapper {
  constructor() {
    this.options = {
      port: parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10),
      timeout: 120000, // 2 minutes
      useYesFlag: true,
      skipInteractive: true
    };
  }

  async start() {
    console.log('🌟 Vercel Dev Wrapper');
    console.log('=' .repeat(40));
    console.log(`📡 Target port: ${this.options.port}`);
    console.log('🔧 Using enhanced startup protection');
    console.log('');

    try {
      // Use the enhanced Vercel dev starter
      const starter = new VercelDevStarter();
      
      // Override port if specified
      starter.options.port = this.options.port;
      starter.options.useYesFlag = this.options.useYesFlag;
      starter.options.skipInteractive = this.options.skipInteractive;
      starter.options.timeout = this.options.timeout;

      await starter.start();
      
    } catch (error) {
      console.error('❌ Vercel dev wrapper failed:', error.message);
      console.log('\n💡 Try alternative startup methods:');
      console.log('  npm run serve:simple    # Simple HTTP server');
      console.log('  npm run start:clean     # Clean Vercel startup');
      console.log('  npm start               # Start with ngrok');
      process.exit(1);
    }
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
const portArg = args.find(arg => arg.startsWith('--port='));
if (portArg) {
  process.env.PORT = portArg.split('=')[1];
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const wrapper = new VercelDevWrapper();
  wrapper.start();
}

export default VercelDevWrapper;