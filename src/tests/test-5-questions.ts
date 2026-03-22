import { ContextClient } from "@ctxprotocol/sdk";

const CONTEXT_API_KEY = process.env.CONTEXT_API_KEY!;
const TOOL_ID = "976d3ad9-a77d-492b-8d16-5360a59ac83f";

const client = new ContextClient({ apiKey: CONTEXT_API_KEY });

const TEST_CASES = [
  {
    label: "Q1: Entire home revenue in Austin, TX",
    args: { location: "Austin, TX", propertyType: "entire_home" },
  },
  {
    label: "Q2: Market saturation in Austin, TX",
    args: { location: "Austin, TX" },
  },
  {
    label: "Q3: Amenities to compete in Austin, TX",
    args: { location: "Austin, TX", propertyType: "entire_home" },
  },
  {
    label: "Q4: Private room with 1 bedroom in Austin, TX",
    args: { location: "Austin, TX", propertyType: "private_room", bedrooms: 1 },
  },
  {
    label: "Q5: Studio in Denver, CO (cold market — may timeout)",
    args: { location: "Denver, CO", bedrooms: 0 },
  },
];

type Nested = Record<string, unknown>;

function fmt(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  if (typeof val === "number") return val.toLocaleString("en-US");
  return String(val);
}

function printResult(label: string, data: Nested): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(label);
  console.log("=".repeat(70));

  console.log(`Location: ${fmt(data.location)}`);
  console.log(`Data Freshness: ${fmt(data.dataFreshness)} | Cached At: ${fmt(data.cachedAt)}`);
  console.log(`Listings: ${fmt(data.filteredListings)} filtered / ${fmt(data.totalListingsAnalyzed)} total`);

  const rev = data.revenueEstimate as Nested | undefined;
  if (rev) {
    console.log(`\nREVENUE ESTIMATE:`);
    console.log(`  Low:  $${fmt(rev.lowEstimate)}`);
    console.log(`  Mid:  $${fmt(rev.midEstimate)}`);
    console.log(`  High: $${fmt(rev.highEstimate)}`);
    console.log(`  Confidence: ${fmt(rev.confidenceLevel)}`);
    console.log(`  Methodology: ${fmt(rev.methodology)}`);
  }

  const adr = data.averageDailyRate as Nested | undefined;
  if (adr) {
    console.log(`\nAVERAGE DAILY RATE:`);
    console.log(`  Median: $${fmt(adr.median)} | P25: $${fmt(adr.percentile25)} | P75: $${fmt(adr.percentile75)}`);
  }

  const occ = data.occupancyEstimate as Nested | undefined;
  if (occ) {
    const rate = typeof occ.estimatedRate === "number" ? (occ.estimatedRate * 100).toFixed(0) : "?";
    console.log(`\nOCCUPANCY:`);
    console.log(`  Rate: ${rate}% | Confidence: ${fmt(occ.confidenceLevel)}`);
    console.log(`  Based on: ${fmt(occ.basedOn)}`);
  }

  const sat = data.competitiveSaturation as Nested | undefined;
  if (sat) {
    console.log(`\nSATURATION:`);
    console.log(`  Score: ${fmt(sat.score)}/100 (${fmt(sat.label)})`);
    console.log(`  Total Listings: ${fmt(sat.totalListings)} | Avg Rating: ${fmt(sat.averageRating)} | Guest Favorites: ${fmt(sat.guestFavoritePercent)}%`);
  }

  const amenity = data.amenityGapAnalysis as Nested | undefined;
  if (amenity) {
    const top = amenity.topPerformerAmenities as Nested[] | undefined;
    const recommended = amenity.recommendedAmenities as string[] | undefined;
    console.log(`\nAMENITY GAP ANALYSIS:`);
    if (top?.length) {
      for (const a of top.slice(0, 5)) {
        console.log(`  ${fmt(a.amenity)}: ${fmt(a.prevalenceTopPerformers)}% top performers vs ${fmt(a.prevalenceAll)}% all`);
      }
    }
    if (recommended?.length) {
      console.log(`  Recommended: ${recommended.join(", ")}`);
    }
  }

  const comps = data.topComparables as Nested[] | undefined;
  if (comps?.length) {
    console.log(`\nTOP COMPARABLES (${comps.length}):`);
    for (const c of comps) {
      console.log(`  ${fmt(c.name)}`);
      console.log(`    $${fmt(c.pricePerNight)}/night | Rating: ${fmt(c.rating)} | Reviews: ${fmt(c.reviewCount)} | ${fmt(c.roomType)} | GF: ${fmt(c.isGuestFavorite)}`);
      console.log(`    ${fmt(c.url)}`);
    }
  }

  console.log(`\nINVESTMENT SUMMARY:`);
  console.log(`  ${fmt(data.investmentSummary)}`);
}

async function main() {
  const session = await client.tools.startSession({ maxSpendUsd: "1.00" });
  const sessionId = session.session.sessionId!;
  console.log(`Session: ${sessionId}`);

  for (const tc of TEST_CASES) {
    console.log(`\n>>> Running: ${tc.label}...`);
    const start = Date.now();
    try {
      const result = await client.tools.execute({
        toolId: TOOL_ID,
        toolName: "analyze_str_market",
        args: tc.args,
        sessionId,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const data = result.result as Nested;
      console.log(`[${elapsed}s] SUCCESS`);
      printResult(tc.label, data);
    } catch (err: any) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[${elapsed}s] ERROR: ${err.message}`);
    }
  }

  await client.tools.closeSession(sessionId);
  console.log("\nSession closed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
