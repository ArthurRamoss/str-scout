/**
 * STR Scout MCP Server v1.0.0
 *
 * Short-term rental market intelligence via MCP tools:
 * - analyze_str_market (Airbnb market analysis)
 *
 * Context Protocol compliant with:
 * - outputSchema (typed response definitions)
 * - structuredContent (machine-readable responses)
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  type CallToolRequest,
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { createContextMiddleware } from "@ctxprotocol/sdk";
import { TOOLS } from "./tools/index.js";
import { handleAnalyzeMarket } from "./tools/analyzeMarket.js";
import type { MarketAnalysis } from "./types/index.js";

// ============================================================================
// RESPONSE HELPERS
//
// Context Protocol requires:
// - content: Human-readable text (standard MCP)
// - structuredContent: Machine-readable data matching outputSchema
// ============================================================================

function formatMarketAnalysisContent(data: MarketAnalysis): string {
  const occupancyPercent = Math.round(data.occupancyEstimate.estimatedRate * 100);
  const amenityList =
    data.amenityGapAnalysis.recommendedAmenities.slice(0, 3).join(", ") || "none identified";

  return [
    `Market: ${data.location}`,
    data.investmentSummary,
    `Revenue estimate: $${data.revenueEstimate.lowEstimate.toLocaleString()}-$${data.revenueEstimate.highEstimate.toLocaleString()}/year (${data.revenueEstimate.confidenceLevel} confidence)`,
    `ADR: $${data.averageDailyRate.median}/night | Occupancy: ${occupancyPercent}% | Saturation: ${data.competitiveSaturation.label} (${data.competitiveSaturation.score}/100)`,
    `Listings analyzed: ${data.filteredListings} filtered / ${data.totalListingsAnalyzed} total | Data freshness: ${data.dataFreshness}`,
    `Amenity opportunities: ${amenityList}`,
  ].join("\n");
}

function successResult(data: Record<string, unknown>): CallToolResult {
  const content =
    "investmentSummary" in data &&
    "revenueEstimate" in data &&
    "averageDailyRate" in data &&
    "occupancyEstimate" in data &&
    "competitiveSaturation" in data
      ? formatMarketAnalysisContent(data as unknown as MarketAnalysis)
      : JSON.stringify(data, null, 2);

  return {
    content: [{ type: "text", text: content }],
    structuredContent: data,
  };
}

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// ============================================================================
// Express app
// ============================================================================

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

// ============================================================================
// MCP SERVER FACTORY
//
// MCP SDK v1.27.1 requires one Server instance per transport connection.
// ============================================================================

function createMCPServer(): Server {
  const server = new Server(
    { name: "str-scout", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "analyze_str_market": {
            const result = await handleAnalyzeMarket(args);
            return successResult(result as unknown as Record<string, unknown>);
          }
          default:
            return errorResult(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  );

  return server;
}

// ============================================================================
// Session management (transport + server per session)
// ============================================================================

const sessions: Record<
  string,
  { transport: StreamableHTTPServerTransport; server: Server }
> = {};

// Context Protocol middleware - required for paid tools
const verifyContextAuth = createContextMiddleware();

// POST /mcp - main MCP endpoint
app.post("/mcp", verifyContextAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && sessions[sessionId]) {
    transport = sessions[sessionId].transport;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const server = createMCPServer();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions[id] = { transport, server };
        console.log(`[mcp] Session initialized: ${id}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete sessions[transport.sessionId];
        console.log(`[mcp] Session closed: ${transport.sessionId}`);
      }
    };

    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Invalid session. Send initialize request first.",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET /mcp - SSE streaming
app.get("/mcp", verifyContextAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const session = sessions[sessionId];
  if (session) {
    await session.transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
});

// DELETE /mcp - session cleanup
app.delete("/mcp", verifyContextAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const session = sessions[sessionId];
  if (session) {
    await session.transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
});

// ============================================================================
// Warm-up endpoint - pre-seed cache for smoke tests
// ============================================================================

const ENABLE_WARMUP_ENDPOINT = process.env.ENABLE_WARMUP_ENDPOINT === "true";

if (ENABLE_WARMUP_ENDPOINT) {
  app.post("/warmup", async (_req: Request, res: Response) => {
    const location = "Austin, TX";
    console.log(`[warmup] Pre-seeding cache for "${location}"...`);
    try {
      await handleAnalyzeMarket({ location });
      res.json({ status: "ok", location, message: "Cache seeded" });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });
}

// ============================================================================
// Start server
// ============================================================================

const PORT = Number(process.env.PORT || 3000);
const httpServer = app.listen(PORT, () => {
  console.log(`\nSTR Scout MCP Server v1.0.0`);
  console.log(`Short-term rental market intelligence\n`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`\nTools (${TOOLS.length}):`);
  for (const tool of TOOLS) {
    console.log(`- ${tool.name}`);
  }
  console.log("");
});

// Allow long-running requests (Apify scrape can take up to 120s)
httpServer.setTimeout(300_000);

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
    await handleAnalyzeMarket({ location: WARMUP_LOCATION });
    console.log(`[warmup] Cache seeded for "${WARMUP_LOCATION}"`);
  } catch (err: any) {
    console.warn(`[warmup] Failed to seed cache: ${err.message}`);
  }
}, 2000);
