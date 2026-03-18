import { GoogleGenerativeAI } from "@google/generative-ai";
import type { MarketAnalysis } from "../types/index.js";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not configured");
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

export async function generateInvestmentSummary(
  analysis: Omit<MarketAnalysis, "investmentSummary">
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `You are a short-term rental investment analyst. Given the following market data, write a concise 2-3 sentence investment summary with a clear recommendation (bullish, cautious, or bearish).

Market: ${analysis.location}
Listings analyzed: ${analysis.filteredListings} (of ${analysis.totalListingsAnalyzed} total)
Revenue estimate: $${analysis.revenueEstimate.lowEstimate.toLocaleString()}-$${analysis.revenueEstimate.highEstimate.toLocaleString()}/year (${analysis.revenueEstimate.confidenceLevel} confidence)
ADR: $${analysis.averageDailyRate.median}/night (range: $${analysis.averageDailyRate.percentile25}-$${analysis.averageDailyRate.percentile75})
Occupancy: ${(analysis.occupancyEstimate.estimatedRate * 100).toFixed(0)}%
Saturation: ${analysis.competitiveSaturation.label} (${analysis.competitiveSaturation.score}/100)
Guest Favorites: ${analysis.competitiveSaturation.guestFavoritePercent}%
Top recommended amenities: ${analysis.amenityGapAnalysis.recommendedAmenities.join(", ") || "N/A"}

Write the summary as if briefing a real estate investor. Be specific with numbers. No bullet points.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  return text;
}
