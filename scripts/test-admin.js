import bcrypt from "bcryptjs";
import { config } from "dotenv";

// Load environment variables
config();

async function generateAdminCredentials() {
  console.log("=== Admin Dashboard Setup Helper ===\n");

  // Generate a test password and hash
  const testPassword = "testadmin123";
  const passwordHash = await bcrypt.hash(testPassword, 10);

  // Generate a secure session secret
  const crypto = await import("crypto");
  const sessionSecret = crypto.randomBytes(32).toString("base64");

  console.log("1. Add these to your .env.local file:\n");
  console.log("# Admin Dashboard Configuration");
  console.log(`ADMIN_PASSWORD=${passwordHash}`);
  console.log(`ADMIN_SECRET=${sessionSecret}`);
  console.log("ADMIN_SESSION_DURATION=3600000  # 1 hour");
  console.log("ADMIN_MAX_LOGIN_ATTEMPTS=5\n");

  console.log("2. Test credentials:");
  console.log(`   Password: ${testPassword}`);
  console.log("   (Use this password to login, NOT the hash)\n");

  console.log("3. Access the admin dashboard at:");
  console.log("   Local: http://localhost:8080/pages/admin/login.html");
  console.log(
    "   Production: https://your-domain.com/pages/admin/login.html\n",
  );

  console.log("4. For production, generate a secure password:");
  console.log("   - Use a password manager to generate a strong password");
  console.log(
    '   - Run: node scripts/test-admin.js --hash "your-secure-password"',
  );
  console.log("   - Update ADMIN_PASSWORD in production environment\n");

  console.log("=== Security Notes ===");
  console.log("- Never commit .env.local to git");
  console.log("- Use different passwords for development and production");
  console.log("- Rotate session secrets periodically");
  console.log("- Monitor login attempts in production logs\n");
}

async function hashPassword(password) {
  try {
    const hash = await bcrypt.hash(password, 10);
    console.log("\n=== Password Hash Generated ===");
    console.log(`Password: [hidden]`);
    console.log(`Hash: ${hash}`);
    console.log("\nAdd to environment variables:");
    console.log(`ADMIN_PASSWORD=${hash}\n`);
  } catch (error) {
    console.error("Error hashing password:", error);
    throw error;
  }
}

async function testAuthService() {
  console.log("\n=== Testing Auth Service ===\n");

  // Mock minimal environment for testing
  if (!process.env.ADMIN_SECRET) {
    process.env.ADMIN_SECRET =
      "test-secret-for-testing-only-not-for-production";
  }

  try {
    const { AuthService } = await import("../lib/auth-service.js");
    const authService = new AuthService();

    console.log("✅ Auth service loaded successfully");

    // Test token creation
    const token = await authService.createSessionToken("test-admin");
    console.log("✅ Session token created");

    // Test token verification
    const verified = await authService.verifySessionToken(token);
    if (verified.valid) {
      console.log("✅ Token verification working");
      console.log(`   Admin ID: ${verified.admin.id}`);
      console.log(`   Role: ${verified.admin.role}`);
    }

    // Test cookie creation
    const cookie = await authService.createSessionCookie(token);
    if (cookie.includes("admin_session")) {
      console.log("✅ Session cookie created");
    }

    console.log("\n✅ All auth service tests passed!\n");
  } catch (error) {
    console.error("❌ Auth service test failed:", error.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--hash") && args.length >= 2) {
    const passwordIndex = args.indexOf("--hash") + 1;
    const password = args[passwordIndex];
    await hashPassword(password);
  } else if (args.includes("--test")) {
    await testAuthService();
  } else {
    await generateAdminCredentials();
    await testAuthService();
  }
}

main().catch(console.error);
