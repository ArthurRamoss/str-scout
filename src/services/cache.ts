import type { AirbnbListing, CachedMarketData, DataFreshness } from "../types/index.js";

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
    setTimeout(() => memoryCache.delete(key), ttlSeconds * 1000);
  }
}

export interface CacheResult {
  listings: AirbnbListing[];
  dataFreshness: DataFreshness;
  cachedAt: string | null;
}

export async function getCachedListings(location: string): Promise<CacheResult | null> {
  const key = `str:${normalizeCacheKey(location)}`;
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

export async function saveToCache(location: string, listings: AirbnbListing[]): Promise<void> {
  const key = `str:${normalizeCacheKey(location)}`;
  const data: CachedMarketData = {
    location,
    listings,
    scrapedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + STALE_TTL_SECONDS * 1000).toISOString(),
  };
  await cacheSet(key, JSON.stringify(data), STALE_TTL_SECONDS);
}
