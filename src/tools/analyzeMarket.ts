import type { MarketAnalysis, DataFreshness, AirbnbListing, ScrapeOptions } from "../types/index.js";
import { scrapeAirbnbListings } from "../services/apify.js";
import { getBestEffortCachedListings, getCachedListings, saveToCache } from "../services/cache.js";
import { analyzeMarketData } from "../services/analysis.js";
import { generateInvestmentSummary } from "../services/gemini.js";
import { toRawScrapeRequest } from "../services/scrapeRequest.js";

type PropertyType = ScrapeOptions["propertyType"];

interface AnalyzeMarketArgs {
  location: string;
  propertyType?: string;
  bedrooms?: number;
  checkIn?: string;
  checkOut?: string;
}

function normalizeLocation(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("location is required");
  }

  return value.trim();
}

function normalizePropertyType(value: unknown): PropertyType {
  if (value === "private_room" || value === "any" || value === "entire_home") {
    return value;
  }

  return "entire_home";
}

function normalizeBedrooms(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("bedrooms must be a non-negative number");
  }

  return Math.floor(parsed);
}

function normalizeDate(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string in YYYY-MM-DD format`);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }

  return trimmed;
}

function shouldUseDeterministicSummary(data: Omit<MarketAnalysis, "investmentSummary">): boolean {
  return (
    data.dataFreshness === "market_estimates_only" ||
    data.filteredListings < 5 ||
    data.revenueEstimate.confidenceLevel === "low"
  );
}

function buildFollowUpGuidance(data: Omit<MarketAnalysis, "investmentSummary">): string | null {
  if (data.dataFreshness === "market_estimates_only") {
    return "For higher confidence, rerun the same market without seasonal dates or retry later so STR Scout can refresh live listing data.";
  }

  if (data.filteredListings === 0) {
    return "For higher confidence, broaden the request with propertyType \"any\", a lower bedroom requirement, or no seasonal dates.";
  }

  if (data.revenueEstimate.confidenceLevel === "low" || data.filteredListings < 5) {
    return "For higher confidence, broaden the filters and compare the result with a nearby neighborhood or nearby city.";
  }

  return null;
}

function buildFallbackSummary(data: Omit<MarketAnalysis, "investmentSummary">): string {
  const { revenueEstimate: rev, competitiveSaturation: sat, averageDailyRate: adr, occupancyEstimate: occ } = data;
  const followUp = buildFollowUpGuidance(data);

  if (data.filteredListings === 0) {
    return [
      `STR Scout sampled ${data.totalListingsAnalyzed} Airbnb listings for ${data.location}, but none matched the requested filters exactly.`,
      followUp,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const opening =
    data.dataFreshness === "market_estimates_only"
      ? `Live Airbnb scraping was unavailable for the exact request, so STR Scout is falling back to the closest cached market baseline for ${data.location}.`
      : `The ${data.location} short-term rental market looks ${sat.label} based on ${data.filteredListings} comparable listings.`;

  return [
    opening,
    `Estimated annual revenue ranges from $${rev.lowEstimate.toLocaleString()} to $${rev.highEstimate.toLocaleString()} with a median ADR of $${adr.median}/night and ${(occ.estimatedRate * 100).toFixed(0)}% estimated occupancy (${rev.confidenceLevel} confidence).`,
    followUp,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildScrapeOptions(args: AnalyzeMarketArgs): {
  location: string;
  propertyType: PropertyType;
  bedrooms?: number;
  checkIn?: string;
  checkOut?: string;
} {
  return {
    location: normalizeLocation(args.location),
    propertyType: normalizePropertyType(args.propertyType),
    bedrooms: normalizeBedrooms(args.bedrooms),
    checkIn: normalizeDate(args.checkIn, "checkIn"),
    checkOut: normalizeDate(args.checkOut, "checkOut"),
  };
}

/**
 * Analyze a short-term rental market.
 * Returns a plain MarketAnalysis object; the server wraps it
 * with successResult() to add content + structuredContent.
 */
export async function handleAnalyzeMarket(
  args: Record<string, unknown> | undefined
): Promise<MarketAnalysis> {
  const normalized = buildScrapeOptions((args ?? {}) as unknown as AnalyzeMarketArgs);
  const { location, propertyType, bedrooms, checkIn, checkOut } = normalized;

  console.log(`[analyze] Starting analysis for "${location}"`);

  let listings: AirbnbListing[];
  let dataFreshness: DataFreshness = "live";
  let cachedAt = new Date().toISOString();

  const scrapeOptions: ScrapeOptions = {
    location,
    minBedrooms: bedrooms,
    checkIn,
    checkOut,
    propertyType,
  };

  const rawScrapeRequest = toRawScrapeRequest(scrapeOptions);
  const cached = await getCachedListings(rawScrapeRequest);

  if (cached) {
    console.log(`[analyze] Cache hit (${cached.dataFreshness}) - ${cached.listings.length} listings`);
    listings = cached.listings;
    dataFreshness = cached.dataFreshness;
    cachedAt = cached.cachedAt;
  } else {
    console.log(`[analyze] Cache miss - scraping via Apify`);

    try {
      listings = await scrapeAirbnbListings(scrapeOptions);
      await saveToCache(rawScrapeRequest, listings);
      console.log(`[analyze] Saved ${listings.length} listings to cache`);
    } catch (error) {
      const fallbackCached = await getBestEffortCachedListings(rawScrapeRequest);
      if (!fallbackCached) {
        const message = error instanceof Error ? error.message : "Unknown scrape failure";
        throw new Error(
          `Live Airbnb scrape failed for "${location}" and no cached baseline was available. Retry without seasonal dates or try again later. Underlying error: ${message}`
        );
      }

      console.warn(
        `[analyze] Live scrape failed, using cached fallback (${fallbackCached.dataFreshness}) matched to ${fallbackCached.matchedRequest.location}`
      );

      listings = fallbackCached.listings;
      dataFreshness = fallbackCached.dataFreshness;
      cachedAt = fallbackCached.cachedAt;
    }
  }

  if (listings.length === 0) {
    throw new Error(
      `No Airbnb listings found for "${location}". Try a broader location, remove seasonal dates, or lower the bedroom filter.`
    );
  }

  console.log(`[analyze] Analyzing ${listings.length} listings (propertyType: ${propertyType})`);
  const { filtered, revenue, adr, occupancy, saturation, amenityGap, comparables } =
    analyzeMarketData(listings, propertyType);

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

  let investmentSummary: string;
  if (shouldUseDeterministicSummary(partialResult)) {
    investmentSummary = buildFallbackSummary(partialResult);
  } else {
    try {
      investmentSummary = await generateInvestmentSummary(partialResult);
      console.log("[analyze] Gemini summary generated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gemini failure";
      console.warn(`[analyze] Gemini failed, using fallback summary: ${message}`);
      investmentSummary = buildFallbackSummary(partialResult);
    }
  }

  const result: MarketAnalysis = {
    ...partialResult,
    investmentSummary,
  };

  return JSON.parse(JSON.stringify(result));
}
