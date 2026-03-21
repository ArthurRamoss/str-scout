// ==========================================
// Raw Airbnb Listing — supports curious_coder (primary)
// and memo23 (fallback) data formats
// ==========================================

// curious_coder amenity format: flat list with groupName
export interface FlatAmenity {
  groupName: string;
  title: string;
  available: boolean;
  subTitle?: string;
}

// memo23 structured amenity format
export interface Memo23AmenityItem {
  title: string;
  subtitle?: string;
  icon?: string;
  available: boolean;
}

export interface Memo23AmenityCategory {
  category: string;
  items: Memo23AmenityItem[];
}

// curious_coder rating item
export interface RatingItem {
  category: string;
  score: string | number;
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

// Badge object (curious_coder)
export interface BadgeObject {
  type: string;
  label: string;
}

export interface AirbnbListing {
  id?: string;
  title?: string;

  // === Generic fields ===
  url?: string;
  name?: string;
  roomType?: string;
  type?: string;
  pricing?: any;

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

  // === memo23-specific fields (snake_case) ===
  property_type?: string;
  room_type?: string;
  listing_url?: string;
  property_name?: string;
  review_count?: number;
  review_overall_rating?: number;
  review_guest_satisfaction_overall?: number;
  host_is_superhost?: boolean;
  host_name?: string;
  pricing_base_price?: number;
  pricing_discounted_price?: number;
  pricing_total_price?: number;
  pricing_currency?: string;
  accommodation_guests?: number;
  accommodation_bedrooms?: number;
  sbui_is_guest_favorite?: boolean;
  // memo23 amenities: simple string[] OR structured Memo23AmenityCategory[]
  amenities_structured?: Memo23AmenityCategory[];

  // === Union fields (differ per scraper) ===
  price?: string; // curious_coder: "$918" total string
  amenities?: FlatAmenity[] | string[]; // curious_coder: FlatAmenity[], memo23: string[]
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
