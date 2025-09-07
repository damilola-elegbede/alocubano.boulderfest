import { getDatabaseClient } from "./lib/database.js";

export default async function handler(req, res) {
  try {
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
    return res.status(500).json({
      error: "Database error",
      details: error.message
    });
  }
}