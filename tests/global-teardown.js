export default async function globalTeardown() {
  console.log('🧹 Running global test teardown...');
  
  // Force garbage collection if available
  if (global.gc) {
    console.log('🗑️  Forcing garbage collection...');
    global.gc();
  }
  
  // Clear all remaining timers
  const highestTimeoutId = setTimeout(() => {}, 0);
  for (let i = 0; i < highestTimeoutId; i++) {
    clearTimeout(i);
    clearInterval(i);
  }
  
  // Clear any global state
  if (global.localStorage) {
    global.localStorage.clear();
  }
  if (global.sessionStorage) {
    global.sessionStorage.clear();
  }
  
  // Log final memory usage
  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    console.log(`📊 Final memory usage:
  RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB
  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB
  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB
  External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
  }
  
  console.log('✅ Global teardown complete');
}