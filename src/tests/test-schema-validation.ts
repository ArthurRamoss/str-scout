/**
 * Local smoke test — simulates what CTX Protocol does:
 * 1. Get the outputSchema from TOOLS
 * 2. Build a mock result matching what handleAnalyzeMarket returns
 * 3. Validate structuredContent against outputSchema using AJV
 *
 * If this passes, the CTX smoke test should pass too.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Ajv = require("ajv");
import { TOOLS } from "../tools/index.js";
import { analyzeMarketData } from "../services/analysis.js";
import type { AirbnbListing, MarketAnalysis } from "../types/index.js";

// Mock listings (memo23 format) — same as test-analysis.ts
function createMockListings(): AirbnbListing[] {
  const listings: AirbnbListing[] = [];
  for (let i = 0; i < 20; i++) {
    listings.push({
      id: `listing_${i}`,
      property_name: `Austin Listing ${i}`,
      listing_url: `https://www.airbnb.com/rooms/${100000 + i}`,
      room_type: i === 5 ? "Private room" : "Entire home/apt",
      pricing_base_price: 100 + i * 20,
      review_count: 10 + i * 5,
      review_overall_rating: 4.0 + (i % 10) * 0.1,
      accommodation_bedrooms: 1 + (i % 3),
      sbui_is_guest_favorite: i % 5 === 0,
      amenities: i < 5
        ? ["Wifi", "Kitchen", "Pool", "Hot tub", "Dryer", "BBQ grill", "Washer"]
        : ["Wifi", "Air conditioning"],
    });
  }
  return listings;
}

async function main() {
  const tool = TOOLS.find((t) => t.name === "analyze_str_market");
  if (!tool) {
    console.error("Tool not found!");
    process.exit(1);
  }

  console.log("=== CTX Smoke Test Simulation (Mock Data) ===\n");

  // 1. Check outputSchema
  const outputSchema = tool.outputSchema;
  console.log("1. outputSchema.type:", (outputSchema as any)?.type);

  // 2. Build result exactly like handleAnalyzeMarket does
  const listings = createMockListings();
  const { filtered, revenue, adr, occupancy, saturation, amenityGap, comparables } =
    analyzeMarketData(listings, "entire_home");

  const result: MarketAnalysis = {
    location: "Austin, TX",
    dataFreshness: "cached_48h",
    cachedAt: new Date().toISOString(),
    totalListingsAnalyzed: listings.length,
    filteredListings: filtered.length,
    revenueEstimate: revenue,
    averageDailyRate: adr,
    occupancyEstimate: occupancy,
    competitiveSaturation: saturation,
    amenityGapAnalysis: amenityGap,
    topComparables: comparables,
    investmentSummary: "Test investment summary for smoke test validation.",
  };

  // Force plain JSON exactly like the handler does
  const plainResult = JSON.parse(JSON.stringify(result));

  console.log("2. structuredContent type:", typeof plainResult);
  console.log("   constructor:", plainResult?.constructor?.name);
  console.log("   Top-level keys:", Object.keys(plainResult));
  console.log("");

  // 3. Validate with AJV (same as CTX does)
  console.log("3. AJV Validation (strict: false, allErrors: true):");
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(outputSchema);
  const valid = validate(plainResult) as boolean;

  if (valid) {
    console.log("   ✅ PASS — structuredContent matches outputSchema");
  } else {
    console.log("   ❌ FAIL — Schema errors:");
    for (const err of (validate.errors ?? []) as any[]) {
      console.log(`     ${err.instancePath || "(root)"}: ${err.message}`);
      if (err.params) {
        console.log(`       params:`, JSON.stringify(err.params));
      }
    }
  }

  // 4. Check required fields
  console.log("\n4. Required fields check:");
  const required = (outputSchema as any).required ?? [];
  for (const field of required) {
    const val = plainResult[field];
    const typeStr = val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
    const present = val !== undefined;
    console.log(`   ${present ? "✅" : "❌"} ${field}: ${typeStr}`);
  }

  // 5. Also validate the full serialized JSON-RPC response shape
  // that CTX would receive over the wire
  console.log("\n5. Wire format (what CTX receives):");
  const mcpResponse = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [{ type: "text", text: "STR Market Analysis for Austin, TX..." }],
      structuredContent: plainResult,
    },
  };
  console.log("   mcpResponse.result.structuredContent type:", typeof mcpResponse.result.structuredContent);
  console.log("   Is plain object:", mcpResponse.result.structuredContent?.constructor === Object);

  // Validate the structuredContent from the wire format
  const wireValid = validate(mcpResponse.result.structuredContent) as boolean;
  console.log("   AJV on wire structuredContent:", wireValid ? "✅ PASS" : "❌ FAIL");
  if (!wireValid) {
    for (const err of (validate.errors ?? []) as any[]) {
      console.log(`     ${err.instancePath || "(root)"}: ${err.message}`);
    }
  }

  console.log("\n=== Done ===");
  process.exit(valid ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
