import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:5000";

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.text();

  try {
    return {
      status: response.status,
      ok: response.ok,
      body: body ? JSON.parse(body) : null
    };
  } catch (error) {
    throw new Error(`Invalid JSON response from ${url}: ${body}`);
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runTest = async (name, fn) => {
  process.stdout.write(`[TEST] ${name} ... `);
  await fn();
  console.log("OK");
};

const testStatus = async () => {
  const url = `${baseUrl}/api/mcp/status`;
  const result = await fetchJson(url);
  assert(result.ok, `Status endpoint returned ${result.status}`);
  assert(result.body?.success === true, `Expected success=true, got ${JSON.stringify(result.body)}`);
};

const testMcpLive = async () => {
  const url = `${baseUrl}/api/mcp/live?location=Delhi&cuisine=biryani&limit=1`;
  const result = await fetchJson(url);
  assert(result.ok, `Live endpoint returned ${result.status}`);
  assert(result.body?.success === true, `Expected success=true, got ${JSON.stringify(result.body)}`);
  assert(Array.isArray(result.body?.deals), "Expected deals array");
};

const testMcpSearch = async () => {
  const url = `${baseUrl}/api/mcp/search`;
  const result = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location: "Delhi", cuisine: "pizza", limit: 1 })
  });
  assert(result.ok, `Search endpoint returned ${result.status}`);
  assert(result.body?.success === true, `Expected success=true, got ${JSON.stringify(result.body)}`);
  assert(Array.isArray(result.body?.deals), "Expected deals array");
};

const testDealsEndpoint = async () => {
  const url = `${baseUrl}/api/deals`;
  const result = await fetchJson(url);
  assert(result.ok, `Deals endpoint returned ${result.status}`);
  assert(Array.isArray(result.body?.deals), "Expected deals array");
};

const main = async () => {
  console.log("Backend smoke test starting against", baseUrl);

  await runTest("MCP /status", testStatus);
  await runTest("MCP /live", testMcpLive);
  await runTest("MCP /search", testMcpSearch);
  await runTest("Deals /", testDealsEndpoint);

  console.log("All backend smoke tests passed.");
};

main().catch((error) => {
  console.error("\nFAILED:", error.message || error);
  process.exit(1);
});
