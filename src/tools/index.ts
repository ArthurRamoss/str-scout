export const TOOLS = [
  {
    name: "analyze_str_market",
    description:
      "Analyze a short-term rental (Airbnb) market for investment potential. Returns estimated annual revenue with confidence intervals, average daily rates, occupancy estimates via review velocity model, competitive saturation scoring, structured amenity gap analysis, and top comparable listings. Replaces AirDNA MarketMinder for a fraction of the cost.",
    inputSchema: {
      type: "object" as const,
      properties: {
        location: {
          type: "string",
          description:
            "City, neighborhood, or address to analyze (e.g., 'Austin, TX', 'Miami Beach, FL', 'Williamsburg, Brooklyn')",
          default: "Austin, TX",
        },
        propertyType: {
          type: "string",
          description: "Type of property to analyze",
          enum: ["entire_home", "private_room", "any"],
          default: "entire_home",
        },
        bedrooms: {
          type: "number",
          description: "Number of bedrooms to filter for. Use 0 for studio.",
        },
        checkIn: {
          type: "string",
          description:
            "Optional check-in date for seasonal pricing analysis (ISO format YYYY-MM-DD)",
        },
        checkOut: {
          type: "string",
          description:
            "Optional check-out date for seasonal pricing analysis (ISO format YYYY-MM-DD)",
        },
      },
      required: ["location"],
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        location: {
          type: "string",
          description: "The analyzed location",
        },
        dataFreshness: {
          type: "string",
          description: "How fresh the underlying data is",
          enum: ["live", "cached_48h", "cached_7d", "market_estimates_only"],
        },
        cachedAt: {
          type: "string",
          description:
            "ISO timestamp of when data was scraped or last cached",
        },
        totalListingsAnalyzed: {
          type: "number",
          description:
            "Number of Airbnb listings analyzed in this market",
        },
        filteredListings: {
          type: "number",
          description:
            "Number of listings matching property type and bedroom filters",
        },
        revenueEstimate: {
          type: "object",
          description:
            "Estimated annual revenue with confidence interval",
          properties: {
            lowEstimate: {
              type: "number",
              description:
                "Conservative annual revenue estimate in USD (25th percentile)",
            },
            midEstimate: {
              type: "number",
              description:
                "Median annual revenue estimate in USD (50th percentile)",
            },
            highEstimate: {
              type: "number",
              description:
                "Optimistic annual revenue estimate in USD (75th percentile)",
            },
            confidenceLevel: {
              type: "string",
              description:
                "How confident the estimate is based on data quality",
              enum: ["high", "medium", "low"],
            },
            methodology: {
              type: "string",
              description:
                "Brief explanation of how the estimate was derived",
            },
          },
          required: [
            "lowEstimate",
            "midEstimate",
            "highEstimate",
            "confidenceLevel",
            "methodology",
          ],
        },
        averageDailyRate: {
          type: "object",
          description: "Average Daily Rate (ADR) statistics",
          properties: {
            median: {
              type: "number",
              description: "Median price per night in USD",
            },
            percentile25: {
              type: "number",
              description: "25th percentile price per night",
            },
            percentile75: {
              type: "number",
              description: "75th percentile price per night",
            },
          },
          required: ["median", "percentile25", "percentile75"],
        },
        occupancyEstimate: {
          type: "object",
          description:
            "Estimated occupancy rate based on review velocity model",
          properties: {
            estimatedRate: {
              type: "number",
              description:
                "Estimated occupancy rate as decimal (0.0 - 1.0)",
            },
            confidenceLevel: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            basedOn: {
              type: "string",
              description:
                "Explanation of the estimation method (review velocity, market averages, etc.)",
            },
          },
          required: ["estimatedRate", "confidenceLevel", "basedOn"],
        },
        competitiveSaturation: {
          type: "object",
          description:
            "How saturated the market is with STR listings",
          properties: {
            score: {
              type: "number",
              description:
                "Saturation score from 0 (undersupplied) to 100 (oversaturated)",
            },
            label: {
              type: "string",
              description: "Human-readable label",
              enum: [
                "undersupplied",
                "balanced",
                "competitive",
                "oversaturated",
              ],
            },
            totalListings: {
              type: "number",
              description: "Total active listings in this market",
            },
            averageRating: {
              type: "number",
              description: "Average rating across all listings",
            },
            guestFavoritePercent: {
              type: "number",
              description:
                "Percentage of listings with Guest Favorite badge (top performers)",
            },
          },
          required: [
            "score",
            "label",
            "totalListings",
            "averageRating",
            "guestFavoritePercent",
          ],
        },
        amenityGapAnalysis: {
          type: "object",
          description:
            "Amenities that top performers have vs. average listings",
          properties: {
            topPerformerAmenities: {
              type: "array",
              description:
                "Amenities most common among top-rated listings",
              items: {
                type: "object",
                properties: {
                  amenity: {
                    type: "string",
                    description:
                      "Amenity name (e.g., 'Pool', 'Hot tub', 'Wifi')",
                  },
                  prevalenceTopPerformers: {
                    type: "number",
                    description:
                      "% of top performers with this amenity",
                  },
                  prevalenceAll: {
                    type: "number",
                    description:
                      "% of all listings with this amenity",
                  },
                },
                required: [
                  "amenity",
                  "prevalenceTopPerformers",
                  "prevalenceAll",
                ],
              },
            },
            recommendedAmenities: {
              type: "array",
              description:
                "Amenities with biggest gap between top performers and average — the best ROI amenities to add",
              items: { type: "string" },
            },
          },
          required: ["topPerformerAmenities", "recommendedAmenities"],
        },
        topComparables: {
          type: "array",
          description: "Top 5 comparable listings for reference",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Listing name",
              },
              url: {
                type: "string",
                description: "Airbnb listing URL",
              },
              pricePerNight: {
                type: "number",
                description: "Price per night in USD",
              },
              rating: {
                type: "number",
                description: "Average rating (0-5)",
              },
              reviewCount: {
                type: "number",
                description: "Total number of reviews",
              },
              roomType: {
                type: "string",
                description:
                  "Type of room (entire_home, private_room)",
              },
              isGuestFavorite: {
                type: "boolean",
                description:
                  "Whether listing has Guest Favorite badge",
              },
            },
            required: [
              "name",
              "url",
              "pricePerNight",
              "rating",
              "reviewCount",
              "roomType",
              "isGuestFavorite",
            ],
          },
        },
        investmentSummary: {
          type: "string",
          description:
            "AI-generated 2-3 sentence investment summary with key takeaways and recommendation",
        },
      },
      required: [
        "location",
        "dataFreshness",
        "cachedAt",
        "totalListingsAnalyzed",
        "filteredListings",
        "revenueEstimate",
        "averageDailyRate",
        "occupancyEstimate",
        "competitiveSaturation",
        "amenityGapAnalysis",
        "topComparables",
        "investmentSummary",
      ],
    },
    _meta: {
      pricing: {
        executeUsd: "0.10",
      },
      surface: "query",
      context: [
        "The tool requires a location string. For best results, include city + state for US locations.",
        "First query for a new location takes ~45-60s (live Apify scrape). Subsequent queries for the same location are served from cache in <2s.",
      ],
      smokeTestInput: {
        location: "Austin, TX",
      },
      rateLimit: {
        maxRequestsPerMinute: 10,
        cooldownMs: 6000,
        maxConcurrency: 1,
        supportsBulk: false,
        notes: "Apify scraper has ~45-60s latency for uncached locations. Cache serves in <2s. Default location (Austin, TX) is pre-cached on boot.",
      },
    },
  },
];
