#!/usr/bin/env node

/**
 * Test script for Vercel deployment detection
 * Demonstrates how the GitHub Actions workflow detects deployment URLs
 */

const https = require("https");
const { execSync } = require("child_process");

class DeploymentDetector {
  constructor(options = {}) {
    this.repo = options.repo || "alocubano/alocubano.boulderfest";
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Query GitHub Deployments API for Vercel deployments
   */
  async getVercelDeployments(ref) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        port: 443,
        path: `/repos/${this.repo}/deployments?ref=${ref}&per_page=10`,
        method: "GET",
        headers: {
          Authorization: `token ${this.githubToken}`,
          "User-Agent": "deployment-detector-script",
          Accept: "application/vnd.github.v3+json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const deployments = JSON.parse(data);
            resolve(deployments);
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on("error", reject);
      req.setTimeout(this.timeout);
      req.end();
    });
  }

  /**
   * Get deployment statuses for a specific deployment
   */
  async getDeploymentStatuses(deploymentId) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        port: 443,
        path: `/repos/${this.repo}/deployments/${deploymentId}/statuses`,
        method: "GET",
        headers: {
          Authorization: `token ${this.githubToken}`,
          "User-Agent": "deployment-detector-script",
          Accept: "application/vnd.github.v3+json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const statuses = JSON.parse(data);
            resolve(statuses);
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on("error", reject);
      req.setTimeout(this.timeout);
      req.end();
    });
  }

  /**
   * Construct expected Vercel URL based on branch name
   */
  constructVercelUrl(branchName) {
    // Sanitize branch name for Vercel URL format
    const sanitizedBranch = branchName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);

    if (branchName === "main") {
      return {
        url: "https://alocubanoboulderfest.vercel.app",
        environment: "Production",
      };
    } else {
      return {
        url: `https://alocubanoboulderfest-git-${sanitizedBranch}-alocubano.vercel.app`,
        environment: "Preview",
      };
    }
  }

  /**
   * Check if a URL is accessible
   */
  async checkUrl(url, timeout = 10000) {
    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: "HEAD",
        timeout: timeout,
        headers: {
          "User-Agent": "deployment-detector-script",
        },
      };

      const req = https.request(options, (res) => {
        resolve({
          accessible: true,
          status: res.statusCode,
          headers: res.headers,
        });
      });

      req.on("error", () => resolve({ accessible: false }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ accessible: false });
      });

      req.end();
    });
  }

  /**
   * Full deployment detection workflow
   */
  async detectDeployment(branchName, ref) {
    console.log(
      `🔍 Detecting deployment for branch: ${branchName}, ref: ${ref}`,
    );

    let deploymentUrl = "";
    let deploymentId = "";
    let environment = "";

    try {
      // Step 1: Query GitHub Deployments API
      console.log("📡 Querying GitHub Deployments API...");
      const deployments = await this.getVercelDeployments(ref);

      // Find Vercel deployment
      const vercelDeployment = deployments.find(
        (d) =>
          d.creator.login === "vercel[bot]" ||
          d.payload?.type === "vercel" ||
          d.environment?.includes("vercel") ||
          d.description?.includes("vercel"),
      );

      if (vercelDeployment) {
        deploymentId = vercelDeployment.id;
        environment = vercelDeployment.environment;

        console.log(`✅ Found Vercel deployment: ${deploymentId}`);

        // Get deployment status
        const statuses = await this.getDeploymentStatuses(deploymentId);
        const latestStatus = statuses[0];

        if (latestStatus) {
          deploymentUrl =
            latestStatus.target_url || latestStatus.environment_url;
          console.log(`📍 Deployment URL from API: ${deploymentUrl}`);
        }
      } else {
        console.log("⚠️ No Vercel deployment found in API");
      }
    } catch (error) {
      console.log(`⚠️ API query failed: ${error.message}`);
    }

    // Step 2: Fallback to URL construction
    if (!deploymentUrl) {
      console.log("🔧 Constructing deployment URL...");
      const constructed = this.constructVercelUrl(branchName);
      deploymentUrl = constructed.url;
      environment = constructed.environment;
      console.log(`🏗️ Constructed URL: ${deploymentUrl}`);
    }

    // Step 3: Verify URL accessibility
    console.log("🏥 Checking deployment accessibility...");
    const accessibility = await this.checkUrl(deploymentUrl);

    if (accessibility.accessible) {
      console.log(`✅ Deployment accessible: HTTP ${accessibility.status}`);
    } else {
      console.log("❌ Deployment not accessible");
    }

    return {
      deploymentUrl,
      deploymentId,
      environment,
      accessible: accessibility.accessible,
      status: accessibility.status,
    };
  }
}

// Example usage
async function main() {
  const detector = new DeploymentDetector();

  // Test different scenarios
  const testCases = [
    { branch: "main", ref: "main" },
    { branch: "feature/ticket-system", ref: "abc123" },
    { branch: "fix/performance-issue", ref: "def456" },
  ];

  console.log("🚀 Testing Vercel Deployment Detection\n");

  for (const testCase of testCases) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing: ${testCase.branch} (${testCase.ref})`);
    console.log("=".repeat(60));

    try {
      const result = await detector.detectDeployment(
        testCase.branch,
        testCase.ref,
      );

      console.log("\n📊 Results:");
      console.log(`  URL: ${result.deploymentUrl}`);
      console.log(`  Environment: ${result.environment}`);
      console.log(`  Deployment ID: ${result.deploymentId || "N/A"}`);
      console.log(`  Accessible: ${result.accessible ? "✅" : "❌"}`);
      if (result.status) {
        console.log(`  HTTP Status: ${result.status}`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  // Additional URL construction tests
  console.log("\n\n🧪 URL Construction Tests");
  console.log("=".repeat(60));

  const branches = [
    "main",
    "feature/awesome-feature",
    "fix/bug-123",
    "chore/update-deps",
    "feature/very-long-branch-name-that-exceeds-limits",
  ];

  const detector2 = new DeploymentDetector();
  branches.forEach((branch) => {
    const result = detector2.constructVercelUrl(branch);
    console.log(`${branch.padEnd(30)} -> ${result.url}`);
  });
}

// GitHub CLI integration example
function demonstrateGitHubCLI() {
  console.log("\n\n🔧 GitHub CLI Integration Example");
  console.log("=".repeat(60));

  try {
    // Example of how the GitHub Action would query deployments
    const command =
      "gh api repos/alocubano/alocubano.boulderfest/deployments --field per_page=5";
    console.log(`Command: ${command}`);

    // Note: This requires gh CLI to be installed and authenticated
    // const result = execSync(command, { encoding: 'utf8' });
    // console.log('Result:', JSON.parse(result));

    console.log("(Install and authenticate GitHub CLI to test this)");
  } catch (error) {
    console.log(`Note: GitHub CLI not available (${error.message})`);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => demonstrateGitHubCLI())
    .catch(console.error);
}

module.exports = { DeploymentDetector };
