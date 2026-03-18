import "dotenv/config";
import { ApifyClient } from "apify-client";
import * as fs from "fs";

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

// Build Airbnb search URL from location string
function buildAirbnbSearchUrl(location: string, minBedrooms?: number, currency = "USD"): string {
  const encoded = encodeURIComponent(location);
  const slug = location.replace(/[,\s]+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
  let url = `https://www.airbnb.com/s/${slug}/homes?query=${encoded}&tab_id=home_tab&refinement_paths%5B%5D=%2Fhomes&currency=${currency}`;
  if (minBedrooms) url += `&min_bedrooms=${minBedrooms}`;
  return url;
}

// ==========================================
// Test: curious_coder/airbnb-scraper (PRIMARY)
// Input: urls[], count, currency, scrapeDetail
// ==========================================
async function testCuriousCoder(location: string, count: number, scrapeDetail: boolean) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: curious_coder/airbnb-scraper`);
  console.log(`Location: ${location} | count: ${count} | scrapeDetail: ${scrapeDetail}`);
  console.log("=".repeat(60));

  const searchUrl = buildAirbnbSearchUrl(location, 2);
  console.log(`Search URL: ${searchUrl}`);

  const startTime = Date.now();
  try {
    const run = await client.actor("curious_coder/airbnb-scraper").call(
      {
        urls: [searchUrl],
        currency: "USD",
        scrapeDetail,
        scrapeAvailability: false,
        scrapeReviews: false,
        count,
      },
      { timeout: 300 }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`\nResults: ${items.length}`);
    console.log(`Time: ${elapsed}s`);
    console.log(`Usage USD: ${run.usageTotalUsd ?? "check console"}`);
    console.log(`Status: ${run.status}`);

    // Save full sample
    fs.writeFileSync(
      "src/tests/sample-curious_coder.json",
      JSON.stringify(items.slice(0, 3), null, 2)
    );
    console.log("Sample saved: src/tests/sample-curious_coder.json");

    const first = items[0] as Record<string, any>;
    if (!first) {
      console.log("\nNo results returned!");
      return;
    }

    // Show all top-level keys
    console.log(`\n--- Top-level keys ---`);
    console.log(Object.keys(first).join(", "));

    // Data quality check
    console.log(`\n--- Data Quality Check ---`);
    console.log(`Has price: ${!!(first.price || first.pricing || first.pricePerNight)}`);
    console.log(`Has rating: ${!!(first.rating || first.starRating)}`);
    console.log(`Has reviewCount: ${!!(first.reviewCount || first.reviewsCount || first.numberOfReviews)}`);
    console.log(`Has coordinates: ${!!(first.latitude || first.coordinates || first.lat)}`);
    console.log(`Has amenities: ${!!(first.amenities && (Array.isArray(first.amenities) || typeof first.amenities === "object"))}`);
    console.log(`Has host: ${!!(first.host || first.hostName || first.hostId)}`);
    console.log(`Has roomType/propertyType: ${!!(first.roomType || first.propertyType || first.type)}`);
    console.log(`Has bedrooms: ${!!(first.bedrooms || first.beds)}`);
    console.log(`Has url: ${!!(first.url || first.listingUrl)}`);
    console.log(`Has title/name: ${!!(first.title || first.name)}`);
    console.log(`Has superhost: ${!!(first.superhost !== undefined || first.isSuperhost !== undefined)}`);

    // Show structures
    if (first.amenities) {
      const amenities = first.amenities;
      if (Array.isArray(amenities)) {
        console.log(`\nAmenities (${amenities.length} items, first 5):`, JSON.stringify(amenities.slice(0, 5), null, 2));
      } else {
        console.log(`\nAmenities (object):`, JSON.stringify(amenities, null, 2).slice(0, 500));
      }
    }

    if (first.rating || first.starRating) {
      console.log(`\nRating:`, JSON.stringify(first.rating || first.starRating, null, 2));
    }

    if (first.price || first.pricing || first.pricePerNight) {
      console.log(`\nPrice:`, JSON.stringify(first.price || first.pricing || { perNight: first.pricePerNight }, null, 2).slice(0, 300));
    }

    // Print first listing compact
    console.log(`\n--- First listing (compact) ---`);
    const compact: Record<string, any> = {};
    for (const [k, v] of Object.entries(first)) {
      if (Array.isArray(v)) compact[k] = `[${v.length} items]`;
      else if (typeof v === "object" && v !== null) compact[k] = "{...}";
      else compact[k] = v;
    }
    console.log(JSON.stringify(compact, null, 2));

  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`FAILED after ${elapsed}s: ${error.message}`);
  }
}

// ==========================================
// Test: memo23/airbnb-scraper (BACKUP)
// Input: startUrls[], maxItems, checkIn, checkOut
// ==========================================
async function testMemo23(location: string, maxItems: number) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: memo23/airbnb-scraper (BACKUP)`);
  console.log(`Location: ${location} | maxItems: ${maxItems}`);
  console.log("=".repeat(60));

  const searchUrl = buildAirbnbSearchUrl(location, 2);
  console.log(`Search URL: ${searchUrl}`);

  const startTime = Date.now();
  try {
    const run = await client.actor("memo23/airbnb-scraper").call(
      {
        startUrls: [{ url: searchUrl }],
        maxItems,
        adults: 2,
      },
      { timeout: 300 }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`\nResults: ${items.length}`);
    console.log(`Time: ${elapsed}s`);
    console.log(`Usage USD: ${run.usageTotalUsd ?? "check console"}`);
    console.log(`Status: ${run.status}`);

    fs.writeFileSync(
      "src/tests/sample-memo23.json",
      JSON.stringify(items.slice(0, 3), null, 2)
    );
    console.log("Sample saved: src/tests/sample-memo23.json");

    const first = items[0] as Record<string, any>;
    if (!first) {
      console.log("\nNo results returned!");
      return;
    }

    console.log(`\n--- Top-level keys ---`);
    console.log(Object.keys(first).join(", "));

    console.log(`\n--- Data Quality Check ---`);
    console.log(`Has amenities: ${!!first.amenities}`);
    console.log(`Has rating: ${!!(first.rating || first.starRating)}`);
    console.log(`Has host: ${!!(first.host || first.hostName)}`);
    console.log(`Has price: ${!!(first.price || first.pricing)}`);

  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`FAILED after ${elapsed}s: ${error.message}`);
  }
}

// ==========================================
// Main
// ==========================================
async function main() {
  console.log("STR Scout — Scraper Test (Cost-Controlled)");
  console.log(`Date: ${new Date().toISOString()}\n`);

  if (!process.env.APIFY_TOKEN) {
    console.error("ERROR: APIFY_TOKEN not set in .env");
    process.exit(1);
  }

  const test = process.env.TEST_SCRAPER ?? "curious_coder";

  switch (test) {
    case "curious_coder":
      // count=10, scrapeDetail=false first (cheapest test)
      await testCuriousCoder("Austin, TX", 10, false);
      break;
    case "curious_coder_detail":
      // count=10, scrapeDetail=true (slightly more expensive)
      await testCuriousCoder("Austin, TX", 10, true);
      break;
    case "memo23":
      await testMemo23("Austin, TX", 10);
      break;
    default:
      console.log(`Unknown test: ${test}. Use: curious_coder, curious_coder_detail, memo23`);
  }
}

main().catch(console.error);
