import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const CI_PORT = process.env.CI_PORT || process.env.PORT || '3000';
const BASE_URL = `http://localhost:${CI_PORT}`;
let serverProcess = null;

async function waitForServer(maxAttempts = 30) {
  const fetch = (await import('node-fetch')).default;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`, { timeout: 1000 });
      if (response.ok) return true;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`CI Server failed to start within ${maxAttempts} seconds`);
}

export async function setup() {
  console.log('🚀 Starting CI server for test suite...');
  
  serverProcess = spawn('node', ['scripts/ci-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'true', NODE_ENV: 'test', PORT: CI_PORT },
    cwd: rootDir
  });

  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg.includes('Error') || msg.includes('error')) {
      console.error(`[CI SERVER ERROR] ${msg}`);
    }
  });

  serverProcess.on('error', (error) => {
    console.error('CI Server startup failed:', error.message);
    throw error;
  });

  await waitForServer();
  console.log(`✅ CI Server ready at ${BASE_URL}`);
  process.env.TEST_BASE_URL = BASE_URL;
  return { baseUrl: BASE_URL, port: CI_PORT };
}

export async function teardown() {
  if (!serverProcess) return;
  console.log('🛑 Stopping CI server...');
  
  return new Promise((resolve) => {
    serverProcess.once('exit', () => {
      console.log('✅ CI Server stopped');
      serverProcess = null;
      resolve();
    });
    serverProcess.kill('SIGTERM');
    setTimeout(() => serverProcess?.kill('SIGKILL'), 5000);
  });
}