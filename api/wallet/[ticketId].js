import appleWalletService from "../lib/apple-wallet-service.js";
import googleWalletService from "../lib/google-wallet-service.js";
import cors from "../lib/cors-config.js";

export default async function handler(req, res) {
  // Handle CORS
  await cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { ticketId } = req.query;
  const { walletType } = req.query; // 'apple' or 'google'

  if (!ticketId) {
    return res.status(400).json({ error: "Ticket ID is required" });
  }

  try {
    if (req.method === "GET") {
      const response = {
        ticketId,
        apple: {
          available: appleWalletService.isConfigured(),
          downloadUrl: null,
        },
        google: {
          available: googleWalletService.isConfigured(),
          saveUrl: null,
        },
      };

      // Generate Apple Wallet pass if requested or if no specific type requested
      if (
        (!walletType || walletType === "apple") &&
        appleWalletService.isConfigured()
      ) {
        try {
          response.apple.downloadUrl = `/api/wallet/apple/${ticketId}`;
        } catch (error) {
          console.error("Apple Wallet generation failed:", error);
          response.apple.error = "Failed to generate Apple Wallet pass";
        }
      }

      // Generate Google Wallet pass if requested or if no specific type requested
      if (
        (!walletType || walletType === "google") &&
        googleWalletService.isConfigured()
      ) {
        try {
          const googlePass = await googleWalletService.generatePass(ticketId);
          response.google.saveUrl = googlePass.saveUrl;
          response.google.objectId = googlePass.objectId;
        } catch (error) {
          console.error("Google Wallet generation failed:", error);
          response.google.error = "Failed to generate Google Wallet pass";
        }
      }

      // Check if at least one wallet is available
      if (!response.apple.available && !response.google.available) {
        return res.status(503).json({
          error: "Digital wallet services are not configured",
          message: "Please contact support for assistance",
        });
      }

      return res.status(200).json(response);
    } else if (req.method === "DELETE") {
      // Revoke wallet passes
      const { reason } = req.body || {};
      const results = {};

      if (
        (!walletType || walletType === "apple") &&
        appleWalletService.isConfigured()
      ) {
        try {
          await appleWalletService.revokePass(
            ticketId,
            reason || "User requested",
          );
          results.apple = {
            success: true,
            message: "Apple Wallet pass revoked",
          };
        } catch (error) {
          results.apple = { success: false, error: error.message };
        }
      }

      if (
        (!walletType || walletType === "google") &&
        googleWalletService.isConfigured()
      ) {
        try {
          await googleWalletService.revokePass(
            ticketId,
            reason || "User requested",
          );
          results.google = {
            success: true,
            message: "Google Wallet pass revoked",
          };
        } catch (error) {
          results.google = { success: false, error: error.message };
        }
      }

      return res.status(200).json({
        success: true,
        results,
      });
    } else {
      res.setHeader("Allow", ["GET", "DELETE", "OPTIONS"]);
      return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Wallet API error:", error);

    if (error.message === "Ticket not found") {
      return res.status(404).json({ error: "Ticket not found" });
    }

    return res.status(500).json({
      error: "Failed to process wallet pass",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
