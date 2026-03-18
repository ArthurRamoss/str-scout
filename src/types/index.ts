// ==========================================
// Raw Airbnb Listing — supports both curious_coder (primary)
// and tri_angle/memo23 (fallback) data formats
// ==========================================

// tri_angle amenity format: categories with nested values
export interface AmenityCategory {
  title: string;
  values: AmenityValue[];
}

export interface AmenityValue {
  title: string;
  subtitle?: string;
  icon?: string;
  available: boolean | "";
}

// curious_coder amenity format: flat list with groupName
export interface FlatAmenity {
  groupName: string;
  title: string;
  available: boolean;
  subTitle?: string;
}

// tri_angle rating object
export interface ListingRating {
  accuracy?: number;
  checking?: number;
  cleanliness?: number;
  communication?: number;
  location?: number;
  value?: number;
  guestSatisfaction?: number;
  reviewsCount: number;
}

// curious_coder rating item
export interface RatingItem {
  category: string;
  score: string | number;
}

// tri_angle host
export interface ListingHost {
  id?: string;
  name?: string;
  isSuperHost?: boolean;
  highlights?: string[];
}

// curious_coder host
export interface HostDetails {
  id?: string;
  name?: string;
  isSuperhost?: boolean;
  timeAsHost?: { years: number; months: number };
  ratingCount?: number;
  ratingAverage?: number;
  profileUrl?: string;
}

// tri_angle price object
export interface ListingPrice {
  label?: string;
  amount?: string;
  qualifier?: string;
  breakDown?: {
    basePrice?: { description: string; price: string };
    serviceFee?: { description: string; price: string };
    totalBeforeTaxes?: { description: string; price: string };
  };
}

// Badge can be string (tri_angle) or object (curious_coder)
export interface BadgeObject {
  type: string;
  label: string;
}

export interface AirbnbListing {
  id?: string;
  title?: string;

  // === tri_angle / generic fields ===
  url?: string;
  name?: string;
  roomType?: string;
  type?: string;
  coordinates?: { latitude: number; longitude: number };
  personCapacity?: number;
  isSuperHost?: boolean;
  rating?: ListingRating;
  subDescription?: { title?: string; items?: string[] };
  host?: ListingHost;
  pricing?: any;
  highlights?: Array<{ title: string; subtitle?: string }>;
  images?: any[];

  // === curious_coder-specific fields ===
  propertyUrl?: string;
  subtitle?: string;
  starRating?: number;
  reviewsCount?: number;
  dates?: string;
  bedInfo?: string;
  originalPrice?: string;
  location?: { latitude: number; longitude: number; address?: string; description?: string };
  hostDetails?: HostDetails;
  ratings?: RatingItem[];
  costPerNight?: number | null;
  available?: boolean;
  canInstantBook?: boolean;
  maxGuestCapacity?: number;
  petsAllowed?: boolean;
  description?: string;
  houseRules?: Array<{ title: string }>;

  // === Union fields (differ per scraper) ===
  price?: ListingPrice | string;
  amenities?: AmenityCategory[] | FlatAmenity[];
  badges?: string[] | BadgeObject[];
}

// ==========================================
// Scrape Options
// ==========================================

export interface ScrapeOptions {
  location: string;
  checkIn?: string;
  checkOut?: string;
  minBedrooms?: number;
  minBathrooms?: number;
  propertyType?: "entire_home" | "private_room" | "any";
}

// ==========================================
// Cache
// ==========================================

export interface CachedMarketData {
  location: string;
  listings: AirbnbListing[];
  scrapedAt: string;
  expiresAt: string;
}

export type DataFreshness = "live" | "cached_48h" | "cached_7d" | "market_estimates_only";

// ==========================================
// Analysis Output (matches outputSchema exactly)
// ==========================================

export interface RevenueEstimate {
  lowEstimate: number;
  midEstimate: number;
  highEstimate: number;
  confidenceLevel: "high" | "medium" | "low";
  methodology: string;
}

export interface AverageDailyRate {
  median: number;
  percentile25: number;
  percentile75: number;
}

export interface OccupancyEstimate {
  estimatedRate: number;
  confidenceLevel: "high" | "medium" | "low";
  basedOn: string;
}

export interface CompetitiveSaturation {
  score: number;
  label: "undersupplied" | "balanced" | "competitive" | "oversaturated";
  totalListings: number;
  averageRating: number;
  guestFavoritePercent: number;
}

export interface AmenityGapItem {
  amenity: string;
  prevalenceTopPerformers: number;
  prevalenceAll: number;
}

export interface AmenityGapAnalysis {
  topPerformerAmenities: AmenityGapItem[];
  recommendedAmenities: string[];
}

export interface TopComparable {
  name: string;
  url: string;
  pricePerNight: number;
  rating: number;
  reviewCount: number;
  roomType: string;
  isGuestFavorite?: boolean;
}

export interface MarketAnalysis {
  location: string;
  dataFreshness: DataFreshness;
  cachedAt: string | null;
  totalListingsAnalyzed: number;
  filteredListings: number;
  revenueEstimate: RevenueEstimate;
  averageDailyRate: AverageDailyRate;
  occupancyEstimate: OccupancyEstimate;
  competitiveSaturation: CompetitiveSaturation;
  amenityGapAnalysis: AmenityGapAnalysis;
  topComparables: TopComparable[];
  investmentSummary: string;
}
