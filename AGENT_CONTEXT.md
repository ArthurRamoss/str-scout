# STR Scout — Agent Development Context
## Atualizado em: 2026-03-17

### Status atual
- [x] Fase 0: Setup
- [~] Fase 1: Testes de scrapers (script pronto, falta rodar com APIFY_TOKEN)
- [x] Fase 2: Schemas e boilerplate
- [x] Fase 3: Core logic
- [x] Fase 4: Integração
- [x] Fase 5: Deploy prep (Dockerfile + railway.toml prontos)
- [ ] Fase 6: Deep Validation
- [ ] Fase 7: Pitch Tier S

### Decisões tomadas
- Setup inicial com pnpm, TypeScript, ESM modules
- StreamableHTTPServerTransport (não SSE) como transport MCP
- Review velocity model para revenue estimation (não calendar scraping)
- Confidence intervals (low/mid/high = p25/p50/p75) em todas estimativas
- In-memory cache como fallback quando Redis indisponível
- Gemini 2.0 Flash para investment summary synthesis
- Actor ID configurável via APIFY_ACTOR_ID env var (default: tri_angle/airbnb-scraper)
- Default filter minBedrooms=1 quando user não especifica (controle de custo)

### O que foi implementado
- `src/types/index.ts` — Interfaces completas (AirbnbListing, MarketAnalysis, etc.)
- `src/tools/index.ts` — outputSchema completo com todas as properties documentadas
- `src/services/apify.ts` — Wrapper Apify com filtros nativos e timeout 180s
- `src/services/cache.ts` — Redis + in-memory fallback, TTL 48h fresh / 7d stale
- `src/services/analysis.ts` — Revenue estimation, ADR, occupancy, saturation, amenity gap, comparables
- `src/services/gemini.ts` — Gemini 2.0 Flash integration para investmentSummary
- `src/tools/analyzeMarket.ts` — Handler principal (cache → scrape → analyze → gemini → response)
- `src/server.ts` — MCP server com Express, StreamableHTTPServerTransport, createContextMiddleware
- `src/tests/test-apify.ts` — Script de teste de scrapers (pronto pra rodar)
- `src/tests/test-analysis.ts` — 47 testes passando (mock data)
- `Dockerfile` + `railway.toml` — Deploy config prontos

### Testes
- `pnpm run test:analysis` — 47 passed, 0 failed
- `pnpm build` — compila sem erros
- Revenue estimates com mock data: $56K-$87K/year (Austin, TX mock)

### Problemas encontrados
- ioredis dynamic import precisa de cast (any) por tipo não-construtível
- node_modules não estava instalado (pnpm install resolveu)

### Próximos passos
- Configurar .env com APIFY_TOKEN e GEMINI_API_KEY
- Rodar `pnpm run test:apify` (TEST_SCRAPER_INDEX=0 para sovereigntaylor)
- Decidir scraper final baseado nos resultados
- Testar server localmente (`pnpm dev` → curl /health → curl /mcp)
- Deploy no Railway com Redis addon
- Deep Validation (Fase 6)
- Pitch Tier S (Fase 7)
