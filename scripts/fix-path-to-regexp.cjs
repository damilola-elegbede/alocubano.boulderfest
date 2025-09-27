#!/usr/bin/env node

/**
 * Fix path-to-regexp v8 for Vercel CLI compatibility
 * Adds a default export that Vercel CLI expects
 */

const fs = require('fs');
const path = require('path');

// Find the path-to-regexp index file
const modulePath = path.join(__dirname, '..', 'node_modules', 'path-to-regexp', 'dist', 'index.js');

try {
  if (fs.existsSync(modulePath)) {
    let content = fs.readFileSync(modulePath, 'utf8');

    // Check if already patched
    if (!content.includes('// PATCHED FOR VERCEL')) {
      // Add default export at the end
      const patch = `
// PATCHED FOR VERCEL
module.exports = exports.pathToRegexp;
module.exports.default = exports.pathToRegexp;
module.exports.pathToRegexp = exports.pathToRegexp;
module.exports.compile = exports.compile;
module.exports.parse = exports.parse;
module.exports.tokensToRegexp = exports.tokensToRegexp;
module.exports.match = exports.match;
`;

      content += patch;
      fs.writeFileSync(modulePath, content);
      console.log('✅ Patched path-to-regexp for Vercel compatibility');
    } else {
      console.log('✅ path-to-regexp already patched');
    }
  } else {
    console.warn('⚠️  path-to-regexp module not found at expected location');
  }
} catch (error) {
  console.error('❌ Error patching path-to-regexp:', error.message);
}