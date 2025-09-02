#!/usr/bin/env node

/**
 * Simplified Vercel Dev Launcher for CI
 * 
 * Directly starts Vercel dev without complex wrappers that can fail in CI.
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');
const port = process.env.CI_PORT || process.env.PORT || 3000;

console.log('🚀 Starting Vercel Dev for CI');
console.log(`📡 Port: ${port}`);
console.log('');

// Direct spawn of Vercel dev with minimal configuration
const vercelProcess = spawn('npx', [
  'vercel', 
  'dev',
  '--yes',           // Skip all prompts
  '--listen', port.toString()
], {
  cwd: projectRoot,
  stdio: 'inherit',  // Direct output to console
  env: {
    ...process.env,
    PORT: port.toString(),
    NODE_ENV: 'test',
    CI: 'true'
  }
});

// Handle errors
vercelProcess.on('error', (error) => {
  console.error('❌ Failed to start Vercel dev:', error.message);
  process.exit(1);
});

// Handle exit
vercelProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Vercel dev exited with code ${code}`);
    process.exit(code);
  }
});

// Pass through signals for clean shutdown
process.on('SIGTERM', () => {
  vercelProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  vercelProcess.kill('SIGINT');
});