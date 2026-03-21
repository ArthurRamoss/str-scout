import type {
  AirbnbListing,
  RevenueEstimate,
  AverageDailyRate,
  OccupancyEstimate,
  CompetitiveSaturation,
  AmenityGapAnalysis,
  AmenityGapItem,
  TopComparable,
  FlatAmenity,
  BadgeObject,
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
// Extract nights from curious_coder dates field
// e.g. "Mar 21 – 26" => 5, "Mar 25 – 30" => 5
// ==========================================

const MONTH_DAYS: Record<string, number> = {
  jan: 31, feb: 29, mar: 31, apr: 30, may: 31, jun: 30,
  jul: 31, aug: 31, sep: 30, oct: 31, nov: 30, dec: 31,
};

function extractNightsFromDates(dates?: string): number {
  if (!dates) return 0;
  // Format: "Mar 21 – 26" or "Mar 28 – Apr 2"
  const match = dates.match(/([A-Za-z]+)\s+(\d+)\s*[–-]\s*(?:([A-Za-z]+)\s+)?(\d+)/);
  if (!match) return 0;
  const startDay = parseInt(match[2]);
  const endDay = parseInt(match[4]);
  if (match[3]) {
    // Cross-month: "Mar 28 – Apr 2"
    const startMonth = match[1].toLowerCase().slice(0, 3);
    const daysInStartMonth = MONTH_DAYS[startMonth] || 30;
    return (daysInStartMonth - startDay) + endDay;
  }
  // Same month: "Mar 21 – 26"
  return endDay - startDay;
}

// ==========================================
// Extract price from listing
// Supports: curious_coder (primary) + memo23 (fallback)
// ==========================================

function extractPrice(listing: AirbnbListing): number | null {
  // memo23: pricing_base_price is per-night (number)
  if (typeof listing.pricing_base_price === "number" && listing.pricing_base_price > 0) {
    return listing.pricing_base_price;
  }
  // memo23: pricing_discounted_price (if discounted)
  if (typeof listing.pricing_discounted_price === "number" && listing.pricing_discounted_price > 0) {
    return listing.pricing_discounted_price;
  }
  // curious_coder: price is a string like "$918" (total for stay)
  if (typeof listing.price === "string") {
    const match = listing.price.match(/\$?([\d,]+)/);
    if (match) {
      const total = parseFloat(match[1].replace(/,/g, ""));
      if (total > 0) {
        // Calculate per-night from total and dates
        const nights = extractNightsFromDates(listing.dates);
        if (nights > 0) return Math.round(total / nights);
        return total; // fallback: use total as-is
      }
    }
  }
  return null;
}

// ==========================================
// Extract review count
// Supports: curious_coder (primary) + memo23 (fallback)
// ==========================================

function extractReviewCount(listing: AirbnbListing): number {
  // curious_coder: reviewsCount (direct number)
  if (listing.reviewsCount) return listing.reviewsCount;
  // memo23: review_count (snake_case)
  if (listing.review_count) return listing.review_count;
  return 0;
}

// ==========================================
// Extract rating
// Supports: curious_coder (primary) + memo23 (fallback)
// ==========================================

function extractRating(listing: AirbnbListing): number {
  // curious_coder: starRating is a direct number (e.g., 4.7)
  if (typeof listing.starRating === "number" && listing.starRating > 0) {
    return listing.starRating;
  }
  // memo23: review_overall_rating (0-5 scale)
  if (typeof listing.review_overall_rating === "number" && listing.review_overall_rating > 0) {
    return listing.review_overall_rating;
  }
  // memo23: review_guest_satisfaction_overall
  if (typeof listing.review_guest_satisfaction_overall === "number" && listing.review_guest_satisfaction_overall > 0) {
    return listing.review_guest_satisfaction_overall;
  }
  return 0;
}

// ==========================================
// Filter listings by property type
// Supports: curious_coder (primary) + memo23 (fallback)
// ==========================================

function filterByPropertyType(
  listings: AirbnbListing[],
  propertyType: string
): AirbnbListing[] {
  if (propertyType === "any") return listings;

  return listings.filter((l) => {
    // memo23: room_type ("Entire home/apt") or property_type ("Entire rental unit")
    // curious_coder: title ("Entire rental unit in Austin, Texas")
    const rt = (l.room_type || l.property_type || l.roomType || l.type || l.title || "").toLowerCase();
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
  const guestFavorites = listings.filter((l) => {
    // curious_coder: hostDetails.isSuperhost (lowercase h)
    if (l.hostDetails?.isSuperhost) return true;
    // memo23: host_is_superhost (snake_case)
    if (l.host_is_superhost) return true;
    // memo23: sbui_is_guest_favorite (direct boolean)
    if (l.sbui_is_guest_favorite) return true;
    // badges: string[] or BadgeObject[] (curious_coder uses objects)
    if (l.badges && l.badges.some((b) => {
      const label = typeof b === "string" ? b : (b as BadgeObject).label;
      return label?.toLowerCase().includes("favorite");
    })) return true;
    return false;
  });
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
  // Only analyze listings with amenity data
  const withAmenities = listings.filter(
    (l) => (l.amenities && Array.isArray(l.amenities) && l.amenities.length > 0) ||
           (l.amenities_structured && Array.isArray(l.amenities_structured) && l.amenities_structured.length > 0)
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
      let amenityTitles: string[] = [];

      if (listing.amenities && Array.isArray(listing.amenities) && listing.amenities.length > 0) {
        const first = listing.amenities[0];
        if (typeof first === "string") {
          // memo23: simple string array ["Wifi", "Kitchen", "Pool"]
          amenityTitles = listing.amenities as string[];
        } else if (typeof first === "object" && first !== null && "groupName" in first) {
          // curious_coder: flat format [{groupName, title, available}]
          amenityTitles = (listing.amenities as FlatAmenity[])
            .filter((a) => a.available === true)
            .map((a) => a.title);
        }
      } else if (listing.amenities_structured && listing.amenities_structured.length > 0) {
        // memo23: structured format [{category, items: [{title, available}]}]
        amenityTitles = listing.amenities_structured
          .flatMap((cat) => cat.items)
          .filter((item) => item.available === true)
          .map((item) => item.title);
      }

      for (const amenity of amenityTitles) {
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
    name: s.listing.title || s.listing.property_name || s.listing.name || "Unnamed Listing",
    url: s.listing.listing_url || s.listing.propertyUrl || s.listing.url || `https://www.airbnb.com/rooms/${s.listing.id || ""}`,
    pricePerNight: s.price!,
    rating: Math.round(extractRating(s.listing) * 100) / 100,
    reviewCount: extractReviewCount(s.listing),
    roomType: s.listing.room_type || s.listing.property_type || s.listing.roomType || s.listing.type || "unknown",
    isGuestFavorite:
      s.listing.hostDetails?.isSuperhost ||
      s.listing.host_is_superhost ||
      s.listing.sbui_is_guest_favorite ||
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
