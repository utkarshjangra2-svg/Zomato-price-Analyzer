export const getSourceStatus = (source, diagnostics = null) => {
  if (source === "smart-fallback" || diagnostics?.mode === "smart-fallback") {
    return {
      tone: "info",
      title: "Showing smart fallback picks while live data is unavailable.",
      message:
        diagnostics?.message ||
        "These picks are estimated from cuisine, location, and price patterns so the app stays useful even when the live fetch pipeline is empty."
    };
  }

  if (source === "recent-cache" || diagnostics?.mode === "stale-cache") {
    return {
      tone: "warning",
      title: "Showing recently verified deals while live fetch recovers.",
      message:
        diagnostics?.message ||
        "The latest live request came back empty, so the app is showing the most recent verified deals instead of an empty page."
    };
  }

  if (diagnostics?.mode === "empty") {
    return {
      tone: "warning",
      title: "Realtime feed is healthy, but no fresh deals are available right now.",
      message: diagnostics?.message || "Live sources responded successfully, but they did not return any matching deals in the latest refresh."
    };
  }

  if (source === "mcp" || source === "mcp-zomato-web") {
    return {
      tone: "success",
      title: "Realtime MCP feed is active.",
      message: "Results are being fetched from the live MCP pipeline."
    };
  }

  if (source === "mcp-simulated") {
    return {
      tone: "warning",
      title: "MCP continuity mode is active.",
      message: "MCP is serving fresh simulated deals because the live source did not return usable results."
    };
  }

  if (source === "zomato-web") {
    return {
      tone: "info",
      title: "Direct live crawl is active.",
      message: "MCP is unavailable, but the backend is still fetching fresh live data directly."
    };
  }

  if (source === "mongo-cache") {
    return {
      tone: "warning",
      title: "Showing cached database results.",
      message: "These are saved records, not fresh realtime MCP results."
    };
  }

  if (source === "blocked" || diagnostics?.code === "EACCES") {
    return {
      tone: "danger",
      title: "Realtime fetch is blocked by the runtime environment.",
      message: "MCP is up, but outbound requests to the live source are being denied before data can be fetched."
    };
  }

  return {
    tone: "danger",
    title: "Realtime source is offline.",
    message: "MCP and direct live fetch are currently unavailable, so no fresh deals could be loaded."
  };
};
