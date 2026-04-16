import express from "express";
import dotenv from "dotenv";
import { fetchDirectDeals } from "./services/zomatoSources.js";
import { generateRealisticDeals } from "./utils/dataGenerator.js";

dotenv.config();

const app = express();
const port = Number(process.env.MCP_PORT || 7000);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    server: "zomato-mcp",
    port
  });
});

app.post("/mcp", async (req, res) => {
  const requestBody = req.body || {};
  const tool =
    requestBody.tool ||
    requestBody.name ||
    requestBody.action ||
    requestBody.toolId ||
    "";
  const params =
    requestBody.params ||
    requestBody.input ||
    requestBody.arguments ||
    {};

  const supportedTools = new Set([
    "get_zomato_deals",
    "get_deals",
    "search_deals",
    "search_food",
    "search_products",
    "search_restaurants"
  ]);

  if (!supportedTools.has(tool)) {
    return res.status(400).json({
      error: `Unsupported tool: ${tool || "unknown"}`
    });
  }

  try {
    const limit = Number(params.limit || params.count || 8);
    const location = params.city || params.location || params.query || "";
    const cuisine = params.cuisine || params.category || "";
    const result = await fetchDirectDeals({
      location,
      cuisine,
      limit
    });

    const useSyntheticFallback =
      process.env.USE_SYNTHETIC_MCP_FALLBACK !== "false" &&
      (!result.deals.length || result.source === "blocked" || result.source === "unavailable");

    const syntheticDeals = useSyntheticFallback
      ? generateRealisticDeals({
          count: limit,
          cuisine,
          location: location || "Delhi"
        })
      : [];

    const finalDeals = syntheticDeals.length ? syntheticDeals : result.deals;
    const finalSource = syntheticDeals.length ? "mcp-simulated" : result.source;
    const diagnostics = syntheticDeals.length
      ? {
          mode: "synthetic-fallback",
          message: "Live source returned no usable deals, so MCP generated fresh simulated deals for continuity.",
          basedOn: result.diagnostics || null
        }
      : result.diagnostics || null;

    res.json({
      tool,
      data: {
        deals: finalDeals,
        source: finalSource,
        diagnostics,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to fetch Zomato deals"
    });
  }
});

app.listen(port, () => {
  console.log(`Zomato MCP server running on port ${port}`);
});
