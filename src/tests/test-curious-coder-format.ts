import { analyzeMarketData } from "../services/analysis.js";
import type { AirbnbListing } from "../types/index.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load real curious_coder sample data
const sampleData: AirbnbListing[] = JSON.parse(
  readFileSync(join(__dirname, "sample-curious_coder.json"), "utf-8")
);

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
  console.log("STR Scout — curious_coder Format Validation");
  console.log(`Sample listings loaded: ${sampleData.length}\n`);

  // Verify sample data has expected curious_coder fields
  console.log("Test 1: Verify sample data is curious_coder format");
  const first = sampleData[0];
  assert(typeof first.starRating === "number", `starRating is number (${first.starRating})`);
  assert(typeof first.reviewsCount === "number", `reviewsCount is number (${first.reviewsCount})`);
  assert(typeof first.price === "string", `price is string ("${first.price}")`);
  assert(typeof first.propertyUrl === "string", `propertyUrl exists`);
  assert(first.hostDetails !== undefined, `hostDetails exists`);
  assert(Array.isArray(first.amenities), `amenities is array`);
  assert(first.amenities!.length > 0 && typeof first.amenities![0] === "object" && "groupName" in (first.amenities![0] as object), `amenities are flat (groupName format)`);
  assert(typeof first.title === "string" && first.title.includes("Entire"), `title contains room type info`);

  // Run full analysis with curious_coder data
  console.log("\nTest 2: Full analysis pipeline with curious_coder data");
  const result = analyzeMarketData(sampleData, "entire_home");
  assert(result.filtered.length > 0, `Filtered listings > 0 (got ${result.filtered.length})`);

  // Test 3: Price extraction (critical — was broken before fix)
  console.log("\nTest 3: Price extraction from string format");
  assert(result.adr.median > 0, `Median ADR > 0 ($${result.adr.median})`);
  assert(result.adr.percentile25 > 0, `P25 ADR > 0 ($${result.adr.percentile25})`);
  assert(result.adr.percentile75 > 0, `P75 ADR > 0 ($${result.adr.percentile75})`);
  assert(result.adr.percentile25 <= result.adr.median, `P25 ($${result.adr.percentile25}) <= median ($${result.adr.median})`);
  assert(result.adr.percentile75 >= result.adr.median, `P75 ($${result.adr.percentile75}) >= median ($${result.adr.median})`);
  // Per-night should be reasonable (not the total $918+ value)
  assert(result.adr.median < 1000, `Median ADR < $1000 (sanity check — got $${result.adr.median})`);

  // Test 4: Rating extraction (critical — was broken before fix)
  console.log("\nTest 4: Rating extraction from starRating");
  assert(result.saturation.averageRating > 4.0, `Average rating > 4.0 (${result.saturation.averageRating})`);
  assert(result.saturation.averageRating < 5.0, `Average rating < 5.0 (${result.saturation.averageRating})`);

  // Test 5: Review count extraction
  console.log("\nTest 5: Review count extraction");
  assert(result.revenue.lowEstimate > 0, `Low revenue estimate > 0 ($${result.revenue.lowEstimate.toLocaleString()})`);
  assert(result.revenue.midEstimate > result.revenue.lowEstimate, `Mid ($${result.revenue.midEstimate.toLocaleString()}) > Low`);
  assert(result.revenue.highEstimate > result.revenue.midEstimate, `High ($${result.revenue.highEstimate.toLocaleString()}) > Mid`);

  // Test 6: Occupancy
  console.log("\nTest 6: Occupancy estimation");
  assert(result.occupancy.estimatedRate > 0, `Occupancy > 0 (${(result.occupancy.estimatedRate * 100).toFixed(0)}%)`);
  assert(result.occupancy.estimatedRate <= 1.0, `Occupancy <= 100%`);

  // Test 7: Amenity gap with flat format
  // Note: analyzeAmenities requires >= 5 listings with amenity data.
  // With only 3 sample listings, it correctly returns empty.
  // We test the amenity counting logic directly instead.
  console.log("\nTest 7: Amenity gap analysis (flat format)");
  if (sampleData.length < 5) {
    assert(result.amenityGap.topPerformerAmenities.length === 0, `Correctly skipped amenity analysis (< 5 listings)`);
    // Verify amenity data is parseable by checking listing amenities directly
    const firstAmenities = sampleData[0].amenities as any[];
    const availableAmenities = firstAmenities.filter((a: any) => a.available === true);
    assert(availableAmenities.length > 10, `Flat amenities parsed: ${availableAmenities.length} available`);
    const titles = availableAmenities.map((a: any) => a.title);
    assert(titles.includes("Wifi"), `Wifi detected in flat amenities`);
    assert(titles.includes("Kitchen"), `Kitchen detected in flat amenities`);
  } else {
    assert(result.amenityGap.topPerformerAmenities.length > 0, `Has amenity data (${result.amenityGap.topPerformerAmenities.length} items)`);
    const allAmenities = result.amenityGap.topPerformerAmenities.map(a => a.amenity);
    const hasWifi = allAmenities.includes("Wifi");
    const hasKitchen = allAmenities.includes("Kitchen");
    assert(hasWifi || hasKitchen, `Detected standard amenities (Wifi: ${hasWifi}, Kitchen: ${hasKitchen})`);
  }

  // Test 8: Guest favorites with badge objects
  console.log("\nTest 8: Guest favorites (badge objects + hostDetails.isSuperhost)");
  // Sample has badges like {type: "GUEST_FAVORITE", label: "Guest favorite"}
  // and hostDetails.isSuperhost
  assert(result.saturation.guestFavoritePercent >= 0, `Guest favorite % >= 0 (${result.saturation.guestFavoritePercent}%)`);
  // At least one listing should be a guest favorite (sample has superhosts and guest favorite badges)
  assert(result.saturation.guestFavoritePercent > 0, `At least some guest favorites detected (${result.saturation.guestFavoritePercent}%)`);

  // Test 9: Top comparables with propertyUrl
  console.log("\nTest 9: Top comparables (propertyUrl + hostDetails)");
  assert(result.comparables.length > 0, `Has comparables (${result.comparables.length})`);
  for (const comp of result.comparables) {
    assert(!!comp.name, `Has name: "${comp.name}"`);
    assert(comp.pricePerNight > 0, `Has price: $${comp.pricePerNight}`);
    assert(comp.url.includes("airbnb.com"), `URL is valid: ${comp.url.slice(0, 50)}...`);
    assert(comp.rating > 0, `Rating > 0: ${comp.rating}`);
    assert(comp.reviewCount > 0, `Reviews > 0: ${comp.reviewCount}`);
  }

  // Test 10: filterByPropertyType with title field
  console.log("\nTest 10: Property type filter using title field");
  const entireResult = analyzeMarketData(sampleData, "entire_home");
  const privateResult = analyzeMarketData(sampleData, "private_room");
  const anyResult = analyzeMarketData(sampleData, "any");
  assert(anyResult.filtered.length === sampleData.length, `'any' includes all (${anyResult.filtered.length})`);
  assert(entireResult.filtered.length > 0, `entire_home found via title (${entireResult.filtered.length})`);
  // All sample listings are "Entire rental unit" or "Entire guest suite" so private should be 0
  assert(privateResult.filtered.length === 0, `No private rooms in sample (${privateResult.filtered.length})`);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("");
  console.log("curious_coder Market Summary:");
  console.log(`  Revenue: $${result.revenue.lowEstimate.toLocaleString()} - $${result.revenue.highEstimate.toLocaleString()}/year`);
  console.log(`  ADR: $${result.adr.percentile25} - $${result.adr.percentile75}/night (median $${result.adr.median})`);
  console.log(`  Occupancy: ${(result.occupancy.estimatedRate * 100).toFixed(0)}%`);
  console.log(`  Saturation: ${result.saturation.label} (${result.saturation.score}/100)`);
  console.log(`  Guest Favorites: ${result.saturation.guestFavoritePercent}%`);
  console.log(`  Avg Rating: ${result.saturation.averageRating}`);
  console.log(`  Recommended amenities: ${result.amenityGap.recommendedAmenities.join(", ") || "none"}`);
  console.log(`  Top comparable: ${result.comparables[0]?.name} ($${result.comparables[0]?.pricePerNight}/night, ${result.comparables[0]?.rating}★)`);
  console.log("=".repeat(50));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(console.error);
