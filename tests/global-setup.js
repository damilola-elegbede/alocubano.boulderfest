// Removed complex global setup - tests should be simple and standalone
// If a server is needed for tests, start it separately with npm run start:ci
export default async function globalSetup() {
  // No complex setup needed
  return async () => {
    // No teardown needed
  };
}