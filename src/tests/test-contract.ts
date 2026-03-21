import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { ANALYZE_STR_MARKET_OUTPUT_SCHEMA } from "../tools/index.js";
import {
  createAnalyzeMarketHandler,
  type AnalyzeMarketDependencies,
} from "../tools/analyzeMarket.js";
import { buildRawListingsCacheKey } from "../services/cache.js";
import { toRawScrapeRequest } from "../services/scrapeRequest.js";
import type {
  AirbnbListing,
  MarketAnalysis,
  ScrapeOptions,
} from "../types/index.js";
import type { RawScrapeRequest } from "../services/scrapeRequest.js";

const sampleListings: AirbnbListing[] = [
  {
    id: "listing-1",
    title: "Entire rental unit in Austin, Texas",
    propertyUrl: "https://www.airbnb.com/rooms/listing-1",
    starRating: 4.9,
    reviewsCount: 120,
    price: "$900",
    dates: "Mar 21 - 26",
  },
];

const sampleAnalysis = {
  filtered: sampleListings,
  revenue: {
    lowEstimate: 42000,
    midEstimate: 58000,
    highEstimate: 73000,
    confidenceLevel: "medium" as const,
    methodology: "Deterministic test fixture for MCP contract validation.",
  },
  adr: {
    median: 210,
    percentile25: 180,
    percentile75: 260,
  },
  occupancy: {
    estimatedRate: 0.67,
    confidenceLevel: "medium" as const,
    basedOn: "Deterministic test fixture occupancy explanation.",
  },
  saturation: {
    score: 48,
    label: "balanced" as const,
    totalListings: 24,
    averageRating: 4.76,
    guestFavoritePercent: 33.3,
  },
  amenityGap: {
    topPerformerAmenities: [
      {
        amenity: "Pool",
        prevalenceTopPerformers: 60,
        prevalenceAll: 25,
      },
      {
        amenity: "Wifi",
        prevalenceTopPerformers: 100,
        prevalenceAll: 90,
      },
    ],
    recommendedAmenities: ["Pool", "Hot tub"],
  },
  comparables: [
    {
      name: "Comparable Austin Listing",
      url: "https://www.airbnb.com/rooms/comparable-1",
      pricePerNight: 225,
      rating: 4.91,
      reviewCount: 143,
      roomType: "Entire home/apt",
      isGuestFavorite: true,
    },
  ],
};

const validateMarketAnalysis =
  new AjvJsonSchemaValidator().getValidator<MarketAnalysis>(
    ANALYZE_STR_MARKET_OUTPUT_SCHEMA as never
  );

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

function createDependencies(
  overrides: Partial<AnalyzeMarketDependencies> = {}
): AnalyzeMarketDependencies {
  return {
    getCachedListings: async () => null,
    saveToCache: async () => undefined,
    scrapeAirbnbListings: async () => sampleListings,
    analyzeMarketData: () => sampleAnalysis,
    generateInvestmentSummary: async () =>
      "Austin looks attractive for STR investment with balanced competition and strong ADR support.",
    ...overrides,
  };
}

function assertSchemaValid(data: MarketAnalysis, label: string) {
  const validationResult = validateMarketAnalysis(data);
  assert(
    validationResult.valid,
    `${label} matches published outputSchema${
      validationResult.valid ? "" : ` (${validationResult.errorMessage})`
    }`
  );
}

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedMessage: string,
  label: string
) {
  try {
    await fn();
    assert(false, `${label} rejects with "${expectedMessage}"`);
  } catch (error: any) {
    assert(
      String(error?.message ?? error).includes(expectedMessage),
      `${label} rejects with "${expectedMessage}"`
    );
  }
}

async function main() {
  console.log("STR Scout - MCP Contract Validation");

  console.log("\nTest 1: Live response matches outputSchema");
  let savedRequest: RawScrapeRequest | null = null;
  const liveHandler = createAnalyzeMarketHandler(
    createDependencies({
      saveToCache: async (request: RawScrapeRequest) => {
        savedRequest = request;
      },
    })
  );
  const liveResponse = await liveHandler({
    location: "Austin, TX",
    propertyType: "entire_home",
    bedrooms: 2,
  });
  assert(
    liveResponse.structuredContent.cachedAt === null,
    "Live response returns cachedAt = null"
  );
  assert(
    liveResponse.structuredContent.dataFreshness === "live",
    "Live response marks dataFreshness as live"
  );
  assert(
    liveResponse.content[0]?.type === "text",
    "Live response includes text content"
  );
  assertSchemaValid(liveResponse.structuredContent, "Live response");
  assert(savedRequest !== null, "Live response writes to cache on cache miss");
  const savedMinBedrooms = (savedRequest as RawScrapeRequest | null)?.minBedrooms;
  assert(
    savedMinBedrooms === 2,
    "Live response saves cache using bedroom-specific raw scrape request"
  );

  console.log("\nTest 2: Cached response matches outputSchema");
  let scrapeCalled = false;
  const cachedAt = "2026-03-21T15:30:00.000Z";
  const cachedHandler = createAnalyzeMarketHandler(
    createDependencies({
      getCachedListings: async () => ({
        listings: sampleListings,
        dataFreshness: "cached_48h",
        cachedAt,
      }),
      scrapeAirbnbListings: async () => {
        scrapeCalled = true;
        return sampleListings;
      },
    })
  );
  const cachedResponse = await cachedHandler({ location: "Austin, TX" });
  assert(
    cachedResponse.structuredContent.cachedAt === cachedAt,
    "Cached response returns ISO cachedAt"
  );
  assert(
    cachedResponse.structuredContent.dataFreshness === "cached_48h",
    "Cached response preserves cached freshness label"
  );
  assert(scrapeCalled === false, "Cached response does not call scraper");
  assertSchemaValid(cachedResponse.structuredContent, "Cached response");

  console.log("\nTest 3: Gemini failure falls back to schema-valid summary");
  const fallbackHandler = createAnalyzeMarketHandler(
    createDependencies({
      generateInvestmentSummary: async () => {
        throw new Error("Gemini offline");
      },
    })
  );
  const fallbackResponse = await fallbackHandler({ location: "Austin, TX" });
  assert(
    fallbackResponse.structuredContent.investmentSummary.length > 20,
    "Fallback summary is populated when Gemini fails"
  );
  assertSchemaValid(fallbackResponse.structuredContent, "Fallback response");

  console.log("\nTest 4: Invalid and empty upstream paths fail explicitly");
  const missingLocationHandler = createAnalyzeMarketHandler(createDependencies());
  await assertRejects(
    () => missingLocationHandler(undefined),
    "location is required",
    "Missing location"
  );

  const noListingsHandler = createAnalyzeMarketHandler(
    createDependencies({
      scrapeAirbnbListings: async () => [],
    })
  );
  await assertRejects(
    () => noListingsHandler({ location: "Austin, TX" }),
    "No Airbnb listings found",
    "Empty scrape result"
  );

  const scrapeFailureHandler = createAnalyzeMarketHandler(
    createDependencies({
      scrapeAirbnbListings: async () => {
        throw new Error("Apify unavailable");
      },
    })
  );
  await assertRejects(
    () => scrapeFailureHandler({ location: "Austin, TX" }),
    "Unable to fetch market data",
    "Scrape failure"
  );

  console.log("\nTest 5: Concurrent identical requests reuse the same scrape");
  let concurrentScrapeCalls = 0;
  let concurrentSaveCalls = 0;
  const concurrentGate: {
    releaseScrape: (() => void) | null;
    markScrapeStarted: (() => void) | null;
  } = {
    releaseScrape: null,
    markScrapeStarted: null,
  };
  const scrapeStarted = new Promise<void>((resolve) => {
    concurrentGate.markScrapeStarted = () => {
      resolve();
    };
  });
  const scrapeBlocked = new Promise<void>((resolve) => {
    concurrentGate.releaseScrape = () => {
      resolve();
    };
  });
  const dedupeHandler = createAnalyzeMarketHandler(
    createDependencies({
      getCachedListings: async () => null,
      saveToCache: async () => {
        concurrentSaveCalls++;
      },
      scrapeAirbnbListings: async () => {
        concurrentScrapeCalls++;
        if (concurrentGate.markScrapeStarted) {
          concurrentGate.markScrapeStarted();
        }
        await scrapeBlocked;
        return sampleListings;
      },
    })
  );
  const firstRequest = dedupeHandler({ location: "Austin, TX" });
  await scrapeStarted;
  const secondRequest = dedupeHandler({ location: "Austin, TX" });
  const releaseScrape = concurrentGate.releaseScrape;
  if (!releaseScrape) {
    throw new Error("Concurrent scrape gate did not initialize");
  }
  releaseScrape();
  const [firstConcurrentResponse, secondConcurrentResponse] = await Promise.all([
    firstRequest,
    secondRequest,
  ]);
  assert(
    concurrentScrapeCalls === 1,
    "Concurrent identical requests trigger only one upstream scrape"
  );
  assert(
    concurrentSaveCalls === 1,
    "Concurrent identical requests write one cache entry"
  );
  assertSchemaValid(
    firstConcurrentResponse.structuredContent,
    "First concurrent response"
  );
  assertSchemaValid(
    secondConcurrentResponse.structuredContent,
    "Second concurrent response"
  );

  console.log("\nTest 6: Cache key derivation uses raw scrape inputs");
  const bedroomOneKey = buildRawListingsCacheKey(
    toRawScrapeRequest({
      location: "Austin, TX",
      minBedrooms: 1,
    })
  );
  const bedroomTwoKey = buildRawListingsCacheKey(
    toRawScrapeRequest({
      location: "Austin, TX",
      minBedrooms: 2,
    })
  );
  assert(
    bedroomOneKey !== bedroomTwoKey,
    "Different bedroom filters produce different cache keys"
  );

  const marchKey = buildRawListingsCacheKey(
    toRawScrapeRequest({
      location: "Austin, TX",
      checkIn: "2026-03-21",
      checkOut: "2026-03-26",
    })
  );
  const aprilKey = buildRawListingsCacheKey(
    toRawScrapeRequest({
      location: "Austin, TX",
      checkIn: "2026-04-21",
      checkOut: "2026-04-26",
    })
  );
  assert(
    marchKey !== aprilKey,
    "Different check-in/check-out windows produce different cache keys"
  );

  const entireHomeKey = buildRawListingsCacheKey(
    toRawScrapeRequest({
      location: "Austin, TX",
      minBedrooms: 2,
      propertyType: "entire_home",
    } satisfies ScrapeOptions)
  );
  const privateRoomKey = buildRawListingsCacheKey(
    toRawScrapeRequest({
      location: "Austin, TX",
      minBedrooms: 2,
      propertyType: "private_room",
    } satisfies ScrapeOptions)
  );
  assert(
    entireHomeKey === privateRoomKey,
    "Property type does not affect the raw listings cache key"
  );

  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
