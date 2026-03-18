import { analyzeMarketData } from "../services/analysis.js";
import type { AirbnbListing } from "../types/index.js";

// Mock listings based on tri_angle/airbnb-scraper detailed format
const mockListings: AirbnbListing[] = [
  {
    id: "1001",
    url: "https://www.airbnb.com/rooms/1001",
    title: "Modern Downtown Loft",
    roomType: "Entire home/apt",
    coordinates: { latitude: 30.267, longitude: -97.743 },
    personCapacity: 4,
    isSuperHost: true,
    rating: {
      accuracy: 4.9,
      checking: 4.95,
      cleanliness: 4.85,
      communication: 4.9,
      location: 4.95,
      value: 4.7,
      guestSatisfaction: 4.88,
      reviewsCount: 245,
    },
    subDescription: { title: "Entire rental unit", items: ["4 guests", "2 bedrooms", "2 beds", "1 bath"] },
    amenities: [
      { title: "Kitchen and dining", values: [{ title: "Kitchen", available: true }, { title: "Refrigerator", available: true }] },
      { title: "Internet and office", values: [{ title: "Wifi", available: true }] },
      { title: "Outdoor", values: [{ title: "Pool", available: true }, { title: "Hot tub", available: true }, { title: "BBQ grill", available: true }] },
      { title: "Bedroom and laundry", values: [{ title: "Washer", available: true }, { title: "Dryer", available: true }] },
      { title: "Heating and cooling", values: [{ title: "Air conditioning", available: true }] },
    ],
    host: { id: "h1", name: "Sarah", isSuperHost: true, highlights: ["5 years hosting"] },
    price: { label: "$189 per night", amount: "$189", qualifier: "night" },
  },
  {
    id: "1002",
    url: "https://www.airbnb.com/rooms/1002",
    title: "Cozy East Side Bungalow",
    roomType: "Entire home/apt",
    coordinates: { latitude: 30.259, longitude: -97.723 },
    personCapacity: 3,
    isSuperHost: false,
    rating: {
      accuracy: 4.6,
      checking: 4.7,
      cleanliness: 4.5,
      communication: 4.7,
      location: 4.8,
      value: 4.3,
      guestSatisfaction: 4.6,
      reviewsCount: 87,
    },
    subDescription: { title: "Entire rental unit", items: ["3 guests", "1 bedroom", "1 bed", "1 bath"] },
    amenities: [
      { title: "Kitchen and dining", values: [{ title: "Kitchen", available: true }] },
      { title: "Internet and office", values: [{ title: "Wifi", available: true }] },
      { title: "Heating and cooling", values: [{ title: "Air conditioning", available: "" as any }] },
      { title: "Bedroom and laundry", values: [{ title: "Washer", available: true }] },
    ],
    host: { id: "h2", name: "Mike", isSuperHost: false },
    price: { label: "$129 per night", amount: "$129", qualifier: "night" },
  },
  {
    id: "1003",
    url: "https://www.airbnb.com/rooms/1003",
    title: "Luxury Lakefront Villa",
    roomType: "Entire home/apt",
    coordinates: { latitude: 30.285, longitude: -97.751 },
    personCapacity: 8,
    isSuperHost: true,
    rating: {
      accuracy: 4.95,
      checking: 4.9,
      cleanliness: 4.95,
      communication: 4.95,
      location: 5.0,
      value: 4.8,
      guestSatisfaction: 4.93,
      reviewsCount: 412,
    },
    subDescription: { title: "Entire home", items: ["8 guests", "4 bedrooms", "5 beds", "3 bath"] },
    amenities: [
      { title: "Kitchen and dining", values: [{ title: "Kitchen", available: true }, { title: "Coffee maker", available: true }] },
      { title: "Internet and office", values: [{ title: "Wifi", available: true }] },
      { title: "Outdoor", values: [{ title: "Pool", available: true }, { title: "Hot tub", available: true }, { title: "Fire pit", available: true }, { title: "Patio or balcony", available: true }, { title: "BBQ grill", available: true }] },
      { title: "Bedroom and laundry", values: [{ title: "Washer", available: true }, { title: "Dryer", available: true }] },
      { title: "Heating and cooling", values: [{ title: "Air conditioning", available: true }] },
      { title: "Parking", values: [{ title: "Free parking on premises", available: true }] },
    ],
    host: { id: "h3", name: "The Austin Collection", isSuperHost: true, highlights: ["8 years hosting"] },
    price: { label: "$349 per night", amount: "$349", qualifier: "night" },
  },
  {
    id: "1004",
    url: "https://www.airbnb.com/rooms/1004",
    title: "Hip SoCo Studio",
    roomType: "Entire home/apt",
    coordinates: { latitude: 30.248, longitude: -97.751 },
    personCapacity: 2,
    rating: {
      accuracy: 4.7,
      checking: 4.8,
      cleanliness: 4.6,
      communication: 4.8,
      location: 4.9,
      value: 4.5,
      guestSatisfaction: 4.72,
      reviewsCount: 156,
    },
    amenities: [
      { title: "Kitchen and dining", values: [{ title: "Kitchen", available: true }] },
      { title: "Internet and office", values: [{ title: "Wifi", available: true }] },
      { title: "Heating and cooling", values: [{ title: "Air conditioning", available: true }] },
      { title: "Parking", values: [{ title: "Free parking on premises", available: true }] },
    ],
    host: { id: "h4", name: "Jesse" },
    price: { label: "$159 per night", amount: "$159", qualifier: "night" },
  },
  {
    id: "1005",
    url: "https://www.airbnb.com/rooms/1005",
    title: "Private Room in Central Austin",
    roomType: "Private room",
    coordinates: { latitude: 30.27, longitude: -97.74 },
    personCapacity: 1,
    rating: {
      accuracy: 4.5,
      checking: 4.6,
      cleanliness: 4.4,
      communication: 4.6,
      location: 4.7,
      value: 4.8,
      guestSatisfaction: 4.6,
      reviewsCount: 52,
    },
    amenities: [
      { title: "Internet and office", values: [{ title: "Wifi", available: true }] },
      { title: "Heating and cooling", values: [{ title: "Air conditioning", available: true }] },
    ],
    host: { id: "h5", name: "Rachel" },
    price: { label: "$65 per night", amount: "$65", qualifier: "night" },
  },
  // Additional listings for meaningful sample size
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `200${i}`,
    url: `https://www.airbnb.com/rooms/200${i}`,
    title: `Austin Listing ${i + 6}`,
    roomType: "Entire home/apt",
    coordinates: { latitude: 30.26 + Math.random() * 0.04, longitude: -97.75 + Math.random() * 0.04 },
    personCapacity: 2 + Math.floor(Math.random() * 6),
    rating: {
      guestSatisfaction: 4.2 + Math.random() * 0.7,
      reviewsCount: 20 + Math.floor(Math.random() * 300),
    },
    amenities: [
      { title: "Internet", values: [{ title: "Wifi", available: true as const }] },
      { title: "Kitchen", values: [{ title: "Kitchen", available: (Math.random() > 0.3) as unknown as true }] },
      { title: "Outdoor", values: [
        { title: "Pool", available: (Math.random() > 0.6) as unknown as true },
        { title: "Hot tub", available: (Math.random() > 0.7) as unknown as true },
      ]},
      { title: "Heating", values: [{ title: "Air conditioning", available: (Math.random() > 0.2) as unknown as true }] },
    ],
    price: { amount: `$${100 + Math.floor(Math.random() * 200)}`, label: `$${100 + Math.floor(Math.random() * 200)} per night` },
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
  console.log("STR Scout — Analysis Engine Tests");
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

  // Test 6: Amenity gap
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
