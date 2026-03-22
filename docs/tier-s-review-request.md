# STR Scout — Tier S Review Request

**Tool ID**: `976d3ad9-a77d-492b-8d16-5360a59ac83f`
**Marketplace**: Live and passing verification
**Endpoint**: `https://str-scout-production.up.railway.app/mcp`

---

## Subject: STR Scout — Requesting Tier S Review

Alex,

STR Scout is live on the marketplace, passing execute verification, and discoverable on both query and execute surfaces. I've addressed every concern from your Tier A feedback. Here's the evidence:

---

### Your Concern #1: "Blocked dates do not equal booked dates"
**Solution**: I never touch calendars. STR Scout uses a **review velocity model**:

```
reviews/month → bookings/month (÷ 0.6 review rate) → nights/month (× 3.5 avg stay) → occupancy (capped at 85%)
```

The model is transparent — every response includes a `methodology` field explaining exactly how the estimate was derived, and a `confidenceLevel` based on sample size. No calendar inference, no availability gaps, no guesswork about host blocks vs actual bookings.

**Code**: `src/services/analysis.ts` lines 170-255

---

### Your Concern #2: "Add a confidence interval to your revenue estimates"
**Solution**: Every revenue estimate returns three tiers with confidence:

```json
{
  "revenueEstimate": {
    "lowEstimate": 35400,    // 25th percentile ADR × 25th percentile occupancy
    "midEstimate": 48200,    // median
    "highEstimate": 64800,   // 75th percentile
    "confidenceLevel": "high",  // high (≥50 listings), medium (20-49), low (<20)
    "methodology": "Review velocity model: 15 listings analyzed, median 8.2 reviews/month..."
  }
}
```

The occupancy estimate also carries its own confidence level and methodology explanation. No single-number estimates — always ranges with transparent assumptions.

---

### Your Concern #3: "What happens when Apify fails mid-query?"
**Solution**: Dual-scraper architecture with cache-first strategy:

1. **Cache check first** — if data exists within 7 days, serve immediately (<2s response)
2. **Primary scraper** (`curious_coder/airbnb-scraper`) — 300s timeout
3. **Fallback scraper** (`memo23/airbnb-scraper`) — different actor, different approach
4. **Explicit error** if both fail — no silent garbage, clear message with both failure reasons

Every response includes `dataFreshness` ("live", "cached_48h", "cached_7d") and `cachedAt` timestamp so users know exactly how fresh their data is.

**Code**: `src/services/apify.ts` lines 109-129, `src/services/cache.ts`

---

### Your Concern #4: "The 60-second timeout kills the response"
**Solution**: Server timeout is **300 seconds** (5 minutes), not 60. But more importantly, cached queries serve in under 2 seconds. The server auto-seeds Austin, TX on boot, so the most common first query hits cache immediately.

For cold markets, the full scrape → analyze → Gemini summary pipeline runs within the 300s window. Both Apify actors also have 300s individual timeouts.

**Code**: `src/server.ts` line 244, `src/services/apify.ts` line 7

---

### Your Concern #5: "The idea is good enough for Tier A... if you can solve the accuracy problem"
**What I built beyond the concerns**:

- **Amenity Gap Analysis**: Compares amenities of top-performing listings (by rating × review volume) against the market average. Shows the exact percentage gap — e.g., "Pool: 78% of top performers vs 34% of all listings." This tells investors exactly which amenities to add for the best ROI. AirDNA doesn't offer this.

- **Competitive Saturation Scoring**: 0-100 score combining listing density, average ratings, and Guest Favorite badge penetration. Labels: undersupplied / balanced / competitive / oversaturated. This is the "should I even enter this market?" signal.

- **Top 5 Comparables**: Sorted by quality (rating × review volume), deduplicated by URL, with direct Airbnb links, pricing, ratings, review counts, room type, and guest favorite status. Investors can immediately verify the data.

- **AI Investment Summary**: Gemini 2.5 Flash generates a 2-3 sentence investor briefing with a clear recommendation (bullish/cautious/bearish). If Gemini fails, a rule-based fallback kicks in — the tool never returns without a summary.

---

### Marketplace Verification Results

| Phase | Status |
|-------|--------|
| Discovery (direct lookup) | PASS |
| Discovery (query search) | PASS — 10 matches |
| Discovery (execute search) | PASS — 3 matches |
| Execute Surface | PASS — all 12 outputSchema keys returned |
| Session Lifecycle | PASS — start → execute → close |
| Query Surface | Pending (Auto Pay cap config) |

The execute surface validates end-to-end through the marketplace: session creation, tool execution with cached Austin TX data, full structured response matching outputSchema, and clean session closure.

---

### Technical Architecture

```
User Query → Context Marketplace → STR Scout MCP Server
                                        ↓
                              Cache Check (Redis/memory)
                                   ↓ miss
                         Primary Scraper (curious_coder)
                              ↓ fail
                         Fallback Scraper (memo23)
                                   ↓
                         Analysis Pipeline:
                         ├── Review Velocity → Occupancy
                         ├── ADR Percentiles (P25/P50/P75)
                         ├── Revenue = ADR × Occupancy × 365
                         ├── Saturation Score (0-100)
                         ├── Amenity Gap (top performers vs avg)
                         ├── Top 5 Comparables (deduped)
                         └── Gemini 2.5 Flash → Investment Summary
                                   ↓
                         Structured Response (12 fields)
                         + Human-readable content
```

### Test Coverage
- 95 unit tests passing (48 analysis + 47 scraper format)
- 61 deep validation checks (schema, protocol, smoke test)
- Marketplace SDK validation (discovery + execute)

---

### Why This Should Be Tier S

1. **Unique value**: Nothing else on the marketplace does STR market analysis. This unbundles AirDNA's core product ($1,200-$12,000/year) into a $0.10 query.

2. **Honest methodology**: Review velocity model with transparent assumptions, confidence intervals, and sample sizes. No calendar scraping, no fake precision.

3. **Investor-grade output**: Revenue ranges (not point estimates), saturation scoring, amenity ROI analysis, comparable listings with links — everything an investor needs for a go/no-go decision.

4. **Production resilience**: Dual scraper fallback, cache-first architecture, 300s timeouts, auto warm-up, graceful Gemini fallback, explicit error handling.

5. **Context Protocol compliance**: Full outputSchema, structuredContent + content[], createContextMiddleware on all routes, _meta with surface/queryEligible/latencyClass/smokeTestInput/rateLimit.

Ready for your review whenever you are.

Arthur
