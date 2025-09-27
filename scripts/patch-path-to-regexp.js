#!/usr/bin/env node

/**
 * Patches path-to-regexp v8.x to be compatible with Vercel CLI
 * This creates a default export wrapper for the named export
 */

const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, '..', 'node_modules', 'path-to-regexp', 'dist.es2015', 'index.js');

if (fs.existsSync(modulePath)) {
  const content = fs.readFileSync(modulePath, 'utf8');

  // Check if already patched
  if (!content.includes('// PATCHED FOR VERCEL COMPATIBILITY')) {
    const patchedContent = content + `
// PATCHED FOR VERCEL COMPATIBILITY
const defaultExport = pathToRegexp;
defaultExport.pathToRegexp = pathToRegexp;
defaultExport.compile = compile;
defaultExport.parse = parse;
defaultExport.tokensToRegexp = tokensToRegexp;
export default defaultExport;
`;

    fs.writeFileSync(modulePath, patchedContent);
    console.log('✅ Patched path-to-regexp for Vercel compatibility');
  } else {
    console.log('✅ path-to-regexp already patched');
  }
} else {
  console.error('❌ Could not find path-to-regexp module');
}