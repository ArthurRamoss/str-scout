import type {
  AirbnbListing,
  RevenueEstimate,
  AverageDailyRate,
  OccupancyEstimate,
  CompetitiveSaturation,
  AmenityGapAnalysis,
  AmenityGapItem,
  TopComparable,
} from "../types/index.js";

// ==========================================
// Utility functions
// ==========================================

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function median(arr: number[]): number {
  return percentile(arr, 50);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ==========================================
// Extract price from listing
// ==========================================

function extractPrice(listing: AirbnbListing): number | null {
  // tri_angle/airbnb-scraper detailed format
  if (listing.price?.amount) {
    const num = parseFloat(listing.price.amount.replace(/[^0-9.]/g, ""));
    if (!isNaN(num) && num > 0) return num;
  }
  if (listing.price?.label) {
    const match = listing.price.label.match(/\$?([\d,]+)/);
    if (match) {
      const num = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(num) && num > 0) return num;
    }
  }
  // Other scraper formats
  if (typeof listing.pricing === "number" && listing.pricing > 0) {
    return listing.pricing;
  }
  if (listing.pricing?.rate?.amount) {
    return listing.pricing.rate.amount;
  }
  return null;
}

// ==========================================
// Extract review count
// ==========================================

function extractReviewCount(listing: AirbnbListing): number {
  if (listing.rating?.reviewsCount) return listing.rating.reviewsCount;
  if (listing.reviewsCount) return listing.reviewsCount;
  return 0;
}

// ==========================================
// Extract rating
// ==========================================

function extractRating(listing: AirbnbListing): number {
  if (listing.rating?.guestSatisfaction) return listing.rating.guestSatisfaction;
  if (listing.rating && typeof (listing.rating as any).overall === "number") {
    return (listing.rating as any).overall;
  }
  // Average of detailed ratings
  const r = listing.rating;
  if (r) {
    const values = [r.accuracy, r.cleanliness, r.communication, r.location, r.value].filter(
      (v): v is number => typeof v === "number"
    );
    if (values.length > 0) return mean(values);
  }
  return 0;
}

// ==========================================
// Filter listings by property type
// ==========================================

function filterByPropertyType(
  listings: AirbnbListing[],
  propertyType: string
): AirbnbListing[] {
  if (propertyType === "any") return listings;

  return listings.filter((l) => {
    const rt = (l.roomType || l.type || "").toLowerCase();
    if (propertyType === "entire_home") {
      return rt.includes("entire") || rt.includes("home") || rt.includes("apt");
    }
    if (propertyType === "private_room") {
      return rt.includes("private");
    }
    return true;
  });
}

// ==========================================
// Revenue Estimation (Review Velocity Model)
// ==========================================

const REVIEW_RATE = 0.6; // 60% of guests leave reviews
const DEFAULT_AVG_STAY = 3.5; // nights
const ASSUMED_LISTING_AGE_MONTHS = 24; // conservative default if unknown

export function estimateRevenue(
  listings: AirbnbListing[]
): { revenue: RevenueEstimate; occupancy: OccupancyEstimate } {
  const prices = listings
    .map(extractPrice)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);

  const reviewCounts = listings
    .map(extractReviewCount)
    .filter((r) => r > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0 || reviewCounts.length === 0) {
    return {
      revenue: {
        lowEstimate: 0,
        midEstimate: 0,
        highEstimate: 0,
        confidenceLevel: "low",
        methodology: "Insufficient data to estimate revenue.",
      },
      occupancy: {
        estimatedRate: 0,
        confidenceLevel: "low",
        basedOn: "Insufficient review data.",
      },
    };
  }

  // ADR percentiles
  const adrP25 = percentile(prices, 25);
  const adrP50 = percentile(prices, 50);
  const adrP75 = percentile(prices, 75);

  // Occupancy via review velocity
  // reviews/month → bookings/month → nights/month → occupancy
  const reviewsPerMonth = reviewCounts.map(
    (rc) => rc / ASSUMED_LISTING_AGE_MONTHS
  );
  const bookingsPerMonth = reviewsPerMonth.map((rpm) => rpm / REVIEW_RATE);
  const nightsPerMonth = bookingsPerMonth.map(
    (bpm) => Math.min(bpm * DEFAULT_AVG_STAY, 30)
  );
  const occupancyRates = nightsPerMonth.map((n) => Math.min(n / 30, 1.0));

  const occP25 = percentile(occupancyRates.sort((a, b) => a - b), 25);
  const occP50 = percentile(occupancyRates, 50);
  const occP75 = percentile(occupancyRates, 75);

  // Annual revenue = ADR × occupancy × 365
  const lowEstimate = Math.round(adrP25 * occP25 * 365);
  const midEstimate = Math.round(adrP50 * occP50 * 365);
  const highEstimate = Math.round(adrP75 * occP75 * 365);

  // Confidence based on sample size
  let confidenceLevel: "high" | "medium" | "low";
  if (listings.length >= 50) confidenceLevel = "high";
  else if (listings.length >= 20) confidenceLevel = "medium";
  else confidenceLevel = "low";

  const methodology = `Review velocity model: median ${median(reviewsPerMonth).toFixed(1)} reviews/month across ${listings.length} listings, estimated ${(REVIEW_RATE * 100).toFixed(0)}% review rate, ${DEFAULT_AVG_STAY} avg night stay. Revenue = ADR × estimated occupancy × 365.`;

  return {
    revenue: {
      lowEstimate,
      midEstimate,
      highEstimate,
      confidenceLevel,
      methodology,
    },
    occupancy: {
      estimatedRate: Math.round(occP50 * 100) / 100,
      confidenceLevel,
      basedOn: `Review velocity model across ${reviewCounts.length} listings with review data. Median ${median(reviewsPerMonth).toFixed(1)} reviews/month → ${(occP50 * 100).toFixed(0)}% estimated occupancy.`,
    },
  };
}

// ==========================================
// Average Daily Rate
// ==========================================

export function calculateADR(listings: AirbnbListing[]): AverageDailyRate {
  const prices = listings
    .map(extractPrice)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return { median: 0, percentile25: 0, percentile75: 0 };
  }

  return {
    median: Math.round(percentile(prices, 50)),
    percentile25: Math.round(percentile(prices, 25)),
    percentile75: Math.round(percentile(prices, 75)),
  };
}

// ==========================================
// Competitive Saturation Score (0-100)
// ==========================================

export function calculateSaturation(
  listings: AirbnbListing[]
): CompetitiveSaturation {
  const total = listings.length;
  if (total === 0) {
    return {
      score: 0,
      label: "undersupplied",
      totalListings: 0,
      averageRating: 0,
      guestFavoritePercent: 0,
    };
  }

  const ratings = listings.map(extractRating).filter((r) => r > 0);
  const avgRating = ratings.length > 0 ? mean(ratings) : 0;

  // % of listings with rating >= 4.8 (mature market indicator)
  const highRatedPercent =
    (ratings.filter((r) => r >= 4.8).length / Math.max(ratings.length, 1)) * 100;

  // Guest Favorites (superhost or badge)
  const guestFavorites = listings.filter(
    (l) =>
      l.isSuperHost ||
      l.host?.isSuperHost ||
      (l.badges && l.badges.some((b) => b.toLowerCase().includes("favorite")))
  );
  const guestFavoritePercent = (guestFavorites.length / total) * 100;

  // Price spread (tighter = more competitive)
  const prices = listings
    .map(extractPrice)
    .filter((p): p is number => p !== null);
  let priceSpreadScore = 50; // neutral default
  if (prices.length >= 5) {
    const sorted = [...prices].sort((a, b) => a - b);
    const iqr = percentile(sorted, 75) - percentile(sorted, 25);
    const med = percentile(sorted, 50);
    const cv = med > 0 ? iqr / med : 0; // coefficient of variation
    // Lower spread = more competitive
    priceSpreadScore = cv < 0.3 ? 75 : cv < 0.5 ? 50 : 25;
  }

  // Density factor (more listings = more saturated)
  let densityScore: number;
  if (total >= 200) densityScore = 80;
  else if (total >= 100) densityScore = 60;
  else if (total >= 50) densityScore = 40;
  else if (total >= 20) densityScore = 25;
  else densityScore = 10;

  // Weighted score
  const score = Math.round(
    densityScore * 0.3 +
      highRatedPercent * 0.3 +
      guestFavoritePercent * 0.2 +
      priceSpreadScore * 0.2
  );

  const clampedScore = Math.min(100, Math.max(0, score));

  let label: CompetitiveSaturation["label"];
  if (clampedScore <= 25) label = "undersupplied";
  else if (clampedScore <= 50) label = "balanced";
  else if (clampedScore <= 75) label = "competitive";
  else label = "oversaturated";

  return {
    score: clampedScore,
    label,
    totalListings: total,
    averageRating: Math.round(avgRating * 100) / 100,
    guestFavoritePercent: Math.round(guestFavoritePercent * 10) / 10,
  };
}

// ==========================================
// Amenity Gap Analysis
// ==========================================

const HIGH_VALUE_AMENITIES = [
  "Pool",
  "Hot tub",
  "Air conditioning",
  "Wifi",
  "Kitchen",
  "Washer",
  "Dryer",
  "Free parking on premises",
  "Paid parking on premises",
  "EV charger",
  "Self check-in",
  "Gym",
  "TV",
  "Fireplace",
  "Pets allowed",
  "Hot water",
  "Coffee maker",
  "Patio or balcony",
  "BBQ grill",
  "Outdoor dining area",
  "Fire pit",
];

export function analyzeAmenities(listings: AirbnbListing[]): AmenityGapAnalysis {
  // Only analyze listings with structured amenity data
  const withAmenities = listings.filter(
    (l) => l.amenities && Array.isArray(l.amenities) && l.amenities.length > 0
  );

  if (withAmenities.length < 5) {
    return {
      topPerformerAmenities: [],
      recommendedAmenities: [],
    };
  }

  // Split: top performers vs all
  const reviewCounts = withAmenities
    .map(extractReviewCount)
    .filter((r) => r > 0);
  const medianReviews = reviewCounts.length > 0 ? median(reviewCounts) : 0;

  const topPerformers = withAmenities.filter(
    (l) => extractRating(l) >= 4.8 && extractReviewCount(l) > medianReviews
  );

  // If not enough top performers, use top 25% by rating
  const actualTopPerformers =
    topPerformers.length >= 5
      ? topPerformers
      : [...withAmenities]
          .sort((a, b) => extractRating(b) - extractRating(a))
          .slice(0, Math.max(5, Math.floor(withAmenities.length * 0.25)));

  // Count amenities in each group
  function countAmenities(group: AirbnbListing[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const listing of group) {
      if (!listing.amenities) continue;
      const allAmenities = listing.amenities
        .flatMap((cat) => cat.values)
        .filter((v) => v.available === true)
        .map((v) => v.title);

      for (const amenity of allAmenities) {
        counts.set(amenity, (counts.get(amenity) || 0) + 1);
      }
    }
    return counts;
  }

  const topCounts = countAmenities(actualTopPerformers);
  const allCounts = countAmenities(withAmenities);

  // Calculate gap for high-value amenities
  const gaps: (AmenityGapItem & { gap: number })[] = HIGH_VALUE_AMENITIES.map(
    (amenity) => {
      const topPrev =
        (topCounts.get(amenity) || 0) / actualTopPerformers.length;
      const allPrev = (allCounts.get(amenity) || 0) / withAmenities.length;
      return {
        amenity,
        prevalenceTopPerformers: Math.round(topPrev * 100),
        prevalenceAll: Math.round(allPrev * 100),
        gap: Math.round((topPrev - allPrev) * 100),
      };
    }
  ).sort((a, b) => b.gap - a.gap);

  return {
    topPerformerAmenities: gaps.slice(0, 10).map(({ gap: _gap, ...rest }) => rest),
    recommendedAmenities: gaps
      .filter((g) => g.gap > 10)
      .slice(0, 5)
      .map((g) => g.amenity),
  };
}

// ==========================================
// Top Comparables
// ==========================================

export function getTopComparables(
  listings: AirbnbListing[],
  limit = 5
): TopComparable[] {
  // Score listings by rating × reviewCount (most popular + highest rated)
  const scored = listings
    .map((l) => ({
      listing: l,
      score: extractRating(l) * Math.log2(extractReviewCount(l) + 1),
      price: extractPrice(l),
    }))
    .filter((s) => s.price !== null && s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => ({
    name: s.listing.title || s.listing.name || "Unnamed Listing",
    url: s.listing.url || `https://www.airbnb.com/rooms/${s.listing.id || ""}`,
    pricePerNight: s.price!,
    rating: Math.round(extractRating(s.listing) * 100) / 100,
    reviewCount: extractReviewCount(s.listing),
    roomType: s.listing.roomType || s.listing.type || "unknown",
    isGuestFavorite:
      s.listing.isSuperHost ||
      s.listing.host?.isSuperHost ||
      false,
  }));
}

// ==========================================
// Full Analysis Pipeline
// ==========================================

export function analyzeMarketData(
  listings: AirbnbListing[],
  propertyType = "entire_home"
): {
  filtered: AirbnbListing[];
  revenue: RevenueEstimate;
  adr: AverageDailyRate;
  occupancy: OccupancyEstimate;
  saturation: CompetitiveSaturation;
  amenityGap: AmenityGapAnalysis;
  comparables: TopComparable[];
} {
  const filtered = filterByPropertyType(listings, propertyType);

  const { revenue, occupancy } = estimateRevenue(filtered);
  const adr = calculateADR(filtered);
  const saturation = calculateSaturation(filtered);
  const amenityGap = analyzeAmenities(filtered);
  const comparables = getTopComparables(filtered);

  return { filtered, revenue, adr, occupancy, saturation, amenityGap, comparables };
}
