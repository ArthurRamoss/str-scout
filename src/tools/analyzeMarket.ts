import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  AirbnbListing,
  MarketAnalysis,
  DataFreshness,
  ScrapeOptions,
} from "../types/index.js";
import { scrapeAirbnbListings as scrapeAirbnbListingsService } from "../services/apify.js";
import {
  getCachedListings as getCachedListingsService,
  saveToCache as saveToCacheService,
  type CacheResult,
} from "../services/cache.js";
import { analyzeMarketData as analyzeMarketDataService } from "../services/analysis.js";
import { generateInvestmentSummary as generateInvestmentSummaryService } from "../services/gemini.js";
import {
  toRawScrapeRequest,
  type RawScrapeRequest,
} from "../services/scrapeRequest.js";

interface AnalyzeMarketArgs {
  location: string;
  propertyType?: ScrapeOptions["propertyType"];
  bedrooms?: number;
  checkIn?: string;
  checkOut?: string;
}

type AnalyzeMarketDataResult = ReturnType<typeof analyzeMarketDataService>;
type AnalyzeMarketStructuredContent = MarketAnalysis & Record<string, unknown>;

export interface AnalyzeMarketResponse extends CallToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: AnalyzeMarketStructuredContent;
}

export interface AnalyzeMarketDependencies {
  getCachedListings: (request: RawScrapeRequest) => Promise<CacheResult | null>;
  saveToCache: (request: RawScrapeRequest, listings: AirbnbListing[]) => Promise<void>;
  scrapeAirbnbListings: (options: ScrapeOptions) => Promise<AirbnbListing[]>;
  analyzeMarketData: (
    listings: AirbnbListing[],
    propertyType?: string
  ) => AnalyzeMarketDataResult;
  generateInvestmentSummary: (
    analysis: Omit<MarketAnalysis, "investmentSummary">
  ) => Promise<string>;
}

const defaultDependencies: AnalyzeMarketDependencies = {
  getCachedListings: getCachedListingsService,
  saveToCache: saveToCacheService,
  scrapeAirbnbListings: scrapeAirbnbListingsService,
  analyzeMarketData: analyzeMarketDataService,
  generateInvestmentSummary: generateInvestmentSummaryService,
};

export function buildAnalyzeMarketResponse(
  result: MarketAnalysis
): AnalyzeMarketResponse {
  return {
    content: [{ type: "text", text: formatTextResponse(result) }],
    structuredContent: result as AnalyzeMarketStructuredContent,
  };
}

export function createAnalyzeMarketHandler(
  deps: AnalyzeMarketDependencies
): (
  args: Record<string, unknown> | undefined
) => Promise<AnalyzeMarketResponse> {
  return async function handleAnalyzeMarket(
    args: Record<string, unknown> | undefined
  ): Promise<AnalyzeMarketResponse> {
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

    const rawScrapeRequest = toRawScrapeRequest({
      location,
      minBedrooms: bedrooms ?? undefined,
      checkIn: checkIn ?? undefined,
      checkOut: checkOut ?? undefined,
    });

    let listings: AirbnbListing[];
    let dataFreshness: DataFreshness = "live";
    let cachedAt: string | null = null;

    const cached = await deps.getCachedListings(rawScrapeRequest);

    if (cached) {
      console.log(
        `[analyze] Cache hit (${cached.dataFreshness}) - ${cached.listings.length} listings`
      );
      listings = cached.listings;
      dataFreshness = cached.dataFreshness;
      cachedAt = cached.cachedAt;
    } else {
      console.log(`[analyze] Cache miss - scraping via Apify`);
      try {
        listings = await deps.scrapeAirbnbListings({
          ...rawScrapeRequest,
          propertyType,
        });
      } catch (error: any) {
        console.error(`[analyze] Apify scrape failed: ${error.message}`);
        throw new Error(
          `Unable to fetch market data for "${location}". The scraper may be temporarily unavailable. Please try again in a few minutes.`
        );
      }

      if (listings.length === 0) {
        throw new Error(
          `No Airbnb listings found for "${location}". Try a different location or broader search criteria.`
        );
      }

      await deps.saveToCache(rawScrapeRequest, listings);
      console.log(`[analyze] Saved ${listings.length} listings to cache`);
    }

    if (listings.length === 0) {
      throw new Error(
        `No Airbnb listings found for "${location}". Try a different location or broader search criteria.`
      );
    }

    console.log(
      `[analyze] Analyzing ${listings.length} listings (propertyType: ${propertyType})`
    );
    const {
      filtered,
      revenue,
      adr,
      occupancy,
      saturation,
      amenityGap,
      comparables,
    } = deps.analyzeMarketData(listings, propertyType);

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
    try {
      investmentSummary = await deps.generateInvestmentSummary(partialResult);
      console.log(`[analyze] Gemini summary generated`);
    } catch (error: any) {
      console.warn(
        `[analyze] Gemini failed, using fallback summary: ${error.message}`
      );
      investmentSummary = buildFallbackSummary(partialResult);
    }

    return buildAnalyzeMarketResponse({
      ...partialResult,
      investmentSummary,
    });
  };
}

export const handleAnalyzeMarket =
  createAnalyzeMarketHandler(defaultDependencies);

function buildFallbackSummary(
  data: Omit<MarketAnalysis, "investmentSummary">
): string {
  const {
    revenueEstimate: rev,
    competitiveSaturation: sat,
    averageDailyRate: adr,
  } = data;
  return `The ${data.location} short-term rental market shows ${sat.label} conditions with ${data.filteredListings} comparable listings. Estimated annual revenue ranges from $${rev.lowEstimate.toLocaleString()} to $${rev.highEstimate.toLocaleString()} at a median ADR of $${adr.median}/night (${rev.confidenceLevel} confidence).`;
}

function formatTextResponse(data: MarketAnalysis): string {
  return `STR Market Analysis for ${data.location}

${data.investmentSummary}

Key Metrics:
- Revenue Estimate: $${data.revenueEstimate.lowEstimate.toLocaleString()}-$${data.revenueEstimate.highEstimate.toLocaleString()}/year (${data.revenueEstimate.confidenceLevel} confidence)
- Average Daily Rate: $${data.averageDailyRate.median}/night (range: $${data.averageDailyRate.percentile25}-$${data.averageDailyRate.percentile75})
- Occupancy: ${(data.occupancyEstimate.estimatedRate * 100).toFixed(0)}%
- Market Saturation: ${data.competitiveSaturation.label} (${data.competitiveSaturation.score}/100)
- Listings Analyzed: ${data.filteredListings} filtered / ${data.totalListingsAnalyzed} total
- Data: ${data.dataFreshness}${data.cachedAt ? ` (cached ${data.cachedAt})` : ""}

${data.amenityGapAnalysis.recommendedAmenities.length > 0 ? `Top Amenity Recommendations: ${data.amenityGapAnalysis.recommendedAmenities.join(", ")}` : ""}`;
}
