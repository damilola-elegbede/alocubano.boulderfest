/**
 * Global teardown for Vitest
 * Ensures all resources are cleaned up after test runs
 */

export default async function globalTeardown() {
  console.log("\n🧹 Running global test teardown...");

  // Log final memory usage
  if (process.memoryUsage) {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);

    console.log(
      `📊 Final memory usage: Heap ${heapUsedMB}MB/${heapTotalMB}MB, RSS ${rssMB}MB`,
    );
  }

  // Force final garbage collection
  if (global.gc) {
    try {
      global.gc();
      console.log("✅ Forced garbage collection");
    } catch (e) {
      console.log("⚠️ Could not force garbage collection");
    }
  }

  // Clear any remaining timers (belt and suspenders)
  const maxTimerId = setTimeout(() => {}, 0);
  for (let i = 0; i < maxTimerId; i++) {
    clearTimeout(i);
    clearInterval(i);
  }

  console.log("✅ Global teardown complete\n");
}
