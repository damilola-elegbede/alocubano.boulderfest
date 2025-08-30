#!/usr/bin/env node

// Test runner that starts mock server before running unit tests
import { spawn, exec } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { createRequire } from 'module';
import { promisify } from 'util';

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);

const isPortAvailable = async (port) => {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
};

const killProcessOnPort = async (port) => {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(pid => pid);
    
    for (const pid of pids) {
      try {
        console.log(`🔥 Killing existing process ${pid} on port ${port}`);
        await execAsync(`kill -9 ${pid}`);
        await sleep(500); // Brief pause between kills
      } catch (error) {
        // Process might already be dead
        console.log(`⚠️  Process ${pid} already terminated`);
      }
    }
    
    // Give processes time to fully terminate
    await sleep(2000);
  } catch (error) {
    // No processes found on port - this is good
    if (!error.message.includes('No such process')) {
      console.log(`ℹ️  No existing processes found on port ${port}`);
    }
  }
};

const waitForServer = async (port, maxRetries = 30, interval = 1000) => {
  console.log(`⏳ Waiting for server on port ${port} (max ${maxRetries * interval}ms)...`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`http://localhost:${port}/api/health/check`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'test-runner/1.0' }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const healthData = await response.json();
        console.log(`✅ Mock server ready on port ${port} after ${i * interval}ms`);
        console.log(`📊 Server status: ${healthData.status}`);
        return true;
      } else {
        console.log(`⚠️  Server responded with status ${response.status}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`⏱️  Health check timeout on attempt ${i + 1}`);
      } else if (i === 0 || i % 10 === 0) {
        // Log connection errors less frequently
        console.log(`🔄 Server not ready yet (attempt ${i + 1}/${maxRetries})`);
      }
    }
    
    if (i === maxRetries - 1) {
      console.error(`❌ Mock server failed to start within ${maxRetries * interval}ms`);
      return false;
    }
    
    await sleep(interval);
  }
  return false;
};

async function runTestsWithMockServer() {
  const port = process.env.CI_PORT || process.env.PORT || '3000';
  
  console.log('🚀 Starting unit tests with mock server...');
  console.log(`📋 Target port: ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  let mockServer = null;
  let testProcess = null;
  const startTime = Date.now();
  
  // Setup global error handlers for child processes
  const activeProcesses = new Set();
  
  const cleanupProcess = async (process, name, timeoutMs = 5000) => {
    if (!process || process.killed || !activeProcesses.has(process)) {
      return;
    }
    
    console.log(`🔄 Shutting down ${name}...`);
    activeProcesses.delete(process);
    
    return new Promise((resolve) => {
      const cleanup = () => {
        if (!process.killed) {
          console.log(`⚡ Force killing ${name}`);
          process.kill('SIGKILL');
        }
        resolve();
      };
      
      const timeout = setTimeout(cleanup, timeoutMs);
      
      process.on('exit', () => {
        clearTimeout(timeout);
        console.log(`✅ ${name} shut down gracefully`);
        resolve();
      });
      
      if (!process.killed) {
        process.kill('SIGTERM');
      }
    });
  };
  
  try {
    // Kill any existing processes on the port
    console.log('🔍 Checking for existing processes on port...');
    await killProcessOnPort(port);
    
    // Double-check port availability after cleanup
    let portRetries = 3;
    while (portRetries > 0) {
      const available = await isPortAvailable(port);
      if (available) {
        break;
      }
      
      console.log(`⏳ Port ${port} still busy, retrying in 2s... (${portRetries} attempts left)`);
      await sleep(2000);
      portRetries--;
      
      if (portRetries === 0) {
        throw new Error(`Port ${port} is still in use after cleanup attempts`);
      }
    }
    
    console.log(`✅ Port ${port} is available`);
    
    // Start mock server with retry logic
    let serverStartRetries = 3;
    while (serverStartRetries > 0) {
      try {
        console.log(`🔧 Starting CI mock server (attempt ${4 - serverStartRetries}/3)...`);
        mockServer = spawn('node', ['tests/ci-mock-server.js'], {
          env: { 
            ...process.env, 
            CI_PORT: port, 
            PORT: port,
            NODE_ENV: 'test'
          },
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        activeProcesses.add(mockServer);
        globalMockServer = mockServer;
        globalActiveProcesses = activeProcesses;
        
        // Enhanced error handling for mock server
        let serverErrorBuffer = '';
        let serverStartupFailed = false;
        
        mockServer.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            console.log(`[Mock Server] ${output}`);
            // Check for successful startup indicators
            if (output.includes('Server running') || output.includes('listening on')) {
              console.log(`🎯 Mock server startup detected`);
            }
          }
        });
        
        mockServer.stderr.on('data', (data) => {
          const error = data.toString().trim();
          serverErrorBuffer += error + '\n';
          
          if (error && !error.includes('ExperimentalWarning')) {
            console.error(`[Mock Server Error] ${error}`);
            
            // Check for critical startup errors
            if (error.includes('EADDRINUSE') || error.includes('port') || error.includes('address already in use')) {
              serverStartupFailed = true;
            }
          }
        });
        
        mockServer.on('error', (error) => {
          console.error(`❌ Mock server process error: ${error.message}`);
          serverStartupFailed = true;
        });
        
        mockServer.on('exit', (code, signal) => {
          activeProcesses.delete(mockServer);
          if (code !== 0 && code !== null) {
            console.error(`❌ Mock server exited with code ${code}, signal: ${signal}`);
            if (serverErrorBuffer) {
              console.error(`📋 Server error output:\n${serverErrorBuffer}`);
            }
          }
        });
        
        // Give the server a moment to start before health checks
        await sleep(2000);
        
        if (serverStartupFailed) {
          throw new Error('Mock server startup failed due to critical error');
        }
        
        // Wait for server to be ready
        console.log('⏳ Performing health check...');
        const ready = await waitForServer(port);
        
        if (!ready) {
          if (serverStartRetries > 1) {
            console.log(`🔄 Server startup failed, cleaning up for retry...`);
            await cleanupProcess(mockServer, 'mock server');
            mockServer = null;
            await sleep(3000); // Wait before retry
            serverStartRetries--;
            continue;
          } else {
            throw new Error(`Mock server failed to start after 3 attempts. Last error buffer:\n${serverErrorBuffer}`);
          }
        }
        
        console.log(`🚀 Mock server successfully started on port ${port}`);
        break;
        
      } catch (error) {
        console.error(`❌ Mock server startup error: ${error.message}`);
        
        if (mockServer) {
          await cleanupProcess(mockServer, 'mock server');
          mockServer = null;
        }
        
        serverStartRetries--;
        if (serverStartRetries === 0) {
          throw new Error(`Failed to start mock server after 3 attempts: ${error.message}`);
        }
        
        console.log(`🔄 Retrying server startup in 3 seconds...`);
        await sleep(3000);
      }
    }
    
    // Run unit tests with enhanced monitoring
    console.log('🧪 Starting unit tests...');
    const testStartTime = Date.now();
    
    testProcess = spawn('npm', ['run', 'test:simple'], {
      env: { 
        ...process.env, 
        CI_PORT: port,
        PORT: port,
        NODE_ENV: 'test'
      },
      stdio: 'inherit'
    });
    
    activeProcesses.add(testProcess);
    globalTestProcess = testProcess;
    globalActiveProcesses = activeProcesses;
    
    // Monitor test process
    testProcess.on('error', (error) => {
      console.error(`❌ Test process error: ${error.message}`);
    });
    
    // Wait for tests to complete with timeout
    const testResult = await new Promise((resolve, reject) => {
      const testTimeout = setTimeout(() => {
        console.error('⏰ Test execution timeout (10 minutes)');
        reject(new Error('Test execution timed out'));
      }, 10 * 60 * 1000); // 10 minute timeout
      
      testProcess.on('close', (code) => {
        clearTimeout(testTimeout);
        activeProcesses.delete(testProcess);
        resolve(code);
      });
    });
    
    const testDuration = Date.now() - testStartTime;
    const totalDuration = Date.now() - startTime;
    
    if (testResult === 0) {
      console.log(`✅ Unit tests completed successfully in ${testDuration}ms`);
      console.log(`📊 Total execution time: ${totalDuration}ms`);
    } else {
      console.error(`❌ Unit tests failed with exit code ${testResult}`);
      process.exit(testResult);
    }
    
  } catch (error) {
    console.error(`❌ Test execution failed: ${error.message}`);
    
    if (error.stack) {
      console.error(`📋 Stack trace: ${error.stack}`);
    }
    
    process.exit(1);
  } finally {
    // Enhanced cleanup
    console.log('🧹 Starting cleanup...');
    
    const cleanupPromises = [];
    
    if (testProcess) {
      cleanupPromises.push(cleanupProcess(testProcess, 'test process'));
    }
    
    if (mockServer) {
      cleanupPromises.push(cleanupProcess(mockServer, 'mock server'));
    }
    
    await Promise.allSettled(cleanupPromises);
    
    // Final port cleanup
    await sleep(1000);
    await killProcessOnPort(port);
    
    console.log('✅ Cleanup completed');
  }
}

// Global state for graceful shutdown
let isShuttingDown = false;
let globalMockServer = null;
let globalTestProcess = null;
let globalActiveProcesses = new Set();

// Enhanced graceful shutdown handler
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    console.log(`⚠️  Already shutting down, ignoring ${signal}...`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
  
  const shutdownStart = Date.now();
  const cleanupPromises = [];
  
  // Cleanup test process first to avoid test failures
  if (globalTestProcess && !globalTestProcess.killed) {
    console.log('🔄 Stopping test process...');
    cleanupPromises.push(
      new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!globalTestProcess.killed) {
            globalTestProcess.kill('SIGKILL');
          }
          resolve();
        }, 3000);
        
        globalTestProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        globalTestProcess.kill('SIGTERM');
      })
    );
  }
  
  // Cleanup mock server
  if (globalMockServer && !globalMockServer.killed) {
    console.log('🔄 Stopping mock server...');
    cleanupPromises.push(
      new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!globalMockServer.killed) {
            globalMockServer.kill('SIGKILL');
          }
          resolve();
        }, 5000);
        
        globalMockServer.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        globalMockServer.kill('SIGTERM');
      })
    );
  }
  
  // Cleanup any remaining active processes
  for (const process of globalActiveProcesses) {
    if (!process.killed) {
      cleanupPromises.push(
        new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
            resolve();
          }, 2000);
          
          process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          process.kill('SIGTERM');
        })
      );
    }
  }
  
  try {
    // Wait for all processes to shutdown
    await Promise.allSettled(cleanupPromises);
    
    // Final port cleanup
    const port = process.env.CI_PORT || process.env.PORT || '3000';
    await killProcessOnPort(port);
    
    const shutdownDuration = Date.now() - shutdownStart;
    console.log(`✅ Graceful shutdown completed in ${shutdownDuration}ms`);
    
  } catch (error) {
    console.error(`❌ Error during shutdown: ${error.message}`);
  }
  
  process.exit(signal === 'SIGINT' ? 130 : 143);
};

// Enhanced signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  if (error.stack) {
    console.error('📋 Stack trace:', error.stack);
  }
  gracefulShutdown('UNCAUGHT_EXCEPTION').finally(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION').finally(() => process.exit(1));
});

// Wrapper function to track global state
async function runTestsWithMockServerWrapper() {
  try {
    return await runTestsWithMockServer();
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    if (error.stack) {
      console.error('📋 Stack trace:', error.stack);
    }
    await gracefulShutdown('ERROR');
    process.exit(1);
  }
}

// Run the tests
runTestsWithMockServerWrapper();