import { getDatabaseClient } from "./lib/database.js";
import { addSecurityHeaders } from "./lib/security-headers.js";

export default async function handler(req, res) {
  try {
    // Apply standard API security headers
    await addSecurityHeaders(req, res, { isAPI: true });

    // Disable in production unless explicitly enabled
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_ENDPOINT !== "true") {
      return res.status(404).json({ error: "Not found" });
    }

    // Method guard: only allow GET
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    console.log("Test endpoint called");
    
    // Test database connection
    const db = await getDatabaseClient();
    console.log("Database client obtained");
    
    // Simple query to test
    const result = await db.execute({
      sql: "SELECT COUNT(*) as total FROM tickets",
      args: []
    });
    
    console.log("Query executed successfully");
    
    return res.status(200).json({
      success: true,
      total: result.rows[0].total,
      message: "Database connection working"
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    const payload = { error: "Database error" };
    if (process.env.NODE_ENV !== "production") {
      payload.details = error.message;
    }
    return res.status(500).json(payload);
  }
}