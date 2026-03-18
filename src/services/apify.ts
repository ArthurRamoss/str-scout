import { ApifyClient } from "apify-client";
import type { AirbnbListing, ScrapeOptions } from "../types/index.js";

const PRIMARY_ACTOR = "curious_coder/airbnb-scraper";
const FALLBACK_ACTOR = "memo23/airbnb-scraper";
const APIFY_TIMEOUT = 300; // seconds
const DEFAULT_COUNT = 100;

let client: ApifyClient | null = null;

function getClient(): ApifyClient {
  if (!client) {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN not configured");
    client = new ApifyClient({ token });
  }
  return client;
}

// Build Airbnb search URL from location string
function buildSearchUrl(options: ScrapeOptions): string {
  const { location, minBedrooms, checkIn, checkOut } = options;
  const encoded = encodeURIComponent(location);
  const slug = location.replace(/[,\s]+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");

  let url = `https://www.airbnb.com/s/${slug}/homes?query=${encoded}&tab_id=home_tab&refinement_paths%5B%5D=%2Fhomes&currency=USD`;

  const bedrooms = minBedrooms ?? 1; // default filter to reduce cost
  url += `&min_bedrooms=${bedrooms}`;

  if (checkIn) url += `&checkin=${checkIn}`;
  if (checkOut) url += `&checkout=${checkOut}`;

  return url;
}

// Primary: curious_coder/airbnb-scraper
// Input: urls[], count, currency, scrapeDetail
async function scrapePrimary(options: ScrapeOptions): Promise<AirbnbListing[]> {
  const apify = getClient();
  const searchUrl = buildSearchUrl(options);
  const count = Number(process.env.APIFY_MAX_RESULTS) || DEFAULT_COUNT;

  console.log(`[apify] PRIMARY (${PRIMARY_ACTOR}) — "${options.location}", count=${count}`);
  const startTime = Date.now();

  const run = await apify.actor(PRIMARY_ACTOR).call(
    {
      urls: [searchUrl],
      currency: "USD",
      scrapeDetail: true,
      scrapeAvailability: false,
      scrapeReviews: false,
      count,
    },
    { timeout: APIFY_TIMEOUT }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();

  console.log(
    `[apify] PRIMARY: ${items.length} listings in ${elapsed}s (cost: $${run.usageTotalUsd ?? "?"})`
  );

  if (items.length === 0) {
    throw new Error("Primary scraper returned 0 results");
  }

  return items as AirbnbListing[];
}

// Fallback: memo23/airbnb-scraper
// Input: startUrls[], maxItems, adults
async function scrapeFallback(options: ScrapeOptions): Promise<AirbnbListing[]> {
  const apify = getClient();
  const searchUrl = buildSearchUrl(options);
  const maxItems = Number(process.env.APIFY_MAX_RESULTS) || DEFAULT_COUNT;

  console.log(`[apify] FALLBACK (${FALLBACK_ACTOR}) — "${options.location}", maxItems=${maxItems}`);
  const startTime = Date.now();

  const run = await apify.actor(FALLBACK_ACTOR).call(
    {
      startUrls: [{ url: searchUrl }],
      maxItems,
      adults: 2,
    },
    { timeout: APIFY_TIMEOUT }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();

  console.log(
    `[apify] FALLBACK: ${items.length} listings in ${elapsed}s (cost: $${run.usageTotalUsd ?? "?"})`
  );

  return items as AirbnbListing[];
}

// Main entry: try primary, fallback on failure
export async function scrapeAirbnbListings(
  options: ScrapeOptions
): Promise<AirbnbListing[]> {
  let primaryMsg = "";

  // Try primary scraper
  try {
    return await scrapePrimary(options);
  } catch (primaryError: any) {
    primaryMsg = primaryError.message;
    console.warn(`[apify] Primary failed: ${primaryMsg}`);
  }

  // Try fallback scraper
  try {
    return await scrapeFallback(options);
  } catch (fallbackError: any) {
    console.error(`[apify] Fallback also failed: ${fallbackError.message}`);
    throw new Error(
      `Both scrapers failed for "${options.location}". Primary: ${primaryMsg}. Fallback: ${fallbackError.message}`
    );
  }
}
