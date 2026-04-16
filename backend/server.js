import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import dealsRoutes from "./routes/deals.js";
import orderRoutes from "./routes/orders.js";
import authRoutes from "./routes/auth.js";
import mcpRoutes from "./routes/mcp.js";
import dishSearchRoutes from "./routes/dishSearch.js";
import { connectToZomatoMcp } from "./services/zomatoOfficialMcp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPaths = [
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, "..", ".env"),
  path.resolve(process.cwd(), ".env")
];

let loadedEnv = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (result.parsed) {
    console.log(`Loaded env from ${envPath}`);
    loadedEnv = true;
    break;
  }
}

if (!loadedEnv) {
  console.warn("No .env file found, relying on environment variables.");
}

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const ALLOW_START_WITHOUT_DB = process.env.ALLOW_START_WITHOUT_DB === "true";
const DB_TIMEOUT_MS = Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000);

app.use(cors());
app.use(express.json());

app.use("/api/deals", dealsRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/mcp", mcpRoutes);
app.use("/api/dish-search", dishSearchRoutes);

const startServer = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not configured. Expected backend/.env to be loaded.");
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: DB_TIMEOUT_MS
    });
    console.log(`MongoDB connected (timeout ${DB_TIMEOUT_MS}ms)`);
  } catch (error) {
    if (!ALLOW_START_WITHOUT_DB) {
      console.error("Server startup error:", error.message);
      process.exit(1);
    }

    console.warn("MongoDB connection failed, continuing without DB:", error.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Auto-connect to official Zomato MCP in background if enabled
    if (process.env.USE_ZOMATO_MCP === "true") {
      connectToZomatoMcp()
        .then((result) => {
          console.log(`[Zomato MCP] Auto-connect: ${result.status} (${result.tools?.length || 0} tools)`);
        })
        .catch((err) => {
          console.log(`[Zomato MCP] Auto-connect skipped: ${err.message}`);
        });
    } else {
      console.log(`[Zomato MCP] Auto-connect disabled (USE_ZOMATO_MCP=${process.env.USE_ZOMATO_MCP})`);
    }
  });
};

startServer();
