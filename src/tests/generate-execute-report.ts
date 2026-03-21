import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ContextClient } from "@ctxprotocol/sdk";

const CONTEXT_API_KEY = process.env.CONTEXT_API_KEY;
const TOOL_ID = process.env.TOOL_ID || "976d3ad9-a77d-492b-8d16-5360a59ac83f";
const TOOL_NAME = process.env.TOOL_NAME || "analyze_str_market";
const REPORT_DIR = process.env.EXECUTE_REPORT_DIR || "docs";
const REPORT_PRESET = process.env.EXECUTE_REPORT_PRESET || "urban-mix";

if (!CONTEXT_API_KEY) {
  throw new Error("CONTEXT_API_KEY is required");
}

const client = new ContextClient({ apiKey: CONTEXT_API_KEY });

type ExecuteCase = {
  label: string;
  args: Record<string, unknown>;
  queryEquivalent: string;
};

type CaseResult =
  | {
      label: string;
      queryEquivalent: string;
      args: Record<string, unknown>;
      status: "success";
      elapsedMs: number;
      session: Record<string, unknown>;
      rawOutput: unknown;
    }
  | {
      label: string;
      queryEquivalent: string;
      args: Record<string, unknown>;
      status: "error";
      elapsedMs: number;
      error: {
        name: string;
        message: string;
        code: string | null;
        statusCode: number | null;
      };
    };

type SuccessCaseResult = Extract<CaseResult, { status: "success" }>;

const URBAN_MIX_CASES: ExecuteCase[] = [
  {
    label: "Sao Paulo any property",
    args: { location: "Sao Paulo, SP, Brazil", propertyType: "any" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Sao Paulo, SP, Brazil across any property type.",
  },
  {
    label: "Sao Paulo any 1 bedroom",
    args: { location: "Sao Paulo, SP, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Sao Paulo, SP, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Pinheiros any 1 bedroom",
    args: { location: "Pinheiros, Sao Paulo, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Pinheiros, Sao Paulo, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Vila Madalena any 1 bedroom",
    args: { location: "Vila Madalena, Sao Paulo, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Vila Madalena, Sao Paulo, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Jardins any 1 bedroom",
    args: { location: "Jardins, Sao Paulo, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Jardins, Sao Paulo, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Itaim Bibi any 1 bedroom",
    args: { location: "Itaim Bibi, Sao Paulo, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Itaim Bibi, Sao Paulo, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Moema any 1 bedroom",
    args: { location: "Moema, Sao Paulo, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Moema, Sao Paulo, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Rio de Janeiro any property",
    args: { location: "Rio de Janeiro, RJ, Brazil", propertyType: "any" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Rio de Janeiro, RJ, Brazil across any property type.",
  },
  {
    label: "Copacabana any 1 bedroom",
    args: { location: "Copacabana, Rio de Janeiro, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Copacabana, Rio de Janeiro, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Ipanema any 1 bedroom",
    args: { location: "Ipanema, Rio de Janeiro, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Ipanema, Rio de Janeiro, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Florianopolis any property",
    args: { location: "Florianopolis, SC, Brazil", propertyType: "any" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Florianopolis, SC, Brazil across any property type.",
  },
  {
    label: "Curitiba any property",
    args: { location: "Curitiba, PR, Brazil", propertyType: "any" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Curitiba, PR, Brazil across any property type.",
  },
  {
    label: "Austin entire home",
    args: { location: "Austin, TX", propertyType: "entire_home" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Austin, TX for an entire home.",
  },
  {
    label: "Austin any property",
    args: { location: "Austin, TX", propertyType: "any" },
    queryEquivalent:
      "Analyze Austin, TX across any property type.",
  },
  {
    label: "Manhattan any 1 bedroom",
    args: { location: "Manhattan, New York, NY", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Manhattan, New York, NY for a 1-bedroom listing across any property type.",
  },
  {
    label: "Williamsburg Brooklyn any 1 bedroom",
    args: { location: "Williamsburg, Brooklyn, NY", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Williamsburg, Brooklyn, NY for a 1-bedroom listing across any property type.",
  },
  {
    label: "Brickell Miami any 1 bedroom",
    args: { location: "Brickell, Miami, FL", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Brickell, Miami, FL for a 1-bedroom listing across any property type.",
  },
  {
    label: "Miami Beach any 1 bedroom",
    args: { location: "Miami Beach, FL", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Miami Beach, FL for a 1-bedroom listing across any property type.",
  },
  {
    label: "Chicago Loop any 1 bedroom",
    args: { location: "Chicago Loop, Chicago, IL", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for the Chicago Loop, Chicago, IL for a 1-bedroom listing across any property type.",
  },
  {
    label: "West Loop Chicago any 1 bedroom",
    args: { location: "West Loop, Chicago, IL", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for West Loop, Chicago, IL for a 1-bedroom listing across any property type.",
  },
  {
    label: "Capitol Hill Seattle any 1 bedroom",
    args: { location: "Capitol Hill, Seattle, WA", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Capitol Hill, Seattle, WA for a 1-bedroom listing across any property type.",
  },
  {
    label: "Nashville any property",
    args: { location: "Nashville, TN", propertyType: "any" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Nashville, TN across any property type.",
  },
  {
    label: "Downtown San Diego any 1 bedroom",
    args: { location: "Downtown San Diego, CA", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Downtown San Diego, CA for a 1-bedroom listing across any property type.",
  },
  {
    label: "Las Vegas Strip any 1 bedroom",
    args: { location: "Las Vegas Strip, Las Vegas, NV", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for the Las Vegas Strip, Las Vegas, NV for a 1-bedroom listing across any property type.",
  },
  {
    label: "Austin seasonal dates",
    args: {
      location: "Austin, TX",
      propertyType: "entire_home",
      checkIn: "2026-05-15",
      checkOut: "2026-05-18",
    },
    queryEquivalent:
      "Analyze Austin, TX for an entire home with seasonal dates check-in 2026-05-15 and check-out 2026-05-18.",
  },
  {
    label: "Marfa sparse market",
    args: { location: "Marfa, TX", propertyType: "entire_home" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Marfa, TX for an entire home and explain how to interpret sparse data.",
  },
];

const NEW_MARKETS_GLOBAL_CASES: ExecuteCase[] = [
  {
    label: "Belo Horizonte any property",
    args: { location: "Belo Horizonte, MG, Brazil", propertyType: "any" },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Belo Horizonte, MG, Brazil across any property type.",
  },
  {
    label: "Savassi any 1 bedroom",
    args: { location: "Savassi, Belo Horizonte, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Savassi, Belo Horizonte, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Boa Viagem any 1 bedroom",
    args: { location: "Boa Viagem, Recife, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Boa Viagem, Recife, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Rio Vermelho any 1 bedroom",
    args: { location: "Rio Vermelho, Salvador, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Rio Vermelho, Salvador, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Moinhos de Vento any 1 bedroom",
    args: { location: "Moinhos de Vento, Porto Alegre, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Moinhos de Vento, Porto Alegre, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Asa Norte any 1 bedroom",
    args: { location: "Asa Norte, Brasilia, Brazil", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Asa Norte, Brasilia, Brazil for a 1-bedroom listing across any property type.",
  },
  {
    label: "Palermo Buenos Aires any 1 bedroom",
    args: { location: "Palermo, Buenos Aires, Argentina", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Palermo, Buenos Aires, Argentina for a 1-bedroom listing across any property type.",
  },
  {
    label: "Roma Norte Mexico City any 1 bedroom",
    args: { location: "Roma Norte, Mexico City, Mexico", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Roma Norte, Mexico City, Mexico for a 1-bedroom listing across any property type.",
  },
  {
    label: "Condesa Mexico City any 1 bedroom",
    args: { location: "Condesa, Mexico City, Mexico", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Condesa, Mexico City, Mexico for a 1-bedroom listing across any property type.",
  },
  {
    label: "Chiado Lisbon any 1 bedroom",
    args: { location: "Chiado, Lisbon, Portugal", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Chiado, Lisbon, Portugal for a 1-bedroom listing across any property type.",
  },
  {
    label: "Cedofeita Porto any 1 bedroom",
    args: { location: "Cedofeita, Porto, Portugal", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Cedofeita, Porto, Portugal for a 1-bedroom listing across any property type.",
  },
  {
    label: "Eixample Barcelona any 1 bedroom",
    args: { location: "Eixample, Barcelona, Spain", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Eixample, Barcelona, Spain for a 1-bedroom listing across any property type.",
  },
  {
    label: "Malasana Madrid any 1 bedroom",
    args: { location: "Malasana, Madrid, Spain", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Malasana, Madrid, Spain for a 1-bedroom listing across any property type.",
  },
  {
    label: "Le Marais Paris any 1 bedroom",
    args: { location: "Le Marais, Paris, France", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Le Marais, Paris, France for a 1-bedroom listing across any property type.",
  },
  {
    label: "Shoreditch London any 1 bedroom",
    args: { location: "Shoreditch, London, United Kingdom", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Shoreditch, London, United Kingdom for a 1-bedroom listing across any property type.",
  },
  {
    label: "Kreuzberg Berlin any 1 bedroom",
    args: { location: "Kreuzberg, Berlin, Germany", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Kreuzberg, Berlin, Germany for a 1-bedroom listing across any property type.",
  },
  {
    label: "Shinjuku Tokyo any 1 bedroom",
    args: { location: "Shinjuku, Tokyo, Japan", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Shinjuku, Tokyo, Japan for a 1-bedroom listing across any property type.",
  },
  {
    label: "Sukhumvit Bangkok any 1 bedroom",
    args: { location: "Sukhumvit, Bangkok, Thailand", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Sukhumvit, Bangkok, Thailand for a 1-bedroom listing across any property type.",
  },
  {
    label: "El Poblado Medellin any 1 bedroom",
    args: { location: "El Poblado, Medellin, Colombia", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for El Poblado, Medellin, Colombia for a 1-bedroom listing across any property type.",
  },
  {
    label: "Downtown Vancouver any 1 bedroom",
    args: { location: "Downtown Vancouver, BC, Canada", propertyType: "any", bedrooms: 1 },
    queryEquivalent:
      "Analyze the Airbnb investment potential for Downtown Vancouver, BC, Canada for a 1-bedroom listing across any property type.",
  },
];

const CASE_SETS: Record<string, ExecuteCase[]> = {
  "urban-mix": URBAN_MIX_CASES,
  "new-markets-global": NEW_MARKETS_GLOBAL_CASES,
};

const CASES = CASE_SETS[REPORT_PRESET];

if (!CASES) {
  throw new Error(`Unknown EXECUTE_REPORT_PRESET: ${REPORT_PRESET}`);
}

function toErrorPayload(error: unknown): {
  name: string;
  message: string;
  code: string | null;
  statusCode: number | null;
} {
  if (error instanceof Error) {
    const errorLike = error as Error & { code?: string; statusCode?: number };
    return {
      name: error.name,
      message: error.message,
      code: errorLike.code ?? null,
      statusCode: errorLike.statusCode ?? null,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    code: null,
    statusCode: null,
  };
}

function isSuccess(result: CaseResult): result is SuccessCaseResult {
  return result.status === "success";
}

function getComparableUrls(rawOutput: unknown): string[] {
  const output = rawOutput as {
    topComparables?: Array<{ url?: string }>;
  };
  return Array.isArray(output.topComparables)
    ? output.topComparables
        .map((item) => item?.url)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
}

function getCaseNotes(result: CaseResult, results: CaseResult[]): string[] {
  const notes: string[] = [];

  if (!isSuccess(result)) {
    if (result.error.code === "execution_failed" && /timed out/i.test(result.error.message)) {
      notes.push("Execute hit the timeout window. This usually means a cold scrape path or an upstream scrape that is too slow for the current execute budget.");
    }
    return notes;
  }

  const rawOutput = result.rawOutput as {
    dataFreshness?: string;
    totalListingsAnalyzed?: number;
    filteredListings?: number;
    revenueEstimate?: { midEstimate?: number };
    averageDailyRate?: { median?: number };
    occupancyEstimate?: { estimatedRate?: number };
    topComparables?: Array<{ roomType?: string; url?: string }>;
  };

  if (rawOutput.dataFreshness === "live") {
    notes.push("This ran on live data instead of cache, so it exercised the cold path.");
  }

  if (result.elapsedMs >= 10000) {
    notes.push("This call was slow enough to be close to the execute timeout boundary.");
  }

  if ((rawOutput.filteredListings ?? 0) === 0) {
    notes.push("The tool returned a valid schema but zero filtered listings. This is useful for resilience, but it may also mean the filter logic is too restrictive or the scraper result shape is missing room-type signals.");
  }

  if ((rawOutput.totalListingsAnalyzed ?? 0) <= 5 || (rawOutput.filteredListings ?? 0) <= 5) {
    notes.push("This is a very thin sample, so downstream revenue and saturation numbers are weak evidence.");
  }

  if ((rawOutput.occupancyEstimate?.estimatedRate ?? 0) === 1) {
    notes.push("Occupancy is capped at 100%, which is a strong sign the review-velocity model is hitting its ceiling on this sample.");
  }

  if ((rawOutput.revenueEstimate?.midEstimate ?? 0) === 0) {
    notes.push("Revenue model produced a zero midpoint, which usually means there was not enough price/review coverage to infer anything useful.");
  }

  const comparableUrls = getComparableUrls(result.rawOutput);
  const duplicateComparableUrls = comparableUrls.filter(
    (url, index) => comparableUrls.indexOf(url) !== index
  );
  if (duplicateComparableUrls.length > 0) {
    notes.push(`Top comparables contain duplicate URLs (${[...new Set(duplicateComparableUrls)].join(", ")}), so the ranking output is not fully deduplicated.`);
  }

  const roomTypes =
    Array.isArray(rawOutput.topComparables)
      ? rawOutput.topComparables
          .map((item) => item?.roomType)
          .filter((value): value is string => typeof value === "string")
      : [];
  if (roomTypes.length > 0 && roomTypes.every((roomType) => roomType === "unknown")) {
    notes.push("Every top comparable came back with `roomType: unknown`, which points to a room-type extraction gap in the tool output.");
  }

  const identicalCase = results.find((other) => {
    if (!isSuccess(other) || other.label === result.label) return false;
    return JSON.stringify(other.rawOutput) === JSON.stringify(result.rawOutput);
  });
  if (identicalCase) {
    notes.push(`This raw output is byte-identical to \`${identicalCase.label}\` despite different input args. That is a strong hint that one of the filters may not be affecting the result.`);
  }

  return notes;
}

async function runCases(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  const session = await client.tools.startSession({ maxSpendUsd: "5.00" });
  const sessionId = session.session.sessionId ?? undefined;

  try {
    for (const testCase of CASES) {
      const startedAt = Date.now();
      try {
        const result = await client.tools.execute({
          toolId: TOOL_ID,
          toolName: TOOL_NAME,
          args: testCase.args,
          sessionId,
        });

        results.push({
          label: testCase.label,
          queryEquivalent: testCase.queryEquivalent,
          args: testCase.args,
          status: "success",
          elapsedMs: Date.now() - startedAt,
          session: result.session as unknown as Record<string, unknown>,
          rawOutput: result.result,
        });
      } catch (error) {
        results.push({
          label: testCase.label,
          queryEquivalent: testCase.queryEquivalent,
          args: testCase.args,
          status: "error",
          elapsedMs: Date.now() - startedAt,
          error: toErrorPayload(error),
        });
      }
    }
  } finally {
    if (sessionId) {
      await client.tools.closeSession(sessionId);
    }
  }

  return results;
}

function buildMarkdown(results: CaseResult[]): string {
  const generatedAt = new Date().toISOString();
  const successCount = results.filter((result) => result.status === "success").length;
  const errorCount = results.length - successCount;
  const timeoutCount = results.filter(
    (result) => result.status === "error" && /timed out/i.test(result.error.message)
  ).length;
  const zeroListingCount = results.filter(
    (result) => isSuccess(result) && ((result.rawOutput as { filteredListings?: number }).filteredListings ?? 0) === 0
  ).length;

  const lines: string[] = [
    "# STR Scout Execute Investigation Report",
    "",
    `Generated at: \`${generatedAt}\``,
    `Preset: \`${REPORT_PRESET}\``,
    `Tool ID: \`${TOOL_ID}\``,
    `Tool Name: \`${TOOL_NAME}\``,
    "",
    `Total cases: ${results.length}`,
    `Successes: ${successCount}`,
    `Errors: ${errorCount}`,
    `Timeouts: ${timeoutCount}`,
    `Successful cases with zero filtered listings: ${zeroListingCount}`,
    "",
    "## Agent Notes",
    "",
    `- ${timeoutCount} cases timed out. Those are not random flaky failures; they usually indicate the execute path cannot comfortably absorb a cold scrape for that market right now.`,
    `- ${zeroListingCount} successful cases returned zero filtered listings, which is valid schema-wise but can hide filter-quality problems.`,
    "- The detailed sections below include my per-case notes plus the raw JSON exactly as the tool returned it.",
    "",
    "## Summary",
    "",
    "| Case | Status | Elapsed (ms) | Notes |",
    "|---|---:|---:|---|",
  ];

  for (const result of results) {
    const summaryNotes = getCaseNotes(result, results);
    const notes =
      result.status === "success"
        ? summaryNotes[0] ?? "Tool returned JSON output"
        : `${result.error.code ?? "error"}: ${result.error.message}`;
    lines.push(`| ${result.label} | ${result.status} | ${result.elapsedMs} | ${notes.replace(/\|/g, "\\|")} |`);
  }

  lines.push("", "## Detailed Results", "");

  for (const result of results) {
    lines.push(`### ${result.label}`, "");
    lines.push(`Status: \`${result.status}\``);
    lines.push(`Elapsed: \`${result.elapsedMs}ms\``);
    lines.push(`Query-equivalent prompt: "${result.queryEquivalent}"`);
    lines.push("");
    lines.push("Args sent to execute:");
    lines.push("```json");
    lines.push(JSON.stringify(result.args, null, 2));
    lines.push("```", "");
    lines.push("Agent notes:");
    const caseNotes = getCaseNotes(result, results);
    if (caseNotes.length === 0) {
      lines.push("- No strong anomaly detected beyond the raw output itself.");
    } else {
      for (const note of caseNotes) {
        lines.push(`- ${note}`);
      }
    }
    lines.push("");

    if (result.status === "success") {
      lines.push("Execute session payload:");
      lines.push("```json");
      lines.push(JSON.stringify(result.session, null, 2));
      lines.push("```", "");
      lines.push("Raw tool output:");
      lines.push("```json");
      lines.push(JSON.stringify(result.rawOutput, null, 2));
      lines.push("```", "");
    } else {
      lines.push("Raw error payload:");
      lines.push("```json");
      lines.push(JSON.stringify(result.error, null, 2));
      lines.push("```", "");
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const results = await runCases();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(REPORT_DIR, `execute-test-report-${REPORT_PRESET}-${timestamp}.md`);

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(outputPath, buildMarkdown(results), "utf8");

  console.log(`Report saved to ${outputPath}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
