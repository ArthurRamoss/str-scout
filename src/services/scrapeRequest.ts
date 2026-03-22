import type { ScrapeOptions } from "../types/index.js";

export interface RawScrapeRequest {
  location: string;
  minBedrooms?: number;
  checkIn?: string;
  checkOut?: string;
  propertyType?: string;
}

export interface ResolvedRawScrapeRequest {
  location: string;
  minBedrooms: number;
  checkIn?: string;
  checkOut?: string;
}

export const DEFAULT_MIN_BEDROOMS = 1;

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function toRawScrapeRequest(
  options: ScrapeOptions | RawScrapeRequest
): RawScrapeRequest {
  return {
    location: options.location,
    minBedrooms: options.minBedrooms,
    checkIn: options.checkIn,
    checkOut: options.checkOut,
    propertyType: (options as any).propertyType,
  };
}

export function resolveRawScrapeRequest(
  options: RawScrapeRequest
): ResolvedRawScrapeRequest {
  return {
    location: options.location,
    minBedrooms: options.minBedrooms ?? DEFAULT_MIN_BEDROOMS,
    checkIn: normalizeOptionalString(options.checkIn),
    checkOut: normalizeOptionalString(options.checkOut),
  };
}
