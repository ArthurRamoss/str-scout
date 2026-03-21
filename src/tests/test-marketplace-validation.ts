import { randomUUID } from "node:crypto";
import { ContextClient, ContextError, type McpTool, type QueryResult, type Tool } from "@ctxprotocol/sdk";
import { TOOLS as LOCAL_TOOLS } from "../tools/index.js";

const CONTEXT_API_KEY = process.env.CONTEXT_API_KEY;
const TOOL_ID = process.env.TOOL_ID || "976d3ad9-a77d-492b-8d16-5360a59ac83f";
const TOOL_QUERY = process.env.TOOL_QUERY || "STR Scout";

if (!CONTEXT_API_KEY) {
  throw new Error("CONTEXT_API_KEY is required");
}

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

function getNestedRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function getSchemaProperties(schema: unknown): Record<string, unknown> {
  const record = getNestedRecord(schema);
  const props = getNestedRecord(record?.properties);
  return props ?? {};
}

function pickExample(
  schema: Record<string, unknown>,
  fallbacks: unknown[]
): unknown {
  const examples = Array.isArray(schema.examples) ? schema.examples : undefined;
  if (examples?.length) return examples[0];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  return fallbacks[0];
}

function generateSampleArgs(tool: McpTool): Record<string, unknown> {
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

async function discoverTool(): Promise<Tool> {
  const direct = await client.discovery.get(TOOL_ID);
  console.log(`Tool loaded via discovery.get: ${direct.name} (${direct.id})`);

  const querySearch = await client.discovery.search({
    query: TOOL_QUERY,
    mode: "query",
    surface: "answer",
    queryEligible: true,
    limit: 10,
  });
  const executeSearch = await client.discovery.search({
    query: TOOL_QUERY,
    mode: "execute",
    surface: "execute",
    requireExecutePricing: true,
    limit: 10,
  });

  console.log(`Query discovery matches: ${querySearch.length}`);
  console.log(`Execute discovery matches: ${executeSearch.length}`);

  if (!querySearch.some((tool) => tool.id === TOOL_ID)) {
    console.warn("Target tool not present in query search results");
  }

  if (!executeSearch.some((tool) => tool.id === TOOL_ID)) {
    console.warn("Target tool not present in execute search results");
  }

  return direct;
}

function compareLocalAndLiveConfig(tool: Tool): void {
  const localTool = LOCAL_TOOLS.find((candidate) =>
    candidate.name === tool.mcpTools?.[0]?.name
  );
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

async function runQuerySuite(tool: Tool): Promise<PromptResult[]> {
  const results: PromptResult[] = [];

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
      results.push(evaluation);

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
      results.push(blockedResult);
      console.log(`[query] BLOCKED ${error.code}: ${error.message}`);
      break;
    }
  }

  return results;
}

async function runStreamingChecks(tool: Tool): Promise<"passed" | "blocked"> {
  for (const prompt of PROMPTS.slice(0, 2)) {
    console.log(`\n[stream] ${prompt}`);

    let sawDone = false;
    let toolStatusCount = 0;
    let textDeltaCount = 0;
    let developerTraceCount = 0;

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
          console.log(
            `[stream] done duration=${event.result.durationMs}ms cost=$${event.result.cost.totalCostUsd} trace=${JSON.stringify(summariseTrace(event.result))}`
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

      console.log(`[stream] BLOCKED ${error.code}: ${error.message}`);
      return "blocked";
    }

    console.log(
      `[stream] events tool-status=${toolStatusCount} text-delta=${textDeltaCount} developer-trace=${developerTraceCount} done=${sawDone}`
    );

    if (!sawDone) {
      throw new Error("Streaming query finished without a done event");
    }
  }

  return "passed";
}

async function runExecuteChecks(tool: Tool): Promise<"passed" | "blocked"> {
  const methods = tool.mcpTools ?? [];

  if (!methods.length) {
    throw new Error("No MCP methods returned for execute validation");
  }

  let session;
  try {
    session = await client.tools.startSession({ maxSpendUsd: "1.00" });
  } catch (error) {
    if (!isBillingBlocked(error)) {
      throw error;
    }

    console.log(`[execute] BLOCKED ${error.code}: ${error.message}`);
    return "blocked";
  }

  const sessionId = session.session.sessionId ?? undefined;
  console.log(`\n[execute] session=${sessionId}`);

  try {
    for (const method of methods) {
      const args = generateSampleArgs(method);
      console.log(`[execute] ${method.name} args=${JSON.stringify(args)}`);

      let result;
      try {
        result = await client.tools.execute({
          toolId: tool.id,
          toolName: method.name,
          args,
          sessionId,
        });
      } catch (error) {
        if (!isBillingBlocked(error)) {
          throw error;
        }

        console.log(`[execute] BLOCKED ${error.code}: ${error.message}`);
        return "blocked";
      }

      const output = getNestedRecord(result.result);
      const topLevelKeys = output ? Object.keys(output) : [];
      console.log(
        `[execute] PASS method=${method.name} price=$${result.session.methodPrice} spent=$${result.session.spent} keys=${topLevelKeys.join(", ")}`
      );
    }
  } finally {
    if (sessionId) {
      await client.tools.closeSession(sessionId);
      console.log(`[execute] session closed: ${sessionId}`);
    }
  }

  return "passed";
}

async function main() {
  const tool = await discoverTool();

  console.log("\n=== Tool Summary ===");
  console.log(`name=${tool.name}`);
  console.log(`price=${tool.price}`);
  console.log(`methods=${tool.mcpTools?.map((method) => method.name).join(", ")}`);
  for (const method of tool.mcpTools ?? []) {
    console.log(
      `method=${method.name} executeEligible=${String(method.executeEligible)} executePriceUsd=${method.executePriceUsd ?? "null"}`
    );
  }
  compareLocalAndLiveConfig(tool);

  const queryResults = await runQuerySuite(tool);
  const failedQueries = queryResults.filter((result) => !result.passed);
  const blockedQueries = queryResults.filter((result) => result.blocked);

  console.log("\n=== Query Summary ===");
  for (const result of queryResults) {
    console.log(
      `${result.blocked ? "BLOCKED" : result.passed ? "PASS" : "FAIL"} | ${result.durationMs}ms | $${result.totalCostUsd} | ${result.prompt}`
    );
    if (result.reason) {
      console.log(`  reason: ${result.reason}`);
    }
    console.log(`  trace: ${JSON.stringify(result.summary)}`);
  }

  const streamStatus = blockedQueries.length ? "blocked" : await runStreamingChecks(tool);
  const executeStatus = await runExecuteChecks(tool);

  console.log(`\n=== Phase Status ===`);
  console.log(`query=${blockedQueries.length ? "blocked" : failedQueries.length ? "failed" : "passed"}`);
  console.log(`stream=${streamStatus}`);
  console.log(`execute=${executeStatus}`);

  if (failedQueries.length && !blockedQueries.length) {
    throw new Error(`${failedQueries.length} query prompts failed validation`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
