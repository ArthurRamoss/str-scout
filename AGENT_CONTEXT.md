# STR Scout — Agent Development Context
## Atualizado em: 2026-03-17

### Status atual
- [x] Fase 0: Setup (pnpm, TypeScript, ESM, deps)
- [x] Fase 1: Scraper selection + testing
- [x] Fase 2: Schemas e boilerplate
- [x] Fase 3: Core logic
- [x] Fase 4: Integração
- [x] Fase 5: Deploy prep (Dockerfile + railway.toml)
- [ ] Fase 6: Deep Validation
- [ ] Fase 7: Pitch Tier S

### EM PROGRESSO — o que falta pra fechar Fase 6
1. **Atualizar extractors do `src/services/analysis.ts`** pro formato curious_coder
   - Os types (`src/types/index.ts`) já suportam ambos formatos
   - Mas os extractors (`extractPrice`, `extractRating`, `extractReviewCount`, `countAmenities`, guest favorites) ainda parseiam formato tri_angle
   - Precisa: detectar formato e extrair corretamente (curious_coder: `starRating`, `reviewsCount` direto, `price` como string total, amenities flat array)
2. **Atualizar mock data do `src/tests/test-analysis.ts`** pro formato curious_coder
3. **Build validation** (`pnpm build`)
4. **Test end-to-end** com dados reais do curious_coder
5. **Testar memo23 fallback** (nunca foi testado com dados reais)
6. Deploy no Railway

### Decisões tomadas
- **Scraper primário**: `curious_coder/airbnb-scraper` (pay-per-usage, count param, 100% success, 5.0 rating, $0.001 por 10 listings com scrapeDetail=true)
- **Scraper fallback**: `memo23/airbnb-scraper` ($0.80/1K, maxItems param)
- **Scrapers descartados**: sovereigntaylor (bloqueado anti-bot), tri_angle/new-fast (sem maxItems, gastou $9.51), hyperscrape ($4/1K caro demais)
- StreamableHTTPServerTransport (não SSE) como transport MCP
- Review velocity model para revenue estimation (não calendar scraping, per Alex feedback)
- Confidence intervals (low/mid/high = p25/p50/p75) em todas estimativas
- In-memory cache como fallback quando Redis indisponível
- Gemini 2.0 Flash para investment summary synthesis
- URL-based input pro curious_coder: construímos URL de busca Airbnb com `currency=USD`

### Formato de dados curious_coder (primary scraper)
```
- starRating: number (ex: 4.7) — NÃO rating.guestSatisfaction
- reviewsCount: number direto — NÃO rating.reviewsCount
- price: string total (ex: "$918") — NÃO price.amount per night
- dates: string (ex: "Mar 21 – 26") — pra calcular nights e ADR
- costPerNight: number | null — frequentemente null
- bedInfo: string (ex: "2 bedrooms, 2 beds") — NÃO subDescription
- propertyUrl: string — NÃO url
- location: {latitude, longitude} — NÃO coordinates
- hostDetails: {isSuperhost (lowercase h), timeAsHost, ratingAverage}
- ratings: [{category: "Cleanliness", score: "4.8"}] — array, score é STRING
- amenities: [{groupName: "Bathroom", title: "Hair dryer", available: true}] — flat array
- badges: [{type: "SUPERHOST", label: "Superhost"}] — objetos, não strings
- title inclui tipo: "Entire rental unit in Austin, Texas" — útil pra filtro
```

### Arquivos implementados
- `src/types/index.ts` — Interfaces flexíveis (curious_coder + tri_angle)
- `src/tools/index.ts` — outputSchema completo do analyze_str_market
- `src/services/apify.ts` — Dual scraper com fallback (curious_coder → memo23)
- `src/services/cache.ts` — Redis + in-memory fallback, TTL 48h fresh / 7d stale
- `src/services/analysis.ts` — Revenue, ADR, occupancy, saturation, amenity gap, comparables
- `src/services/gemini.ts` — Gemini 2.0 Flash investment summary
- `src/tools/analyzeMarket.ts` — Handler: cache → scrape → analyze → gemini → response
- `src/server.ts` — MCP server (Express + StreamableHTTPServerTransport + createContextMiddleware)
- `src/tests/test-apify.ts` — Testes curious_coder + memo23
- `src/tests/test-analysis.ts` — 47 testes (mock data formato tri_angle — PRECISA ATUALIZAR)
- `src/tests/sample-curious_coder.json` — Sample real do scraper (10 listings Austin TX)
- `Dockerfile` + `railway.toml` — Deploy config

### Testes realizados
- curious_coder scrapeDetail=false: 10 results, $0.0004, 9s
- curious_coder scrapeDetail=true: 10 results, $0.001, 15.8s — dados completos (50 amenities, ratings, host)
- Analysis engine mock tests: 47/47 passed
- Build: compila sem erros (último check antes do update de types)

### Custos registrados
- sovereigntaylor test: $0 (falhou)
- tri_angle fast test: $9.51 (5996 results sem controle — NUNCA MAIS)
- curious_coder test 1: $0.0004
- curious_coder test 2: $0.001
- **Regra**: SEMPRE usar count/maxItems param. Máx $0.12/query sem cache.

### Commits
- `aeb6919` — Initial setup: project structure, dependencies, and placeholders
- `c77e1c2` — Add STR Scout analysis on scrapers and economics
- `cac05aa` — Implement STR Scout core: MCP server, dual scraper, analysis engine, Gemini
