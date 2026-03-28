import { randomUUID } from "node:crypto";
import { ContextClient, ContextError, type McpTool, type QueryResult, type Tool } from "@ctxprotocol/sdk";
import { TOOLS as LOCAL_TOOLS } from "../tools/index.js";

const CONTEXT_API_KEY = process.env.CONTEXT_API_KEY;

if (!CONTEXT_API_KEY) {
  throw new Error("CONTEXT_API_KEY is required");
}

const TOOL_ID = "976d3ad9-a77d-492b-8d16-5360a59ac83f";
const TOOL_QUERY = "STR Scout";
const TOOL_NAME = "STR Scout";
const METHOD_NAME = "analyze_str_market";
const ENDPOINT_BASE = "https://str-scout-production.up.railway.app";
const HEALTH_URL = `${ENDPOINT_BASE}/health`;
const MCP_URL = `${ENDPOINT_BASE}/mcp`;
const EXPECTED_HEALTH_SERVICE = "str-scout";
const EXPECTED_UNAUTH_INITIALIZE_STATUS = 406;
const STREAM_PROMPTS = 2;

const client = new ContextClient({ apiKey: CONTEXT_API_KEY });

const PROMPTS = [
  "Analyze the Airbnb investment potential for Austin, TX for an entire home.",
  "What short-term rental data can STR Scout provide for Miami Beach, FL?",
  "Compare the Airbnb market outlook for Austin, TX versus Nashville, TN for entire homes.",
  "Analyze Austin, TX for a private room with 1 bedroom and seasonal dates check-in 2026-05-15 and check-out 2026-05-18.",
  "Analyze Austin, TX for an entire home, then explain which amenities most separate top performers from the rest.",
  "If I ask for a sparse or unusual market like Marfa, TX, what does STR Scout still return and how should I interpret lower confidence?",
  "Rank the most important signals for evaluating Austin, TX as a short-term rental market and justify the recommendation with revenue, ADR, occupancy, and saturation.",
];

type PhaseStatus = "passed" | "failed" | "blocked";

type PhaseResult = {
  status: PhaseStatus;
  reason?: string;
};

type PromptResult = {
  prompt: string;
  passed: boolean;
  blocked?: boolean;
  responsePreview: string;
  durationMs: number;
  totalCostUsd: string;
  toolsUsed: string[];
  summary: Record<string, unknown>;
  reason?: string;
};

type QuerySuiteResult = {
  status: PhaseStatus;
  promptResults: PromptResult[];
  reason?: string;
};

type StreamSummary = {
  prompt: string;
  toolStatusCount: number;
  textDeltaCount: number;
  developerTraceCount: number;
  sawDone: boolean;
  durationMs?: number;
  totalCostUsd?: string;
};

type StreamingResult = PhaseResult & {
  events?: StreamSummary[];
};

type ExecuteResult = PhaseResult & {
  sessionId?: string;
  methodName?: string;
  args?: Record<string, unknown>;
  durationMs?: number;
  methodPriceUsd?: string;
  spentUsd?: string;
  returnedKeys?: string[];
};

type DiscoveryResult = {
  tool: Tool;
  queryMatches: Tool[];
  executeMatches: Tool[];
};

function getNestedRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function getSchemaProperties(schema: unknown): Record<string, unknown> {
  const record = getNestedRecord(schema);
  const props = getNestedRecord(record?.properties);
  return props ?? {};
}

function pickExample(schema: Record<string, unknown>, fallbacks: unknown[]): unknown {
  const examples = Array.isArray(schema.examples) ? schema.examples : undefined;
  if (examples?.length) return examples[0];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  return fallbacks[0];
}

function getLocalToolDefinition(methodName: string) {
  const localTool = LOCAL_TOOLS.find((candidate) => candidate.name === methodName);
  if (!localTool) {
    throw new Error(`Local tool definition not found for ${methodName}`);
  }

  return localTool;
}

function getExpectedOutputKeys(methodName: string): string[] {
  const localTool = getLocalToolDefinition(methodName);
  const outputSchema = getNestedRecord(localTool.outputSchema) ?? {};
  const required = Array.isArray(outputSchema.required)
    ? outputSchema.required.filter((field): field is string => typeof field === "string")
    : [];

  if (required.length === 0) {
    throw new Error(`No required output fields found for ${methodName}`);
  }

  return required;
}

const EXPECTED_OUTPUT_KEYS = getExpectedOutputKeys(METHOD_NAME);

function generateSampleArgs(tool: McpTool, requiredOnly = false): Record<string, unknown> {
  const schema = getNestedRecord(tool.inputSchema) ?? {};
  const props = getSchemaProperties(tool.inputSchema);
  const meta = getNestedRecord(tool._meta);
  const smokeTestInput = getNestedRecord(meta?.smokeTestInput) ?? {};
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === "string") : []
  );
  const args: Record<string, unknown> = { ...smokeTestInput };

  for (const [key, rawSchema] of Object.entries(props)) {
    if (args[key] !== undefined) continue;
    if (requiredOnly && !required.has(key)) continue;

    const propSchema = getNestedRecord(rawSchema) ?? {};
    const type = propSchema.type;
    const hasExplicitExample =
      propSchema.default !== undefined ||
      (Array.isArray(propSchema.examples) && propSchema.examples.length > 0) ||
      (Array.isArray(propSchema.enum) && propSchema.enum.length > 0);

    if (type === "string") {
      if (hasExplicitExample || required.has(key)) {
        args[key] = pickExample(propSchema, [
          key.toLowerCase().includes("date")
            ? "2026-05-15"
            : key.toLowerCase().includes("location")
              ? "Austin, TX"
              : "sample",
        ]);
      }
      continue;
    }

    if (type === "number" || type === "integer") {
      if (hasExplicitExample || required.has(key)) {
        args[key] = pickExample(propSchema, [1]);
      }
      continue;
    }

    if (type === "boolean") {
      if (hasExplicitExample || required.has(key)) {
        args[key] = pickExample(propSchema, [true]);
      }
      continue;
    }
  }

  for (const field of required) {
    if (args[field] === undefined) {
      args[field] = field === "location" ? "Austin, TX" : "sample";
    }
  }

  return args;
}

function summariseTrace(result: QueryResult): Record<string, unknown> {
  return {
    toolCalls: result.developerTrace?.summary?.toolCalls ?? null,
    retryCount: result.developerTrace?.summary?.retryCount ?? null,
    selfHealCount: result.developerTrace?.summary?.selfHealCount ?? null,
    loopCount: result.developerTrace?.summary?.loopCount ?? null,
    fallbackCount: result.developerTrace?.summary?.fallbackCount ?? null,
    firstPassSuccess: result.orchestrationMetrics?.firstPassSuccess ?? null,
    rediscoveryExecuted: result.orchestrationMetrics?.rediscoveryExecuted ?? null,
  };
}

function validatePromptResult(prompt: string, result: QueryResult, toolId: string): PromptResult {
  const responseText = result.response?.trim() ?? "";
  const toolsUsed = result.toolsUsed.map((tool) => tool.id);
  const summary = summariseTrace(result);
  const retryCount = Number(result.developerTrace?.summary?.retryCount ?? 0);
  const selfHealCount = Number(result.developerTrace?.summary?.selfHealCount ?? 0);
  const loopCount = Number(result.developerTrace?.summary?.loopCount ?? 0);

  if (!responseText) {
    return {
      prompt,
      passed: false,
      responsePreview: "",
      durationMs: result.durationMs,
      totalCostUsd: result.cost.totalCostUsd,
      toolsUsed,
      summary,
      reason: "Empty response",
    };
  }

  const lower = responseText.toLowerCase();
  const genericFailure =
    lower.includes("i'm sorry") ||
    lower.includes("i cannot") ||
    lower.includes("unable to") ||
    lower.includes("don't have enough information") ||
    lower.includes("couldn't");

  if (genericFailure) {
    return {
      prompt,
      passed: false,
      responsePreview: responseText.slice(0, 300),
      durationMs: result.durationMs,
      totalCostUsd: result.cost.totalCostUsd,
      toolsUsed,
      summary,
      reason: "Generic apology/error instead of a substantive answer",
    };
  }

  if (!toolsUsed.includes(toolId)) {
    return {
      prompt,
      passed: false,
      responsePreview: responseText.slice(0, 300),
      durationMs: result.durationMs,
      totalCostUsd: result.cost.totalCostUsd,
      toolsUsed,
      summary,
      reason: "Target tool was not used",
    };
  }

  if (retryCount > 3 || selfHealCount > 3 || loopCount > 3) {
    return {
      prompt,
      passed: false,
      responsePreview: responseText.slice(0, 300),
      durationMs: result.durationMs,
      totalCostUsd: result.cost.totalCostUsd,
      toolsUsed,
      summary,
      reason: "Developer trace shows excessive retries/self-heal loops",
    };
  }

  return {
    prompt,
    passed: true,
    responsePreview: responseText.slice(0, 300),
    durationMs: result.durationMs,
    totalCostUsd: result.cost.totalCostUsd,
    toolsUsed,
    summary,
  };
}

function isBillingBlocked(error: unknown): error is ContextError {
  return (
    error instanceof ContextError &&
    (error.code === "insufficient_allowance" ||
      error.code === "payment_failed" ||
      error.code === "no_wallet")
  );
}

function formatPhaseResult(result: PhaseResult): string {
  return result.reason ? `${result.status} (${result.reason})` : result.status;
}

function getQueryStatus(promptResults: PromptResult[]): PhaseStatus {
  if (promptResults.some((result) => result.blocked)) return "blocked";
  if (promptResults.some((result) => !result.passed)) return "failed";
  return "passed";
}

function average(numbers: number[]): number | null {
  if (!numbers.length) return null;
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(2));
}

function summarisePromptAverages(promptResults: PromptResult[]): Record<string, number | null> {
  const completed = promptResults.filter((result) => !result.blocked);
  const retryCounts = completed.map((result) => Number(result.summary.retryCount ?? 0));
  const selfHealCounts = completed.map((result) => Number(result.summary.selfHealCount ?? 0));
  const loopCounts = completed.map((result) => Number(result.summary.loopCount ?? 0));

  return {
    retryCountAvg: average(retryCounts),
    selfHealCountAvg: average(selfHealCounts),
    loopCountAvg: average(loopCounts),
  };
}

async function runDirectEndpointChecks(): Promise<{
  health: PhaseResult;
  unauthInitialize: PhaseResult;
}> {
  console.log("\n=== Direct Endpoint Checks ===");

  let health: PhaseResult = { status: "failed" };
  let unauthInitialize: PhaseResult = { status: "failed" };

  try {
    const response = await fetch(HEALTH_URL);
    const body = await response.json() as Record<string, unknown>;

    if (response.status !== 200) {
      health = { status: "failed", reason: `GET /health returned ${response.status}` };
    } else if (body.service !== EXPECTED_HEALTH_SERVICE) {
      health = {
        status: "failed",
        reason: `GET /health returned service=${String(body.service)} instead of ${EXPECTED_HEALTH_SERVICE}`,
      };
    } else {
      health = { status: "passed", reason: `status=200 service=${String(body.service)}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    health = { status: "failed", reason: message };
  }

  console.log(`[health] ${formatPhaseResult(health)}`);

  try {
    const response = await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "marketplace-validation", version: "1.0.0" },
        },
      }),
    });

    await response.text();

    if (response.status === EXPECTED_UNAUTH_INITIALIZE_STATUS) {
      unauthInitialize = {
        status: "passed",
        reason: `initialize is auth-protected as expected (status=${response.status})`,
      };
    } else {
      unauthInitialize = {
        status: "failed",
        reason: `unauthenticated initialize returned ${response.status}, expected ${EXPECTED_UNAUTH_INITIALIZE_STATUS}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    unauthInitialize = { status: "failed", reason: message };
  }

  console.log(`[mcp-init] ${formatPhaseResult(unauthInitialize)}`);

  return { health, unauthInitialize };
}

async function discoverTool(): Promise<DiscoveryResult> {
  console.log("\n=== Marketplace Discovery ===");

  const direct = await client.discovery.get(TOOL_ID);
  console.log(`Tool loaded via discovery.get: ${direct.name} (${direct.id})`);

  if (direct.id !== TOOL_ID) {
    throw new Error(`discovery.get returned ${direct.id} instead of ${TOOL_ID}`);
  }

  if (direct.name !== TOOL_NAME) {
    throw new Error(`discovery.get returned ${direct.name} instead of ${TOOL_NAME}`);
  }

  const queryMatches = await client.discovery.search({
    query: TOOL_QUERY,
    mode: "query",
    surface: "answer",
    queryEligible: true,
    limit: 10,
  });
  const executeMatches = await client.discovery.search({
    query: TOOL_QUERY,
    mode: "execute",
    surface: "execute",
    requireExecutePricing: true,
    limit: 10,
  });

  console.log(`Query discovery matches: ${queryMatches.length}`);
  console.log(`Execute discovery matches: ${executeMatches.length}`);

  if (!queryMatches.some((tool) => tool.id === TOOL_ID)) {
    throw new Error(`Target tool ${TOOL_ID} was not present in query discovery results`);
  }

  if (!executeMatches.some((tool) => tool.id === TOOL_ID)) {
    throw new Error(`Target tool ${TOOL_ID} was not present in execute discovery results`);
  }

  return { tool: direct, queryMatches, executeMatches };
}

function compareLocalAndLiveConfig(tool: Tool): void {
  const localTool = LOCAL_TOOLS.find((candidate) => candidate.name === tool.mcpTools?.[0]?.name);
  const liveMethod = tool.mcpTools?.[0];

  if (!localTool || !liveMethod) {
    return;
  }

  const localMeta = getNestedRecord(localTool._meta);
  const localPricing = getNestedRecord(localMeta?.pricing);
  const localQueryUsd = typeof localPricing?.queryUsd === "string" ? localPricing.queryUsd : undefined;
  const localExecuteUsd =
    typeof localPricing?.executeUsd === "string" ? localPricing.executeUsd : undefined;
  const liveExecuteUsd = liveMethod.executePriceUsd ?? liveMethod._meta?.pricing?.executeUsd;

  if (localQueryUsd !== undefined && tool.price !== localQueryUsd) {
    console.warn(
      `[drift] Listing query price is $${tool.price}, but local _meta.pricing.queryUsd is $${localQueryUsd}`
    );
  }

  if (localExecuteUsd !== undefined && liveExecuteUsd !== localExecuteUsd) {
    console.warn(
      `[drift] Live execute price is $${liveExecuteUsd}, but local _meta.pricing.executeUsd is $${localExecuteUsd}`
    );
  }
}

async function runExecuteCheck(tool: Tool): Promise<ExecuteResult> {
  console.log("\n=== Execute Validation ===");

  const method = tool.mcpTools?.find((candidate) => candidate.name === METHOD_NAME);
  if (!method) {
    return { status: "failed", reason: `Method ${METHOD_NAME} was not returned by discovery` };
  }

  if (!method.executeEligible) {
    return { status: "failed", reason: `${METHOD_NAME} is not executeEligible in the live listing` };
  }

  let sessionId: string | undefined;
  try {
    const session = await client.tools.startSession({ maxSpendUsd: "1.00" });
    sessionId = session.session.sessionId ?? undefined;
    console.log(`[execute] session started: ${sessionId ?? "null"}`);
  } catch (error) {
    if (!isBillingBlocked(error)) {
      throw error;
    }

    return { status: "blocked", reason: error.message };
  }

  const args = generateSampleArgs(method, true);

  try {
    const startedAt = Date.now();
    const result = await client.tools.execute({
      toolId: tool.id,
      toolName: method.name,
      args,
      sessionId,
    });
    const durationMs = Date.now() - startedAt;
    const output = getNestedRecord(result.result);
    const returnedKeys = output ? Object.keys(output) : [];
    const missingKeys = EXPECTED_OUTPUT_KEYS.filter((key) => !returnedKeys.includes(key));

    if (missingKeys.length > 0) {
      return {
        status: "failed",
        reason: `Missing output keys: ${missingKeys.join(", ")}`,
        sessionId,
        methodName: method.name,
        args,
        durationMs,
        methodPriceUsd: String(result.session.methodPrice),
        spentUsd: String(result.session.spent),
        returnedKeys,
      };
    }

    console.log(
      `[execute] PASS method=${method.name} duration=${durationMs}ms price=$${result.session.methodPrice} spent=$${result.session.spent} keys=${returnedKeys.join(", ")}`
    );

    return {
      status: "passed",
      reason: `returned ${returnedKeys.length} top-level fields`,
      sessionId,
      methodName: method.name,
      args,
      durationMs,
      methodPriceUsd: String(result.session.methodPrice),
      spentUsd: String(result.session.spent),
      returnedKeys,
    };
  } catch (error) {
    if (!isBillingBlocked(error)) {
      throw error;
    }

    return {
      status: "blocked",
      reason: error.message,
      sessionId,
      methodName: method.name,
      args,
    };
  } finally {
    if (sessionId) {
      await client.tools.closeSession(sessionId);
      console.log(`[execute] session closed: ${sessionId}`);
    }
  }
}

async function runQuerySuite(tool: Tool): Promise<QuerySuiteResult> {
  console.log("\n=== Query Validation ===");

  const promptResults: PromptResult[] = [];

  for (const prompt of PROMPTS) {
    console.log(`\n[query] ${prompt}`);
    try {
      const result = await client.query.run({
        query: prompt,
        tools: [tool.id],
        queryDepth: "deep",
        includeDeveloperTrace: true,
        idempotencyKey: randomUUID(),
      });

      const evaluation = validatePromptResult(prompt, result, tool.id);
      promptResults.push(evaluation);

      console.log(
        `[query] ${evaluation.passed ? "PASS" : "FAIL"} duration=${evaluation.durationMs}ms cost=$${evaluation.totalCostUsd} tools=${evaluation.toolsUsed.join(", ")}`
      );
      if (!evaluation.passed && evaluation.reason) {
        console.log(`[query] reason=${evaluation.reason}`);
      }
    } catch (error) {
      if (!isBillingBlocked(error)) {
        throw error;
      }

      const blockedResult: PromptResult = {
        prompt,
        passed: false,
        blocked: true,
        responsePreview: "",
        durationMs: 0,
        totalCostUsd: "0",
        toolsUsed: [],
        summary: {},
        reason: error.message,
      };
      promptResults.push(blockedResult);
      console.log(`[query] BLOCKED ${error.code}: ${error.message}`);
      break;
    }
  }

  const status = getQueryStatus(promptResults);
  const blockedPrompt = promptResults.find((result) => result.blocked);
  const failedPrompt = promptResults.find((result) => !result.passed && !result.blocked);
  const reason = blockedPrompt?.reason ?? failedPrompt?.reason;

  return { status, promptResults, reason };
}

async function runStreamingChecks(tool: Tool): Promise<StreamingResult> {
  console.log("\n=== Streaming Validation ===");

  const events: StreamSummary[] = [];

  for (const prompt of PROMPTS.slice(0, STREAM_PROMPTS)) {
    console.log(`\n[stream] ${prompt}`);

    let sawDone = false;
    let toolStatusCount = 0;
    let textDeltaCount = 0;
    let developerTraceCount = 0;
    let durationMs: number | undefined;
    let totalCostUsd: string | undefined;

    try {
      for await (const event of client.query.stream({
        query: prompt,
        tools: [tool.id],
        queryDepth: "deep",
        includeDeveloperTrace: true,
        idempotencyKey: randomUUID(),
      })) {
        if (event.type === "tool-status") toolStatusCount++;
        if (event.type === "text-delta") textDeltaCount++;
        if (event.type === "developer-trace") developerTraceCount++;

        if (event.type === "done") {
          sawDone = true;
          durationMs = event.result.durationMs;
          totalCostUsd = event.result.cost.totalCostUsd;
          console.log(
            `[stream] done duration=${durationMs}ms cost=$${totalCostUsd} trace=${JSON.stringify(summariseTrace(event.result))}`
          );
        }

        if (event.type === "error") {
          throw new Error(`Streaming error: ${event.error}`);
        }
      }
    } catch (error) {
      if (!isBillingBlocked(error)) {
        throw error;
      }

      return {
        status: "blocked",
        reason: error.message,
        events,
      };
    }

    const summary: StreamSummary = {
      prompt,
      toolStatusCount,
      textDeltaCount,
      developerTraceCount,
      sawDone,
      durationMs,
      totalCostUsd,
    };
    events.push(summary);

    console.log(
      `[stream] events tool-status=${toolStatusCount} text-delta=${textDeltaCount} developer-trace=${developerTraceCount} done=${sawDone}`
    );

    if (!sawDone) {
      return {
        status: "failed",
        reason: "Streaming query finished without a done event",
        events,
      };
    }
  }

  return { status: "passed", reason: `validated ${events.length} streaming prompts`, events };
}

async function main() {
  console.log("=== Validation Target ===");
  console.log(`toolName=${TOOL_NAME}`);
  console.log(`toolId=${TOOL_ID}`);
  console.log(`toolQuery=${TOOL_QUERY}`);
  console.log(`endpoint=${MCP_URL}`);

  const directChecks = await runDirectEndpointChecks();
  const discovery = await discoverTool();

  console.log("\n=== Tool Summary ===");
  console.log(`name=${discovery.tool.name}`);
  console.log(`price=${discovery.tool.price}`);
  console.log(`methods=${discovery.tool.mcpTools?.map((method) => method.name).join(", ")}`);
  for (const method of discovery.tool.mcpTools ?? []) {
    console.log(
      `method=${method.name} executeEligible=${String(method.executeEligible)} executePriceUsd=${method.executePriceUsd ?? "null"}`
    );
  }
  compareLocalAndLiveConfig(discovery.tool);

  const executeResult = await runExecuteCheck(discovery.tool);
  const queryResult = await runQuerySuite(discovery.tool);

  console.log("\n=== Query Summary ===");
  for (const result of queryResult.promptResults) {
    console.log(
      `${result.blocked ? "BLOCKED" : result.passed ? "PASS" : "FAIL"} | ${result.durationMs}ms | $${result.totalCostUsd} | ${result.prompt}`
    );
    if (result.reason) {
      console.log(`  reason: ${result.reason}`);
    }
    console.log(`  trace: ${JSON.stringify(result.summary)}`);
  }

  const queryAverages = summarisePromptAverages(queryResult.promptResults);
  console.log(`query_trace_averages=${JSON.stringify(queryAverages)}`);

  const streamResult =
    queryResult.status === "passed"
      ? await runStreamingChecks(discovery.tool)
      : {
          status: "blocked" as const,
          reason:
            queryResult.status === "blocked"
              ? "Skipped until Auto Pay allowance is raised above per-answer cost"
              : "Skipped until the 7-prompt query suite passes",
        };

  const discoveryResult: PhaseResult = { status: "passed", reason: "tool found on query and execute discovery surfaces" };

  console.log("\n=== Phase Status ===");
  console.log(`direct_health=${formatPhaseResult(directChecks.health)}`);
  console.log(`direct_mcp_auth=${formatPhaseResult(directChecks.unauthInitialize)}`);
  console.log(`discovery=${formatPhaseResult(discoveryResult)}`);
  console.log(`execute=${formatPhaseResult(executeResult)}`);
  console.log(`query=${formatPhaseResult({ status: queryResult.status, reason: queryResult.reason })}`);
  console.log(`stream=${formatPhaseResult(streamResult)}`);

  if (directChecks.health.status === "failed" || directChecks.unauthInitialize.status === "failed") {
    throw new Error("Direct endpoint preflight failed");
  }

  if (executeResult.status === "failed") {
    throw new Error(executeResult.reason ?? "Execute validation failed");
  }

  if (queryResult.status === "failed") {
    throw new Error(queryResult.reason ?? "Query validation failed");
  }

  if (streamResult.status === "failed") {
    throw new Error(streamResult.reason ?? "Streaming validation failed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
