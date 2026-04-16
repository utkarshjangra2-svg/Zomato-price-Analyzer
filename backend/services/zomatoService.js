import axios from "axios";
import { extractMcpSource, fetchDirectDeals, normalizeMcpDeals } from "./zomatoSources.js";
import { callZomatoMcpTool } from "./zomatoOfficialMcp.js";
import { callUserZomatoTool } from "./zomatoUserSessionService.js";
import { resolveDishQuery } from "./searchIntent.js";
import { fetchDealsFromMongo } from "./databaseDeals.js";
import { buildSmartFallbackDeals } from "./fallbackDeals.js";

let mcpRetryAfter = 0;
const MCP_RETRY_COOLDOWN_MS = Number(process.env.MCP_RETRY_COOLDOWN_MS || 15000);
const RECENT_LIVE_CACHE_TTL_MS = Number(process.env.RECENT_LIVE_CACHE_TTL_MS || 20 * 60 * 1000);
let lastSourceLog = "";
const recentLiveDealsCache = new Map();

const normalizeProvider = (provider = "zomato") =>
  provider?.toString()?.trim()?.toLowerCase() || "zomato";

const getMcpConfig = (provider = "zomato") => {
  const normalizedProvider = normalizeProvider(provider);
  const baseConfig = {
    url: process.env.MCP_URL?.trim(),
    tool: process.env.MCP_TOOL?.trim(),
    bearerToken: process.env.MCP_BEARER_TOKEN?.trim(),
    authHeaderName: process.env.MCP_AUTH_HEADER?.trim(),
    authHeaderValue: process.env.MCP_AUTH_VALUE?.trim(),
    enabled: process.env.USE_MCP === "true"
  };

  if (normalizedProvider === "swiggy") {
    return {
      ...baseConfig,
      url: baseConfig.url || process.env.SWIGGY_MCP_URL?.trim(),
      tool:
        baseConfig.tool ||
        process.env.SWIGGY_MCP_TOOL?.trim() ||
        process.env.MCP_TOOL?.trim() ||
        "get_deals",
      bearerToken: baseConfig.bearerToken || process.env.SWIGGY_MCP_BEARER_TOKEN?.trim(),
      authHeaderName:
        baseConfig.authHeaderName || process.env.SWIGGY_MCP_AUTH_HEADER?.trim(),
      authHeaderValue:
        baseConfig.authHeaderValue || process.env.SWIGGY_MCP_AUTH_VALUE?.trim(),
      enabled: baseConfig.enabled || process.env.USE_SWIGGY_MCP === "true"
    };
  }

  return {
    ...baseConfig,
    url: baseConfig.url || process.env.ZOMATO_MCP_URL || "http://localhost:7000/mcp",
    tool:
      baseConfig.tool || process.env.ZOMATO_MCP_TOOL?.trim() || "get_zomato_deals",
    bearerToken: baseConfig.bearerToken || process.env.ZOMATO_MCP_BEARER_TOKEN?.trim(),
    authHeaderName:
      baseConfig.authHeaderName || process.env.ZOMATO_MCP_AUTH_HEADER?.trim(),
    authHeaderValue:
      baseConfig.authHeaderValue || process.env.ZOMATO_MCP_AUTH_VALUE?.trim(),
    enabled: baseConfig.enabled || process.env.USE_ZOMATO_MCP === "true"
  };
};

const buildMcpHeaders = (provider = "zomato") => {
  const headers = {};
  const { bearerToken, authHeaderName, authHeaderValue } = getMcpConfig(provider);

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  if (authHeaderName && authHeaderValue) {
    headers[authHeaderName] = authHeaderValue;
  }

  return headers;
};

const isMcpEnabled = (provider = "zomato") => {
  const config = getMcpConfig(provider);
  return config.enabled && Date.now() >= mcpRetryAfter;
};

const getErrorLabel = (error) => error?.message || error?.code || "Unknown MCP error";

const logSourceStatus = (message) => {
  if (lastSourceLog === message) {
    return;
  }

  lastSourceLog = message;
  console.log(message);
};

const buildRecentCacheKey = ({ location = "", cuisine = "" }) =>
  `${location.trim().toLowerCase()}|${cuisine.trim().toLowerCase()}`;

const normalizeLocationText = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getSignificantLocationTokens = (value = "") =>
  normalizeLocationText(value)
    .split(/[,\s]+/)
    .filter((token) => token.length >= 4);

const findMatchingSavedAddress = (addresses = [], requestedLocation = "", locationData = null) => {
  const normalizedLocation = normalizeLocationText(requestedLocation);

  // If we have coordinates, find the closest saved address
  if (locationData?.latitude && locationData?.longitude) {
    const targetLat = locationData.latitude;
    const targetLng = locationData.longitude;

    let closestAddress = null;
    let minDistance = Infinity;

    for (const address of addresses) {
      const addrLat = address.latitude || address.lat;
      const addrLng = address.longitude || address.lng || address.lon;

      if (addrLat && addrLng) {
        const distance = Math.sqrt(
          Math.pow(targetLat - addrLat, 2) + Math.pow(targetLng - addrLng, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestAddress = address;
        }
      }
    }

    // If we found a reasonably close address (within ~10km), use it
    if (closestAddress && minDistance < 0.1) { // Rough approximation: 0.1 degrees ~ 11km
      return closestAddress;
    }
  }

  if (!normalizedLocation || normalizedLocation === "unknown" || normalizedLocation === "detecting") {
    return addresses[0] || null;
  }

  const requestedTokens = getSignificantLocationTokens(normalizedLocation);

  return (
    addresses.find((address) => {
      const addressText = normalizeLocationText(JSON.stringify(address));

      if (!addressText) {
        return false;
      }

      if (addressText.includes(normalizedLocation)) {
        return true;
      }

      if (!requestedTokens.length) {
        return false;
      }

      const matchedTokens = requestedTokens.filter((token) => addressText.includes(token));
      return matchedTokens.length === requestedTokens.length && matchedTokens.length >= Math.min(2, requestedTokens.length);
    }) || addresses[0] || null
  );
};

const saveRecentLiveDeals = ({ location = "", cuisine = "", deals = [], source = "" }) => {
  if (!Array.isArray(deals) || !deals.length) {
    return;
  }

  recentLiveDealsCache.set(buildRecentCacheKey({ location, cuisine }), {
    deals,
    source,
    savedAt: Date.now()
  });
};

const readRecentLiveDeals = ({ location = "", cuisine = "" }) => {
  const keysToTry = [
    buildRecentCacheKey({ location, cuisine }),
    buildRecentCacheKey({ location, cuisine: "" })
  ];

  // Only try empty location if no specific location requested
  if (!location.trim()) {
    keysToTry.push(buildRecentCacheKey({ location: "", cuisine: "" }));
  }

  for (const key of keysToTry) {
    const entry = recentLiveDealsCache.get(key);

    if (!entry) {
      continue;
    }

    if (Date.now() - entry.savedAt > RECENT_LIVE_CACHE_TTL_MS) {
      recentLiveDealsCache.delete(key);
      continue;
    }

    return entry;
  }

  return null;
};

const getZomatoToolCaller = (user = {}) => {
  if (user?.id && user?.zomato?.linked) {
    return (toolName, args = {}) => callUserZomatoTool(String(user.id), toolName, args);
  }

  return (toolName, args = {}) => callZomatoMcpTool(toolName, args);
};

const tryFetchFromMcp = async ({ location, cuisine, limit, provider = "zomato", locationData = null, user = {} }) => {
  const callTool = getZomatoToolCaller(user);

  if (provider === "zomato" || provider === "zomato-mcp") {
    const keyword = cuisine || location || "food";
    let bestAddressId = "";

    // Try to get saved address for user-specific delivery
    try {
      const addressRes = await callTool("get_saved_addresses_for_user", {});
      if (addressRes?.success && addressRes?.result?.length) {
        const rawText = addressRes.result[0]?.text || "";
        const jsonMatch = rawText.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
        const authData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
        const addresses = authData?.addresses || authData?.data?.addresses || [];
        if (addresses.length) {
          const matched = findMatchingSavedAddress(addresses, location, locationData);
          if (matched) {
            // Only use address_id if it's an actual location match
            bestAddressId = String(matched.address_id || matched.id || "");
            console.log(`[MCP] Location "${location}" matched saved address: ${matched.address_id || matched.id}`);
          } else {
            // No match — do NOT fall back to first address (would give wrong city results)
            // We'll embed the location in the keyword instead
            console.log(`[MCP] Location "${location}" not in saved addresses, using keyword-location search`);
          }
        }
      }
    } catch (addrErr) {
      console.log("[MCP] Address fetch skipped:", addrErr.message);
    }

    // Build keyword: always include location when not using address_id (so Zomato searches the right city)
    const keywordWithLocation = bestAddressId
      ? keyword                              // address_id handles location context
      : `${cuisine || ""} ${location || "Delhi"}`.trim().replace(/\s+/g, " ");

    const searchArgs = bestAddressId
      ? { keyword: cuisine || location || "food", address_id: bestAddressId }
      : { keyword: keywordWithLocation };    // let Zomato resolve location from keyword text

    console.log(`[Native MCP] Searching: keyword="${keyword}"`, bestAddressId ? `address_id=${bestAddressId}` : `location=${location}`);

    const searchRes = await callTool("get_restaurants_for_keyword", searchArgs);

    if (!searchRes?.success || !searchRes?.result?.length) {
      throw new Error("MCP get_restaurants_for_keyword returned no results");
    }

    let parsedData = {};
    try {
      const rawSearch = searchRes.result[0]?.text || "";
      const jsonMatch2 = rawSearch.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
      parsedData = JSON.parse(jsonMatch2 ? jsonMatch2[0] : rawSearch);
    } catch (parseErr) {
      throw new Error(`MCP search parse error: ${parseErr.message}`);
    }

    const rawResults = parsedData?.results || [];
    console.log(`[Native MCP] Got ${rawResults.length} restaurants for "${keyword}"`);

    // Use the user-requested location label for display (not the raw MCP address)
    const displayLocation = location || "Nearby";

    const deals = [];
    for (const r of rawResults) {
      const items = r.items?.length ? r.items : [{ name: cuisine || r.name || "Special", price: r.min_price || 200 }];
      for (const item of items) {
        const p = Number(item.price || item.discounted_price || 200);
        const original = item.discounted_price ? Math.round(p / 0.85) : Math.round(p * 1.2);
        const nativeLink = r.url || "";
        const isSearchLink = /\/search\?query=/.test(nativeLink);

        deals.push({
          name: r.name,
          restaurant: r.name,
          res_id: r.res_id,
          dishName: item.name || cuisine || "Dish",
          catalogueId: item.catalogue_id || "",
          cuisine: cuisine || "General",
          location: displayLocation,
          basePrice: original,
          price: p,
          discount: Math.round(((original - p) / original) * 100) || 0,
          rating: Number(r.rating) || 4.0,
          eta: r.eta || "30 mins",
          imageUrl: item.image_link || r.res_image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
          orderUrl: !isSearchLink ? nativeLink : "",
          isLive: true,
          isOrderableNow: !isSearchLink && (r.serviceability_status === "serviceable" || !r.serviceability_status)
        });

        if (deals.length >= limit) break;
      }
      if (deals.length >= limit) break;
    }

    if (!deals.length) {
      throw new Error("MCP returned restaurants but no menu items could be mapped");
    }

    return { deals, upstreamSource: "zomato-native-app", diagnostics: null };
  }

  throw new Error(`Unsupported MCP provider: ${provider}`);
};

export const fetchMcpDeals = async ({ location = "", cuisine = "", limit = 8, providers = ["zomato"], locationData = null, user = {} }) => {
  if (!Array.isArray(providers) || !providers.length) {
    providers = ["zomato"];
  }
  const normalizedProviders = providers.map(p => normalizeProvider(p));
  const normalizedLocation = location.trim();
  const normalizedCuisine = resolveDishQuery(cuisine.trim());

  const allDeals = [];
  let combinedSource = "";
  let diagnostics = null;

  for (const provider of normalizedProviders) {
    if (isMcpEnabled(provider)) {
      try {
        const { deals: mcpDeals, upstreamSource, diagnostics: diag } = await tryFetchFromMcp({
          location: normalizedLocation,
          cuisine: normalizedCuisine,
          limit: Math.ceil(limit / normalizedProviders.length),
          provider,
          locationData,
          user
        });

        if (mcpDeals.length) {
          allDeals.push(...mcpDeals);
          combinedSource += (combinedSource ? ", " : "") + (upstreamSource === "zomato-web" ? "mcp" : upstreamSource || `${provider}-mcp`);
          if (!diagnostics) diagnostics = diag;
          saveRecentLiveDeals({
            location: normalizedLocation,
            cuisine: normalizedCuisine,
            deals: mcpDeals,
            source: upstreamSource === "zomato-web" ? "mcp" : upstreamSource || `${provider}-mcp`
          });
          logSourceStatus(
            `MCP live source active: ${mcpDeals.length} deals from ${upstreamSource} for ${normalizedCuisine || "all cuisines"} in ${normalizedLocation || "default location"}.`
          );
        } else {
          logSourceStatus(
            diag?.code === "EACCES"
              ? "MCP is online, but outbound live fetch is blocked by the runtime environment (EACCES). Trying fallback next."
              : "MCP server is reachable, but it returned 0 deals. Trying fallback next."
          );
        }
      } catch (error) {
        if (error?.code === "ECONNREFUSED") {
          mcpRetryAfter = Date.now() + MCP_RETRY_COOLDOWN_MS;
        }
        logSourceStatus(`MCP fetch failed for ${provider} (${getErrorLabel(error)}). Falling back to next available source.`);
      }
    } else if ((process.env.USE_ZOMATO_MCP === "true" || process.env.USE_SWIGGY_MCP === "true" || process.env.USE_MCP === "true") && mcpRetryAfter > Date.now()) {
      logSourceStatus(`MCP cooldown active for ${Math.ceil((mcpRetryAfter - Date.now()) / 1000)}s after connection failure.`);
    }

    // Removed fallbacks - only MCP now
  }

  // Removed smart fallback - only MCP now

  // Slice to the total limit
  const finalDeals = allDeals.slice(0, limit);

  if (finalDeals.length) {
    return {
      source: combinedSource || "multiple",
      deals: finalDeals,
      diagnostics
    };
  }

  return {
    source: combinedSource || "mcp",
    deals: [],
    diagnostics: {
      mode: "empty",
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      message: "No live MCP deals were available for the requested query."
    }
  };
};

export { fetchMcpDeals as fetchZomatoDeals };
