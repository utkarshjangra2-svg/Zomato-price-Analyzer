import express from "express";
import {
  getMcpLiveDeals,
  getMcpStats,
  getMcpStatus,
  refreshMcpData,
  searchMcpDeals
} from "../services/mcpService.js";



const router = express.Router();

router.post("/search", async (req, res) => {
  try {
    const { location = "", cuisine = "", budget = 0, limit = 12, provider = "zomato,swiggy" } = req.body;
    const providers = provider.split(',').map(p => p.trim().toLowerCase()).filter(p => p);
    const result = await searchMcpDeals({ location, cuisine, budget, limit, providers });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("MCP search error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to search MCP deals"
    });
  }
});

router.get("/live", async (req, res) => {
  try {
    const { location = "Delhi", cuisine = "", limit = 10, provider = "zomato,swiggy" } = req.query;
    const providers = provider.split(',').map(p => p.trim().toLowerCase()).filter(p => p);
    const result = await getMcpLiveDeals({ location, cuisine, limit: Number(limit), providers });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("MCP live error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch MCP live deals"
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const { location = "Delhi", provider = "zomato,swiggy" } = req.query;
    const providers = provider.split(',').map(p => p.trim().toLowerCase()).filter(p => p);
    const stats = await getMcpStats({ location, providers });

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error("MCP stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch MCP stats"
    });
  }
});

router.get("/status", async (req, res) => {
  try {
    const { provider = "zomato,swiggy" } = req.query;
    const providers = provider.split(',').map(p => p.trim().toLowerCase()).filter(p => p);
    const status = await getMcpStatus({ providers });

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error("MCP status error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch MCP status"
    });
  }
});

router.post("/refresh", async (_req, res) => {
  try {
    const result = await refreshMcpData();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("MCP refresh error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to refresh MCP cache"
    });
  }
});

export default router;
