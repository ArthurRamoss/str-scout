import { getBestEffortCachedListings, getCachedListings, saveToCache } from "../services/cache.js";
import type { AirbnbListing } from "../types/index.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`  PASS: ${msg}`);
    passed++;
  }
}

async function main() {
  console.log("STR Scout - Cache Fallback Tests\n");

  const listings: AirbnbListing[] = [
    {
      id: "cache-test-1",
      listing_url: "https://www.airbnb.com/rooms/cache-test-1",
      room_type: "Entire home/apt",
      pricing_base_price: 180,
      review_count: 42,
      review_overall_rating: 4.8,
      amenities: ["Wifi", "Kitchen"],
    },
  ];

  const baseRequest = {
    location: "Austin, TX",
    propertyType: "entire_home",
    minBedrooms: 1,
  } as const;

  await saveToCache(baseRequest, listings);

  const exact = await getCachedListings(baseRequest);
  assert(!!exact, "Exact cache lookup returns a result");
  assert(exact?.dataFreshness === "cached_48h", `Exact cache freshness is cached_48h (got ${exact?.dataFreshness})`);

  const seasonalRequest = {
    ...baseRequest,
    checkIn: "2026-05-15",
    checkOut: "2026-05-18",
  };

  const bestEffort = await getBestEffortCachedListings(seasonalRequest);
  assert(!!bestEffort, "Best-effort cache lookup returns a fallback result");
  assert(bestEffort?.exactMatch === false, `Seasonal lookup falls back to a non-exact cache entry (exactMatch=${bestEffort?.exactMatch})`);
  assert(
    bestEffort?.dataFreshness === "market_estimates_only",
    `Relaxed cache match is flagged as market_estimates_only (got ${bestEffort?.dataFreshness})`
  );
  assert(bestEffort?.matchedRequest.checkIn === undefined, "Fallback cache candidate drops seasonal dates");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
