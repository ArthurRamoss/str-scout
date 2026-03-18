import type { MarketAnalysis, DataFreshness } from "../types/index.js";
import { scrapeAirbnbListings } from "../services/apify.js";
import { getCachedListings, saveToCache } from "../services/cache.js";
import { analyzeMarketData } from "../services/analysis.js";
import { generateInvestmentSummary } from "../services/gemini.js";

interface AnalyzeMarketArgs {
  location: string;
  propertyType?: string;
  bedrooms?: number;
  checkIn?: string;
  checkOut?: string;
}

export async function handleAnalyzeMarket(
  args: Record<string, unknown> | undefined
): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent: MarketAnalysis;
}> {
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
  let listings;
  let dataFreshness: DataFreshness = "live";
  let cachedAt: string | null = null;

  const cached = await getCachedListings(location);

  if (cached) {
    console.log(`[analyze] Cache hit (${cached.dataFreshness}) — ${cached.listings.length} listings`);
    listings = cached.listings;
    dataFreshness = cached.dataFreshness;
    cachedAt = cached.cachedAt;
  } else {
    // 2. Scrape fresh data
    console.log(`[analyze] Cache miss — scraping via Apify`);
    try {
      listings = await scrapeAirbnbListings({
        location,
        minBedrooms: bedrooms ?? undefined,
        checkIn: checkIn ?? undefined,
        checkOut: checkOut ?? undefined,
        propertyType: propertyType as any,
      });

      // Save to cache
      await saveToCache(location, listings);
      console.log(`[analyze] Saved ${listings.length} listings to cache`);
    } catch (error: any) {
      console.error(`[analyze] Apify scrape failed: ${error.message}`);
      throw new Error(
        `Unable to fetch market data for "${location}". The scraper may be temporarily unavailable. Please try again in a few minutes.`
      );
    }
  }

  if (listings.length === 0) {
    throw new Error(
      `No Airbnb listings found for "${location}". Try a different location or broader search criteria.`
    );
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

  // 7. Return in MCP format
  const textSummary = formatTextResponse(result);

  return {
    content: [{ type: "text", text: textSummary }],
    structuredContent: result,
  };
}

function buildFallbackSummary(data: Omit<MarketAnalysis, "investmentSummary">): string {
  const { revenueEstimate: rev, competitiveSaturation: sat, averageDailyRate: adr } = data;
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
