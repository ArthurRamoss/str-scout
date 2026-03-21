import "dotenv/config";
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { createContextMiddleware } from "@ctxprotocol/sdk";
import { TOOLS } from "./tools/index.js";
import { handleAnalyzeMarket } from "./tools/analyzeMarket.js";

// ==========================================
// Express app
// ==========================================

const app = express();
app.use(express.json());

// Health endpoint (no auth)
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "str-scout",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// MCP Server
// ==========================================

function createMCPServer(): Server {
  const server = new Server(
    { name: "str-scout", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "analyze_str_market":
        return await handleAnalyzeMarket(args);
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

// ==========================================
// Session management
// ==========================================

const transports: Record<string, StreamableHTTPServerTransport> = {};

// Context Protocol middleware — required for paid tools
const verifyContextAuth = createContextMiddleware();

// POST /mcp — main MCP endpoint
app.post("/mcp", verifyContextAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports[sessionId]) {
    // Existing session
    await transports[sessionId].handleRequest(req, res, req.body);
    return;
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        transports[id] = transport;
        console.log(`[mcp] Session initialized: ${id}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        console.log(`[mcp] Session closed: ${transport.sessionId}`);
      }
    };

    const server = createMCPServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Invalid session" },
    id: null,
  });
});

// GET /mcp — SSE streaming (optional)
app.get("/mcp", verifyContextAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
});

// ==========================================
// Warm-up endpoint — pre-seed cache for smoke tests
// ==========================================

app.post("/warmup", async (_req: Request, res: Response) => {
  const { handleAnalyzeMarket: warmupHandler } = await import("./tools/analyzeMarket.js");
  const location = "Austin, TX";
  console.log(`[warmup] Pre-seeding cache for "${location}"...`);
  try {
    await warmupHandler({ location });
    res.json({ status: "ok", location, message: "Cache seeded" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==========================================
// Start server
// ==========================================

const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => {
  console.log(`STR Scout running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

// Allow long-running requests (Apify scrape can take up to 120s)
server.setTimeout(300_000);

// Auto warm-up: pre-seed cache on boot so smoke tests hit cache (<2s)
const WARMUP_LOCATION = "Austin, TX";
setTimeout(async () => {
  const { getCachedListings } = await import("./services/cache.js");
  const cached = await getCachedListings({ location: WARMUP_LOCATION });
  if (cached) {
    console.log(`[warmup] Cache already seeded for "${WARMUP_LOCATION}" (${cached.listings.length} listings)`);
    return;
  }
  console.log(`[warmup] Auto-seeding cache for "${WARMUP_LOCATION}"...`);
  try {
    const { handleAnalyzeMarket: warmupHandler } = await import("./tools/analyzeMarket.js");
    await warmupHandler({ location: WARMUP_LOCATION });
    console.log(`[warmup] Cache seeded for "${WARMUP_LOCATION}" ✓`);
  } catch (err: any) {
    console.warn(`[warmup] Failed to seed cache: ${err.message}`);
  }
}, 2000); // 2s after boot to let Redis connect first
