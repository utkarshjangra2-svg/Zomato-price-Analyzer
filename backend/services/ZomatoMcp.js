import axios from "axios";

const MCP_URL = process.env.ZOMATO_MCP_URL || "http://localhost:7000/mcp";

const buildMcpHeaders = () => {
  const headers = {};
  const bearerToken = process.env.ZOMATO_MCP_BEARER_TOKEN?.trim();
  const authHeaderName = process.env.ZOMATO_MCP_AUTH_HEADER?.trim();
  const authHeaderValue = process.env.ZOMATO_MCP_AUTH_VALUE?.trim();

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  if (authHeaderName && authHeaderValue) {
    headers[authHeaderName] = authHeaderValue;
  }

  return headers;
};

export const getDealsFromMCP = async () => {
  try {

    const response = await axios.post(
      MCP_URL,
      {
        tool: "get_zomato_deals",
        params: {
          city: "Delhi",
          limit: 10
        }
      },
      {
        headers: buildMcpHeaders()
      }
    );

    return response.data;

  } catch (error) {
    console.error("MCP fetch error:", error.message);
    throw error;
  }
};
