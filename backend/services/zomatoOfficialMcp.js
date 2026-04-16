import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ZOMATO_MCP_OFFICIAL_URL =
  process.env.ZOMATO_MCP_OFFICIAL_URL || "https://mcp-server.zomato.com/mcp";

const buildMcpHeaders = () => {
  const headers = {};
  const bearerToken =
    process.env.ZOMATO_MCP_BEARER_TOKEN?.trim() ||
    process.env.MCP_BEARER_TOKEN?.trim();
  const authHeaderName =
    process.env.ZOMATO_MCP_AUTH_HEADER?.trim() ||
    process.env.MCP_AUTH_HEADER?.trim();
  const authHeaderValue =
    process.env.ZOMATO_MCP_AUTH_VALUE?.trim() ||
    process.env.MCP_AUTH_VALUE?.trim();

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  if (authHeaderName && authHeaderValue) {
    headers[authHeaderName] = authHeaderValue;
  }

  return headers;
};

let mcpClient = null;
let availableTools = [];
let connectionStatus = "disconnected";
let lastConnectionAttempt = 0;
const RECONNECT_COOLDOWN_MS = 10000;

const buildTransport = () => {
  return new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["-y", "mcp-remote", ZOMATO_MCP_OFFICIAL_URL]
  });
};

export const connectToZomatoMcp = async () => {
  if (
    connectionStatus === "connecting" ||
    (connectionStatus === "connected" && mcpClient)
  ) {
    return { status: connectionStatus, tools: availableTools };
  }

  if (Date.now() - lastConnectionAttempt < RECONNECT_COOLDOWN_MS) {
    return {
      status: connectionStatus,
      tools: availableTools,
      message: "Reconnect cooldown active"
    };
  }

  lastConnectionAttempt = Date.now();
  connectionStatus = "connecting";

  try {
    const transport = buildTransport();
    const client = new Client(
      { name: "smartdeal-chatbot", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    mcpClient = client;
    connectionStatus = "connected";

    try {
      const toolsResult = await client.listTools();
      availableTools = toolsResult.tools || [];
      console.log(
        `[Zomato MCP] Connected. ${availableTools.length} tools available:`,
        availableTools.map((t) => t.name).join(", ")
      );
    } catch (toolError) {
      console.warn("[Zomato MCP] Connected but failed to list tools:", toolError.message);
      availableTools = [];
    }

    return { status: "connected", tools: availableTools };
  } catch (error) {
    connectionStatus = "error";
    console.error("[Zomato MCP] Connection failed:", error.message);
    return { status: "error", error: error.message, tools: [] };
  }
};

export const callZomatoMcpTool = async (toolName, args = {}) => {
  if (connectionStatus !== "connected" || !mcpClient) {
    const connectResult = await connectToZomatoMcp();
    if (connectResult.status !== "connected") {
      throw new Error(
        `Zomato MCP not connected: ${connectResult.error || "Connection failed"}`
      );
    }
  }

  try {
    const result = await mcpClient.callTool({ name: toolName, arguments: args });
    return {
      success: true,
      tool: toolName,
      result: result.content || result,
      isError: result.isError || false
    };
  } catch (error) {
    console.error(`[Zomato MCP] Tool call failed (${toolName}):`, error.message);

    if (
      error.message.includes("not connected") ||
      error.message.includes("transport")
    ) {
      connectionStatus = "disconnected";
      mcpClient = null;
    }

    throw error;
  }
};

export const getZomatoMcpTools = () => availableTools;

export const getZomatoMcpStatus = () => ({
  status: connectionStatus,
  url: ZOMATO_MCP_OFFICIAL_URL,
  toolCount: availableTools.length,
  tools: availableTools.map((t) => ({
    name: t.name,
    description: t.description
  }))
});

export const disconnectZomatoMcp = async () => {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {}
    mcpClient = null;
  }
  connectionStatus = "disconnected";
  availableTools = [];
};
