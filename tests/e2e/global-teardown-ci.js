/**
 * E2E global teardown for Vercel Dev environment
 */
export default async function() {
  console.log('🧹 Cleaning up E2E environment');
  
  // Vercel Dev handles server cleanup
  // Database connections are automatically closed
  
  console.log('✅ E2E tests complete');
}