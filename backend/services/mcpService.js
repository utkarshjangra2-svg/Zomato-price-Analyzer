import axios from "axios";
import { fetchZomatoDeals } from "./zomatoService.js";
import { optimizePrice } from "./priceOptimizer.js";
import { resolveDishQuery } from "./searchIntent.js";
import { fetchDirectDeals } from "./zomatoSources.js";

const buildMcpHeaders = () => {
  const headers = {};
  const bearerToken =
    process.env.MCP_BEARER_TOKEN?.trim() ||
    process.env.ZOMATO_MCP_BEARER_TOKEN?.trim() ||
    process.env.SWIGGY_MCP_BEARER_TOKEN?.trim();
  const authHeaderName =
    process.env.MCP_AUTH_HEADER?.trim() ||
    process.env.ZOMATO_MCP_AUTH_HEADER?.trim() ||
    process.env.SWIGGY_MCP_AUTH_HEADER?.trim();
  const authHeaderValue =
    process.env.MCP_AUTH_VALUE?.trim() ||
    process.env.ZOMATO_MCP_AUTH_VALUE?.trim() ||
    process.env.SWIGGY_MCP_AUTH_VALUE?.trim();

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  if (authHeaderName && authHeaderValue) {
    headers[authHeaderName] = authHeaderValue;
  }

  return headers;
};

class SimpleCache {
  constructor(ttlMs = 300000) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  clear(prefix = "") {
    if (!prefix) {
      this.store.clear();
      return;
    }

    for (const key of this.store.keys()) {
      if (key.includes(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

const cache = new SimpleCache(Number(process.env.MCP_CACHE_TTL_MS) || 15000);

const normalizeDeals = (deals = [], budget = 0, context = {}) =>
  deals
    .map((deal) => optimizePrice(deal, budget, context))
    .filter(Boolean)
    .sort((a, b) => a.finalPrice - b.finalPrice || b.confidence - a.confidence);

const buildStats = (deals = []) => {
  const prices = deals.map((deal) => deal.finalPrice);
  const avgPrice = prices.length
    ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length)
    : 0;

  return {
    totalDeals: deals.length,
    liveDeals: deals.filter((deal) => deal.isOrderableNow).length,
    avgPrice,
    bestDeal: deals[0]
      ? {
          restaurant: deals[0].restaurant,
          finalPrice: deals[0].finalPrice,
          discount: deals[0].discount
        }
      : null
  };
};

export const searchMcpDeals = async ({ location = "", cuisine = "", budget = 0, limit = 12, providers = ["zomato"] }) => {
  if (!Array.isArray(providers) || !providers.length) {
    providers = ["zomato"];
  }
  const resolvedCuisine = resolveDishQuery(cuisine);
  const normalizedProviders = providers.map(p => p?.toString().trim().toLowerCase() || "zomato");
  const cacheKey = `search:${normalizedProviders.join(',')}:${location}:${resolvedCuisine}:${budget}:${limit}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const allDeals = [];
  let combinedSource = "";

  for (const provider of normalizedProviders) {
    try {
      const { deals, source } = await fetchZomatoDeals({
        location,
        cuisine: resolvedCuisine,
        limit: Math.ceil(limit / normalizedProviders.length), // distribute limit
        provider
      });
      allDeals.push(...deals);
      if (source) {
        combinedSource += (combinedSource ? ", " : "") + source;
      }
    } catch (error) {
      console.error(`Error fetching from ${provider}:`, error);
    }
  }

  const normalizedDeals = normalizeDeals(allDeals.slice(0, limit), budget, {
    location,
    cuisine: resolvedCuisine
  });

  const response = {
    source: combinedSource || "multiple",
    resolvedCuisine,
    deals: normalizedDeals,
    stats: buildStats(normalizedDeals),
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, response);
  return response;
};

export const getMcpLiveDeals = async ({ location = "Delhi", cuisine = "", limit = 10, providers = ["zomato"] }) => {
  if (!Array.isArray(providers) || !providers.length) {
    providers = ["zomato"];
  }
  const resolvedCuisine = resolveDishQuery(cuisine);
  const normalizedProviders = providers.map(p => p?.toString().trim().toLowerCase() || "zomato");
  const cacheKey = `live:${normalizedProviders.join(',')}:${location}:${resolvedCuisine}:${limit}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const allDeals = [];
  let combinedSource = "";

  for (const provider of normalizedProviders) {
    try {
      const { deals, source } = await fetchZomatoDeals({
        location,
        cuisine: resolvedCuisine,
        limit: Math.ceil(limit / normalizedProviders.length),
        provider
      });
      allDeals.push(...deals);
      if (source) {
        combinedSource += (combinedSource ? ", " : "") + source;
      }
    } catch (error) {
      console.error(`Error fetching live deals from ${provider}:`, error);
    }
  }

  const normalizedDeals = normalizeDeals(allDeals.slice(0, limit), 0, {
    location,
    cuisine: resolvedCuisine
  });

  const response = {
    source: combinedSource || "multiple",
    resolvedCuisine,
    deals: normalizedDeals,
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, response);
  return response;
};

export const getMcpStats = async ({ location = "Delhi", providers = ["zomato"] } = {}) => {
  if (!Array.isArray(providers) || !providers.length) {
    providers = ["zomato"];
  }
  const normalizedProviders = providers.map(p => p?.toString().trim().toLowerCase() || "zomato");
  const cacheKey = `stats:${normalizedProviders.join(',')}:${location}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const live = await getMcpLiveDeals({ location, limit: 10, providers });
  const stats = {
    ...buildStats(live.deals),
    source: live.source,
    fetchedAt: live.fetchedAt
  };

  cache.set(cacheKey, stats);
  return stats;
};

export const getMcpStatus = async ({ providers = ["zomato"] } = {}) => {
  if (!Array.isArray(providers) || !providers.length) {
    providers = ["zomato"];
  }
  const normalizedProviders = providers.map(p => p?.toString().trim().toLowerCase() || "zomato");
  const statusResults = {};

  for (const provider of normalizedProviders) {
    const rawMcpUrl =
      process.env.MCP_URL?.trim() ||
      (provider === "swiggy" ? process.env.SWIGGY_MCP_URL : process.env.ZOMATO_MCP_URL) ||
      "http://localhost:7000/mcp";
    const healthUrl = rawMcpUrl.replace(/\/mcp$/, "/health");

    try {
      const response = await axios.get(healthUrl, {
        timeout: 5000,
        headers: buildMcpHeaders()
      });
      const probe = await fetchDirectDeals({
        location: "Delhi",
        cuisine: "",
        limit: 1
      });

      statusResults[provider] = {
        reachable: true,
        mode: "ready",
        server: response.data?.server || `${provider}-mcp`,
        port: response.data?.port || 7000,
        healthUrl,
        probe: {
          source: probe.source,
          dealCount: probe.deals.length,
          diagnostics: probe.diagnostics || null
        }
      };
    } catch (error) {
      statusResults[provider] = {
        reachable: false,
        mode: "offline",
        error: error.message || "Unable to reach MCP health endpoint",
        healthUrl
      };
    }
  }

  return statusResults;
};

export const refreshMcpData = async () => {
  cache.clear();
  return { refreshedAt: new Date().toISOString() };
};
