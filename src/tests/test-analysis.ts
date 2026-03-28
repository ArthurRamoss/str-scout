import { analyzeMarketData } from "../services/analysis.js";
import type { AirbnbListing } from "../types/index.js";

// Mock listings using memo23 format (fallback scraper)
const mockListings: AirbnbListing[] = [
  {
    id: "1001",
    listing_url: "https://www.airbnb.com/rooms/1001",
    title: "Modern Downtown Loft",
    property_name: "Modern Downtown Loft",
    room_type: "Entire home/apt",
    property_type: "Entire rental unit",
    review_overall_rating: 4.88,
    review_count: 245,
    host_is_superhost: true,
    host_name: "Sarah",
    sbui_is_guest_favorite: true,
    pricing_base_price: 189,
    pricing_currency: "USD",
    accommodation_guests: 4,
    accommodation_bedrooms: 2,
    amenities: ["Kitchen", "Refrigerator", "Wifi", "Pool", "Hot tub", "BBQ grill", "Washer", "Dryer", "Air conditioning"],
  },
  {
    id: "1002",
    listing_url: "https://www.airbnb.com/rooms/1002",
    title: "Cozy East Side Bungalow",
    property_name: "Cozy East Side Bungalow",
    room_type: "Entire home/apt",
    property_type: "Entire rental unit",
    review_overall_rating: 4.6,
    review_count: 87,
    host_is_superhost: false,
    host_name: "Mike",
    pricing_base_price: 129,
    pricing_currency: "USD",
    accommodation_guests: 3,
    accommodation_bedrooms: 1,
    amenities: ["Kitchen", "Wifi", "Washer"],
  },
  {
    id: "1003",
    listing_url: "https://www.airbnb.com/rooms/1003",
    title: "Luxury Lakefront Villa",
    property_name: "Luxury Lakefront Villa",
    room_type: "Entire home/apt",
    property_type: "Entire home",
    review_overall_rating: 4.93,
    review_count: 412,
    host_is_superhost: true,
    host_name: "The Austin Collection",
    sbui_is_guest_favorite: true,
    pricing_base_price: 349,
    pricing_currency: "USD",
    accommodation_guests: 8,
    accommodation_bedrooms: 4,
    amenities: ["Kitchen", "Coffee maker", "Wifi", "Pool", "Hot tub", "Fire pit", "Patio or balcony", "BBQ grill", "Washer", "Dryer", "Air conditioning", "Free parking on premises"],
  },
  {
    id: "1004",
    listing_url: "https://www.airbnb.com/rooms/1004",
    title: "Hip SoCo Studio",
    room_type: "Entire home/apt",
    review_overall_rating: 4.72,
    review_count: 156,
    pricing_base_price: 159,
    pricing_currency: "USD",
    accommodation_guests: 2,
    accommodation_bedrooms: 0,
    amenities: ["Kitchen", "Wifi", "Air conditioning", "Free parking on premises"],
  },
  {
    id: "1005",
    listing_url: "https://www.airbnb.com/rooms/1005",
    title: "Private Room in Central Austin",
    room_type: "Private room",
    review_overall_rating: 4.6,
    review_count: 52,
    pricing_base_price: 65,
    pricing_currency: "USD",
    accommodation_guests: 1,
    amenities: ["Wifi", "Air conditioning"],
  },
  // Additional listings for meaningful sample size
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `200${i}`,
    listing_url: `https://www.airbnb.com/rooms/200${i}`,
    title: `Austin Listing ${i + 6}`,
    room_type: "Entire home/apt" as const,
    review_overall_rating: 4.2 + Math.random() * 0.7,
    review_count: 20 + Math.floor(Math.random() * 300),
    pricing_base_price: 100 + Math.floor(Math.random() * 200),
    pricing_currency: "USD",
    accommodation_guests: 2 + Math.floor(Math.random() * 6),
    amenities: [
      "Wifi",
      ...(Math.random() > 0.3 ? ["Kitchen"] : []),
      ...(Math.random() > 0.6 ? ["Pool"] : []),
      ...(Math.random() > 0.7 ? ["Hot tub"] : []),
      "Air conditioning",
    ],
  })),
];

// ==========================================
// Test runner
// ==========================================

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

async function main() {
  console.log("STR Scout — Analysis Engine Tests (memo23 format)");
  console.log(`Mock listings: ${mockListings.length}\n`);

  // Test 1: Full analysis with entire_home filter
  console.log("Test 1: Property type filter (entire_home)");
  const result = analyzeMarketData(mockListings, "entire_home");
  assert(result.filtered.length > 0, `Filtered listings > 0 (got ${result.filtered.length})`);
  assert(result.filtered.length < mockListings.length, `Filtered < total (excluded private rooms)`);

  // Test 2: Revenue estimation
  console.log("\nTest 2: Revenue estimation");
  assert(result.revenue.lowEstimate > 0, `Low estimate > 0 ($${result.revenue.lowEstimate.toLocaleString()})`);
  assert(result.revenue.midEstimate > result.revenue.lowEstimate, `Mid ($${result.revenue.midEstimate.toLocaleString()}) > Low`);
  assert(result.revenue.highEstimate > result.revenue.midEstimate, `High ($${result.revenue.highEstimate.toLocaleString()}) > Mid`);
  assert(["high", "medium", "low"].includes(result.revenue.confidenceLevel), `Confidence level valid: ${result.revenue.confidenceLevel}`);
  assert(result.revenue.confidenceLevel === "medium", `Confidence aligns with sampled depth (expected medium, got ${result.revenue.confidenceLevel})`);
  assert(result.revenue.methodology.length > 20, `Methodology present (${result.revenue.methodology.length} chars)`);

  // Test 3: ADR
  console.log("\nTest 3: Average Daily Rate");
  assert(result.adr.median > 0, `Median ADR > 0 ($${result.adr.median})`);
  assert(result.adr.percentile25 <= result.adr.median, `P25 ($${result.adr.percentile25}) <= median ($${result.adr.median})`);
  assert(result.adr.percentile75 >= result.adr.median, `P75 ($${result.adr.percentile75}) >= median ($${result.adr.median})`);

  // Test 4: Occupancy
  console.log("\nTest 4: Occupancy estimate");
  assert(result.occupancy.estimatedRate > 0, `Occupancy > 0 (${(result.occupancy.estimatedRate * 100).toFixed(0)}%)`);
  assert(result.occupancy.estimatedRate <= 1.0, `Occupancy <= 100%`);
  assert(result.occupancy.basedOn.length > 10, `basedOn explanation present`);

  // Test 5: Saturation
  console.log("\nTest 5: Competitive saturation");
  assert(result.saturation.score >= 0 && result.saturation.score <= 100, `Score in range (${result.saturation.score})`);
  assert(["undersupplied", "balanced", "competitive", "oversaturated"].includes(result.saturation.label), `Label valid: ${result.saturation.label}`);
  assert(result.saturation.totalListings > 0, `totalListings > 0 (${result.saturation.totalListings})`);
  assert(result.saturation.averageRating > 0, `averageRating > 0 (${result.saturation.averageRating})`);

  // Test 6: Amenity gap (memo23 uses string arrays)
  console.log("\nTest 6: Amenity gap analysis");
  assert(result.amenityGap.topPerformerAmenities.length > 0, `Has amenity data (${result.amenityGap.topPerformerAmenities.length} items)`);
  for (const item of result.amenityGap.topPerformerAmenities.slice(0, 3)) {
    assert(item.prevalenceTopPerformers >= 0 && item.prevalenceTopPerformers <= 100, `${item.amenity}: top ${item.prevalenceTopPerformers}%, all ${item.prevalenceAll}%`);
  }

  // Test 7: Comparables
  console.log("\nTest 7: Top comparables");
  assert(result.comparables.length > 0, `Has comparables (${result.comparables.length})`);
  assert(result.comparables.length <= 5, `Max 5 comparables`);
  for (const comp of result.comparables) {
    assert(!!comp.name, `Has name: "${comp.name}"`);
    assert(comp.pricePerNight > 0, `Has price: $${comp.pricePerNight}`);
    assert(!!comp.url, `Has URL`);
    assert(!!comp.roomType, `Has roomType: ${comp.roomType}`);
  }

  // Test 8: Private room filter
  console.log("\nTest 8: Private room filter");
  const privateResult = analyzeMarketData(mockListings, "private_room");
  assert(privateResult.filtered.length < result.filtered.length, `Private rooms (${privateResult.filtered.length}) < entire homes (${result.filtered.length})`);

  // Test 9: "any" filter
  console.log("\nTest 9: Any property type");
  const anyResult = analyzeMarketData(mockListings, "any");
  assert(anyResult.filtered.length === mockListings.length, `All listings included (${anyResult.filtered.length})`);

  // Test 10: Empty input
  console.log("\nTest 10: Empty input handling");
  const emptyResult = analyzeMarketData([], "any");
  assert(emptyResult.revenue.lowEstimate === 0, `Empty returns 0 revenue`);
  assert(emptyResult.saturation.score === 0, `Empty returns 0 saturation`);

  // Test 11: Guest favorites via memo23 fields
  console.log("\nTest 11: Guest favorites detection (memo23)");
  assert(result.saturation.guestFavoritePercent > 0, `Guest favorites detected (${result.saturation.guestFavoritePercent}%)`);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("");
  console.log("Market Summary:");
  console.log(`  Revenue: $${result.revenue.lowEstimate.toLocaleString()} - $${result.revenue.highEstimate.toLocaleString()}/year`);
  console.log(`  ADR: $${result.adr.percentile25} - $${result.adr.percentile75}/night (median $${result.adr.median})`);
  console.log(`  Occupancy: ${(result.occupancy.estimatedRate * 100).toFixed(0)}%`);
  console.log(`  Saturation: ${result.saturation.label} (${result.saturation.score}/100)`);
  console.log(`  Recommended amenities: ${result.amenityGap.recommendedAmenities.join(", ") || "none"}`);
  console.log("=".repeat(50));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(console.error);
