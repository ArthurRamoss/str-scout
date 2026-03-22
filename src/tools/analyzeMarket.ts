import type { MarketAnalysis, DataFreshness, AirbnbListing } from "../types/index.js";
import { scrapeAirbnbListings } from "../services/apify.js";
import { getCachedListings, saveToCache } from "../services/cache.js";
import { analyzeMarketData } from "../services/analysis.js";
import { generateInvestmentSummary } from "../services/gemini.js";
import { toRawScrapeRequest } from "../services/scrapeRequest.js";

interface AnalyzeMarketArgs {
  location: string;
  propertyType?: string;
  bedrooms?: number;
  checkIn?: string;
  checkOut?: string;
}

/**
 * Analyze a short-term rental market.
 * Returns a plain MarketAnalysis object — the server wraps it
 * with successResult() to add content + structuredContent.
 */
export async function handleAnalyzeMarket(
  args: Record<string, unknown> | undefined
): Promise<MarketAnalysis> {
  const {
    location,
    propertyType = "entire_home",
    bedrooms,
    checkIn,
    checkOut,
  } = (args ?? {}) as unknown as AnalyzeMarketArgs;

  if (!location) {
    throw new Error("location is required");
  }

  console.log(`[analyze] Starting analysis for "${location}"`);

  // 1. Check cache
  let listings: AirbnbListing[];
  let dataFreshness: DataFreshness = "live";
  let cachedAt: string = new Date().toISOString();

  const rawScrapeRequest = toRawScrapeRequest({
    location,
    minBedrooms: bedrooms ?? undefined,
    checkIn: checkIn ?? undefined,
    checkOut: checkOut ?? undefined,
    propertyType: propertyType as any,
  });

  const cached = await getCachedListings(rawScrapeRequest);

  if (cached) {
    console.log(`[analyze] Cache hit (${cached.dataFreshness}) — ${cached.listings.length} listings`);
    listings = cached.listings;
    dataFreshness = cached.dataFreshness;
    cachedAt = cached.cachedAt;
  } else {
    // 2. Scrape fresh data
    console.log(`[analyze] Cache miss — scraping via Apify`);
    listings = await scrapeAirbnbListings({
      location,
      minBedrooms: bedrooms ?? undefined,
      checkIn: checkIn ?? undefined,
      checkOut: checkOut ?? undefined,
      propertyType: propertyType as any,
    });

    // Save to cache
    await saveToCache(rawScrapeRequest, listings);
    console.log(`[analyze] Saved ${listings.length} listings to cache`);
  }

  if (listings.length === 0) {
    throw new Error(`No Airbnb listings found for "${location}". Try a different location or broader search criteria.`);
  }

  // 3. Run analysis engine
  console.log(`[analyze] Analyzing ${listings.length} listings (propertyType: ${propertyType})`);
  const {
    filtered,
    revenue,
    adr,
    occupancy,
    saturation,
    amenityGap,
    comparables,
  } = analyzeMarketData(listings, propertyType);

  // 4. Build partial result for Gemini
  const partialResult: Omit<MarketAnalysis, "investmentSummary"> = {
    location,
    dataFreshness,
    cachedAt,
    totalListingsAnalyzed: listings.length,
    filteredListings: filtered.length,
    revenueEstimate: revenue,
    averageDailyRate: adr,
    occupancyEstimate: occupancy,
    competitiveSaturation: saturation,
    amenityGapAnalysis: amenityGap,
    topComparables: comparables,
  };

  // 5. Generate investment summary via Gemini
  let investmentSummary: string;
  try {
    investmentSummary = await generateInvestmentSummary(partialResult);
    console.log(`[analyze] Gemini summary generated`);
  } catch (error: any) {
    console.warn(`[analyze] Gemini failed, using fallback summary: ${error.message}`);
    investmentSummary = buildFallbackSummary(partialResult);
  }

  // 6. Build final result
  const result: MarketAnalysis = {
    ...partialResult,
    investmentSummary,
  };

  // Force plain JSON — no class instances, no prototypes, no circular refs
  return JSON.parse(JSON.stringify(result));
}

function buildFallbackSummary(data: Omit<MarketAnalysis, "investmentSummary">): string {
  const { revenueEstimate: rev, competitiveSaturation: sat, averageDailyRate: adr } = data;
  return `The ${data.location} short-term rental market shows ${sat.label} conditions with ${data.filteredListings} comparable listings. Estimated annual revenue ranges from $${rev.lowEstimate.toLocaleString()} to $${rev.highEstimate.toLocaleString()} at a median ADR of $${adr.median}/night (${rev.confidenceLevel} confidence).`;
}
