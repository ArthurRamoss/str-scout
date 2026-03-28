import type { AirbnbListing, CachedMarketData, DataFreshness } from "../types/index.js";
import type { RawScrapeRequest } from "./scrapeRequest.js";
import { resolveRawScrapeRequest } from "./scrapeRequest.js";

const FRESH_TTL_HOURS = 48;
const STALE_TTL_HOURS = 7 * 24; // 7 days
const STALE_TTL_SECONDS = STALE_TTL_HOURS * 3600;

// In-memory fallback when Redis is not available
const memoryCache = new Map<string, string>();

let redisClient: any = null;

async function getRedis() {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const ioredis = await import("ioredis");
    const Redis = ioredis.default;
    redisClient = new (Redis as any)(redisUrl, { maxRetriesPerRequest: 2, connectTimeout: 5000 });
    await redisClient.ping();
    console.log("Redis connected");
    return redisClient;
  } catch {
    console.warn("Redis unavailable, using in-memory cache");
    return null;
  }
}

export function normalizeCacheKey(location: string): string {
  return location
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function buildRawListingsCacheKey(request: RawScrapeRequest): string {
  const resolved = resolveRawScrapeRequest(request);
  const checkIn = resolved.checkIn ?? "none";
  const checkOut = resolved.checkOut ?? "none";

  const propertyType = request.propertyType || "any";

  return [
    "str",
    normalizeCacheKey(resolved.location),
    `type-${propertyType}`,
    `bedrooms-${resolved.minBedrooms}`,
    `checkin-${checkIn}`,
    `checkout-${checkOut}`,
  ].join(":");
}

async function cacheGet(key: string): Promise<string | null> {
  const redis = await getRedis();
  if (redis) {
    return redis.get(key);
  }
  return memoryCache.get(key) ?? null;
}

async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(key, value, "EX", ttlSeconds);
  } else {
    memoryCache.set(key, value);
    // Simple TTL for in-memory: delete after timeout
    const timer = setTimeout(() => memoryCache.delete(key), ttlSeconds * 1000);
    timer.unref?.();
  }
}

export interface CacheResult {
  listings: AirbnbListing[];
  dataFreshness: DataFreshness;
  cachedAt: string;
}

export interface BestEffortCacheResult extends CacheResult {
  exactMatch: boolean;
  matchedRequest: RawScrapeRequest;
}

export async function getCachedListings(
  request: RawScrapeRequest
): Promise<CacheResult | null> {
  const key = buildRawListingsCacheKey(request);
  const raw = await cacheGet(key);

  if (!raw) return null;

  try {
    const data: CachedMarketData = JSON.parse(raw);
    const ageHours = (Date.now() - new Date(data.scrapedAt).getTime()) / 3600000;

    let freshness: DataFreshness;
    if (ageHours <= FRESH_TTL_HOURS) {
      freshness = "cached_48h";
    } else {
      freshness = "cached_7d";
    }

    return {
      listings: data.listings,
      dataFreshness: freshness,
      cachedAt: data.scrapedAt,
    };
  } catch {
    return null;
  }
}

function dedupeCacheCandidates(requests: RawScrapeRequest[]): RawScrapeRequest[] {
  const seen = new Set<string>();
  const candidates: RawScrapeRequest[] = [];

  for (const request of requests) {
    const key = buildRawListingsCacheKey(request);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(request);
  }

  return candidates;
}

export async function getBestEffortCachedListings(
  request: RawScrapeRequest
): Promise<BestEffortCacheResult | null> {
  const noDatesRequest: RawScrapeRequest = {
    location: request.location,
    minBedrooms: request.minBedrooms,
    propertyType: request.propertyType,
  };

  const candidates = dedupeCacheCandidates([request, noDatesRequest]);

  for (const candidate of candidates) {
    const cached = await getCachedListings(candidate);
    if (!cached) continue;

    const exactMatch = buildRawListingsCacheKey(candidate) === buildRawListingsCacheKey(request);

    return {
      ...cached,
      dataFreshness: exactMatch ? cached.dataFreshness : "market_estimates_only",
      exactMatch,
      matchedRequest: candidate,
    };
  }

  return null;
}

export async function saveToCache(
  request: RawScrapeRequest,
  listings: AirbnbListing[]
): Promise<void> {
  const key = buildRawListingsCacheKey(request);
  const data: CachedMarketData = {
    location: request.location,
    listings,
    scrapedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + STALE_TTL_SECONDS * 1000).toISOString(),
  };
  await cacheSet(key, JSON.stringify(data), STALE_TTL_SECONDS);
}
