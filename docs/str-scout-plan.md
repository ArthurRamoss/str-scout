# STR Scout — Complete Implementation Plan
## Context Protocol Marketplace | Tier A ($500) → Push for Tier S ($1,000)
## Tudo que um chat novo precisa pra codar. Sem pesquisar nada. Só coda.

---

# PARTE 1: O QUE É STR SCOUT

STR Scout é um MCP server para o Context Protocol Marketplace que transforma dados brutos de listings do Airbnb em inteligência de investimento para Short-Term Rentals. Substitui o AirDNA MarketMinder ($1,200–$12,000/year) por queries de ~$0.10–0.15.

**Feature unbundled:** O "Rentalizer" do AirDNA — dado um endereço ou área, retorna estimativa de receita anual, ADR (Average Daily Rate), occupancy rate, comparáveis, e padrões sazonais. É a ÚNICA feature que investidores de STR usam antes de comprar uma propriedade.

**Modelo de negócio:** Pay-per-query no marketplace do Context Protocol. Desenvolvedor ganha 90% de cada query fee em USDC.

**Grant atual:** $500 (Tier A) — $250 seed já recebido, $250 na conclusão.

**ESTRATÉGIA: BUILD FOR TIER S, PITCH UPGRADE BEFORE FINAL REVIEW.**
O plano é construir a tool já no nível de Tier S (com TODAS as melhorias que o Alex pediu — confidence intervals, cache resilience, structured amenity gap analysis). Quando estiver funcional e testado via Deep Validation Prompt, mandar email pro Alex antes do review formal dizendo:
- "Tool tá live e testável"
- "Implementei os pontos que você levantou (confidence intervals, fallback cache, amenity gap com dados estruturados)"
- "Gostaria de ser considerado pra upgrade Tier S antes da review final"

Se ele disser não, a gente entrega como Tier A mesmo (que já tá garantido). Se disser sim, $500 extra.

---

# PARTE 2: O FEEDBACK DO ALEX (ROADMAP PRO TIER S)

O Alex aprovou Tier A mas deu feedback específico sobre o que falta pro Tier S:

## Problema 1: Blocked ≠ Booked
> "blocked dates do not equal booked dates. Hosts block weekends for personal use, maintenance, or to game pricing algorithms."

**Solução:** NÃO inferir occupancy por calendar scraping. Em vez disso:
- Usar **review velocity** como proxy (indústria estima 50-70% dos guests deixam review)
- Review count / meses desde primeiro review = reviews/mês → bookings/mês estimados
- Cruzar com **market averages** do InsideAirbnb (dados históricos gratuitos)
- **SEMPRE retornar confidence interval:** "Estimated $45K–$65K annual revenue" em vez de "$54,200"

## Problema 2: Fallback quando Apify falha
> "What happens when Apify fails mid-query? The 60-second timeout kills the response."

**Solução:**
- Cache agressivo de resultados por localidade (48-72h TTL)
- Se Apify falhar, servir cache com timestamp "data as of [date]"
- Se não tem cache, retornar partial response com dados demográficos + market context
- Retornar campo `dataFreshness` no output: "live" | "cached_48h" | "market_estimates_only"

## Problema 3 (Value-add que ele gostou):
> "The amenity gap analysis and competitive saturation scoring you described are genuine value-adds over AirDNA's raw numbers."

**Manter:** Amenity gap analysis + competitive saturation scoring como diferenciais.

---

# PARTE 3: DADOS DO APIFY SCRAPER

## Scraper escolhido: `tri_angle/airbnb-scraper` (DETALHADO)

**Por que o detalhado e não o fast:**
- O Fast ($0.50/1K) só retorna dados da página de busca — preço, rating, review count, captions de foto
- O Detalhado ($1.25/1K) ABRE cada listing e retorna **amenidades estruturadas**, rating por categoria, host info, bed/bath count direto, price breakdown
- A amenity gap analysis (que o Alex elogiou como diferencial Tier S) depende de dados de amenidades REAIS — não caption parsing
- Com filtros nativos (minBedrooms, minBathrooms), o scraper retorna ~80-120 resultados em vez de 240, reduzindo custo

**Custo com filtros:**
- Sem filtro: ~240 resultados × $1.25/1K = $0.30
- Com filtro (ex: minBedrooms=2): ~100 resultados × $1.25/1K = $0.125
- Praticamente o mesmo que o fast sem filtro ($0.12)

**Descartado: `tri_angle/new-fast-airbnb-scraper`**
- $0.50/1K, ~240 resultados, $0.12/query
- Dados insuficientes pra Tier S: amenidades vêm de captions de foto (inconsistente/incompleto)
- Sem rating detalhado, sem host info, sem bed/bath count direto
- Bom pra Tier B/A, insuficiente pra Tier S

**Campos retornados pelo scraper detalhado:**
```json
{
  "id": "14926879",
  "url": "https://www.airbnb.com/rooms/14926879",
  "title": "Terrific Notting Hill Studio",
  "roomType": "Entire home/apt",
  "coordinates": { "latitude": 51.5101, "longitude": -0.1949 },
  "personCapacity": 1,
  "isSuperHost": false,
  "rating": {
    "accuracy": 4.76,
    "checking": 4.85,
    "cleanliness": 4.77,
    "communication": 4.84,
    "location": 4.95,
    "value": 4.58,
    "guestSatisfaction": 4.58,
    "reviewsCount": 371
  },
  "subDescription": {
    "title": "Entire rental unit",
    "items": ["1 guest", "Studio", "1 bed", "1 bath"]
  },
  "amenities": [
    {
      "title": "Kitchen and dining",
      "values": [
        { "title": "Kitchen", "available": true },
        { "title": "Refrigerator", "available": true },
        { "title": "Stove", "available": true }
      ]
    },
    {
      "title": "Internet and office",
      "values": [
        { "title": "Wifi", "available": true }
      ]
    },
    {
      "title": "Bedroom and laundry",
      "values": [
        { "title": "Washer", "available": true },
        { "title": "Dryer", "available": true }
      ]
    },
    {
      "title": "Not included",
      "values": [
        { "title": "Air conditioning", "available": "" }
      ]
    }
  ],
  "host": {
    "id": "82436841",
    "name": "Max And Billie",
    "isSuperHost": false,
    "highlights": ["8 years hosting"]
  },
  "price": {
    "label": "$107 per night",
    "amount": "$107",
    "qualifier": "night",
    "breakDown": {
      "basePrice": { "description": "Cleaning fee", "price": "$48" },
      "serviceFee": { "description": "Airbnb service fee", "price": "$40" },
      "totalBeforeTaxes": { "description": "Total before taxes", "price": "$302" }
    }
  },
  "highlights": [
    { "title": "Self check-in", "subtitle": "Check yourself in with the smartlock." },
    { "title": "Great location", "subtitle": "95% of recent guests gave the location a 5-star rating." }
  ]
}
```

**O que temos (UPGRADE vs fast scraper):**
- ✅ Preço por noite + price breakdown (cleaning fee, service fee)
- ✅ Rating DETALHADO por categoria (accuracy, cleanliness, communication, location, value)
- ✅ Review count (proxy pra occupancy via review velocity model)
- ✅ Tipo de propriedade + personCapacity + bed/bath count DIRETO (subDescription.items)
- ✅ Coordenadas (pra clustering geográfico)
- ✅ **AMENIDADES ESTRUTURADAS** — lista completa com available: true/false, categorizada
- ✅ Host details (superhost status, years hosting)
- ✅ Highlights (self check-in, great location, etc.)

**O que NÃO temos (e não precisamos):**
- ❌ Calendar/availability data (evitamos o problema blocked≠booked deliberadamente)
- ❌ Review text completo (review count é suficiente pro revenue model)

**Input do scraper:**
```json
{
  "locationQueries": ["austin texas"],
  "minBedrooms": 2,          // filtro nativo — reduz resultados e custo
  "checkIn": "2026-04-01",   // opcional, pra seasonal pricing
  "checkOut": "2026-04-06",  // opcional
  "locale": "en-US",
  "currency": "USD"
}
```

**Filtros nativos disponíveis (usamos pra reduzir custo + focar análise):**
- `minBedrooms`, `minBathrooms`, `minBeds` — passa direto do input do user
- `priceMin`, `priceMax` — range de preço
- `adults`, `children`, `pets` — capacity filtering

~100-120 resultados com filtros, ~240 sem filtros.

---

# PARTE 4: ECONOMICS POR QUERY

## AI Layer: Gemini 2.0 Flash (não Claude)
- Gemini Flash: ~$0.10/1M input tokens = ~$0.001-0.003 por query
- Claude Sonnet: ~$3/1M input tokens = ~$0.02 por query
- Pra sintetizar investmentSummary de dados já estruturados, Flash é suficiente e 10-20x mais barato

## Cenário 1: Sem cache (worst case, com filtros ~100 results)
| Item | Custo |
|------|-------|
| Apify scrape (~100 listings, filtered) | $0.125 |
| Gemini Flash (analysis) | ~$0.003 |
| **Total por query** | **~$0.128** |
| Preço de venda | $0.15 |
| Revenue (90% share) | $0.135 |
| **Margem** | **~$0.007 (5%)** — tight mas positivo |

## Cenário 2: Com cache 48h (expected case)
Se 3+ queries batem no mesmo cache de cidade:
| Item | Custo médio |
|------|------------|
| Apify (amortizado 3 queries) | $0.042 |
| Gemini Flash | ~$0.003 |
| **Total por query** | **~$0.045** |
| Preço de venda | $0.15 |
| Revenue (90% share) | $0.135 |
| **Margem** | **~$0.09 (67%)** |

## Cenário 3: Volume com cache quente (10+ queries/cidade)
| Custo Apify amortizado | ~$0.013 |
| Gemini Flash | ~$0.003 |
| **Total** | **~$0.016** |
| **Margem** | **~$0.12 (88%)** |

## Cenário 4: Sem filtro, 240 results (worst worst case)
| Apify (240 results) | $0.30 |
| Gemini Flash | ~$0.003 |
| **Total** | **$0.303** |
| **Revenue at $0.15** | **PERDA de ~$0.17** |

**REGRA CRÍTICA: SEMPRE usar filtros pra manter custo < $0.15. Se user não especifica bedrooms, usar filtro implícito (ex: entire_home only) pra reduzir volume.**

**Conclusão:** Com filtros + Gemini Flash + cache, economics são saudáveis. Sem filtros, custo do scraper detalhado mata a margem. Filtros são obrigatórios.

---

# PARTE 5: ARQUITETURA

## Stack
```
TypeScript MCP Server (Express + SSE)
├── @modelcontextprotocol/sdk
├── @ctxprotocol/sdk (createContextMiddleware)
├── Apify Client (tri_angle/airbnb-scraper — detalhado)
├── Google Gemini 2.0 Flash (analysis/synthesis layer)
├── PostgreSQL/Redis (cache)
└── Railway Pro (US deploy)
```

## Modo: QUERY (não Execute)
STR Scout é curated intelligence — uma pergunta → um briefing de investimento.
Mesmo padrão do AdWinner e BidScout.

## Regras da plataforma (mesmas de sempre)
- Timeout: ~60 segundos por tool call
- Respostas: `content` (text) + `structuredContent` (JSON matching outputSchema)
- structuredContent PRECISA bater 100% com outputSchema
- outputSchema é o item mais crítico
- Planning LLM assume camelCase

## Flow de uma query

```
User pergunta: "How much could I earn renting a 2BR apartment in Austin, TX on Airbnb?"
                                    │
                                    ▼
                        ┌─── Cache hit? ───┐
                        │                   │
                       YES                  NO
                        │                   │
                  Serve cached         Call Apify scraper
                  listings data        "austin texas"
                        │                   │
                        │              Save to cache (48h TTL)
                        │                   │
                        └───────┬───────────┘
                                │
                                ▼
                    Filter listings by type
                    (entire_home, 2BR via captions)
                                │
                                ▼
                    Calculate metrics:
                    - ADR (median price/night)
                    - Revenue estimate (review velocity model)
                    - Confidence interval (low/mid/high)
                    - Competitive saturation score
                    - Amenity gap analysis (from image captions)
                    - Top performers (badges, ratings)
                                │
                                ▼
                    Claude API: synthesize into
                    investment briefing
                                │
                                ▼
                    Return content[] + structuredContent
```

---

# PARTE 6: TOOLS (MCP)

## Tool 1: `analyze_str_market`

**O que faz:** Análise completa de mercado STR para uma localidade. A feature principal — equivalente ao Rentalizer do AirDNA.

### inputSchema
```json
{
  "type": "object",
  "properties": {
    "location": {
      "type": "string",
      "description": "City, neighborhood, or address to analyze (e.g., 'Austin, TX', 'Miami Beach, FL', 'Williamsburg, Brooklyn')",
      "examples": ["Austin, TX", "Nashville, TN", "Scottsdale, AZ"]
    },
    "propertyType": {
      "type": "string",
      "description": "Type of property to analyze",
      "enum": ["entire_home", "private_room", "any"],
      "default": "entire_home"
    },
    "bedrooms": {
      "type": "number",
      "description": "Number of bedrooms to filter for. Use 0 for studio.",
      "default": null,
      "examples": [1, 2, 3]
    },
    "checkIn": {
      "type": "string",
      "description": "Optional check-in date for seasonal pricing analysis (ISO format YYYY-MM-DD)",
      "default": null
    },
    "checkOut": {
      "type": "string",
      "description": "Optional check-out date for seasonal pricing analysis (ISO format YYYY-MM-DD)",
      "default": null
    }
  },
  "required": ["location"]
}
```

### outputSchema
```json
{
  "type": "object",
  "properties": {
    "location": {
      "type": "string",
      "description": "The analyzed location"
    },
    "dataFreshness": {
      "type": "string",
      "description": "How fresh the underlying data is",
      "enum": ["live", "cached_48h", "cached_7d", "market_estimates_only"]
    },
    "cachedAt": {
      "type": "string",
      "description": "ISO timestamp of when data was cached, null if live"
    },
    "totalListingsAnalyzed": {
      "type": "number",
      "description": "Number of Airbnb listings analyzed in this market"
    },
    "filteredListings": {
      "type": "number",
      "description": "Number of listings matching property type and bedroom filters"
    },
    "revenueEstimate": {
      "type": "object",
      "description": "Estimated annual revenue with confidence interval",
      "properties": {
        "lowEstimate": {
          "type": "number",
          "description": "Conservative annual revenue estimate in USD (25th percentile)"
        },
        "midEstimate": {
          "type": "number",
          "description": "Median annual revenue estimate in USD (50th percentile)"
        },
        "highEstimate": {
          "type": "number",
          "description": "Optimistic annual revenue estimate in USD (75th percentile)"
        },
        "confidenceLevel": {
          "type": "string",
          "description": "How confident the estimate is based on data quality",
          "enum": ["high", "medium", "low"]
        },
        "methodology": {
          "type": "string",
          "description": "Brief explanation of how the estimate was derived"
        }
      },
      "required": ["lowEstimate", "midEstimate", "highEstimate", "confidenceLevel", "methodology"]
    },
    "averageDailyRate": {
      "type": "object",
      "description": "Average Daily Rate (ADR) statistics",
      "properties": {
        "median": { "type": "number", "description": "Median price per night in USD" },
        "percentile25": { "type": "number", "description": "25th percentile price per night" },
        "percentile75": { "type": "number", "description": "75th percentile price per night" }
      },
      "required": ["median", "percentile25", "percentile75"]
    },
    "occupancyEstimate": {
      "type": "object",
      "description": "Estimated occupancy rate based on review velocity model",
      "properties": {
        "estimatedRate": {
          "type": "number",
          "description": "Estimated occupancy rate as decimal (0.0 - 1.0)"
        },
        "confidenceLevel": {
          "type": "string",
          "enum": ["high", "medium", "low"]
        },
        "basedOn": {
          "type": "string",
          "description": "Explanation of the estimation method (review velocity, market averages, etc.)"
        }
      },
      "required": ["estimatedRate", "confidenceLevel", "basedOn"]
    },
    "competitiveSaturation": {
      "type": "object",
      "description": "How saturated the market is with STR listings",
      "properties": {
        "score": {
          "type": "number",
          "description": "Saturation score from 0 (undersupplied) to 100 (oversaturated)"
        },
        "label": {
          "type": "string",
          "description": "Human-readable label",
          "enum": ["undersupplied", "balanced", "competitive", "oversaturated"]
        },
        "totalListings": {
          "type": "number",
          "description": "Total active listings in this market"
        },
        "averageRating": {
          "type": "number",
          "description": "Average rating across all listings"
        },
        "guestFavoritePercent": {
          "type": "number",
          "description": "Percentage of listings with Guest Favorite badge (top performers)"
        }
      },
      "required": ["score", "label", "totalListings", "averageRating", "guestFavoritePercent"]
    },
    "amenityGapAnalysis": {
      "type": "object",
      "description": "Amenities that top performers have vs. average listings",
      "properties": {
        "topPerformerAmenities": {
          "type": "array",
          "description": "Amenities most common among top-rated listings (from image captions)",
          "items": {
            "type": "object",
            "properties": {
              "amenity": { "type": "string", "description": "Amenity name (e.g., 'Pool', 'Hot tub', 'Wifi')" },
              "prevalenceTopPerformers": { "type": "number", "description": "% of top performers with this amenity" },
              "prevalenceAll": { "type": "number", "description": "% of all listings with this amenity" }
            },
            "required": ["amenity", "prevalenceTopPerformers", "prevalenceAll"]
          }
        },
        "recommendedAmenities": {
          "type": "array",
          "description": "Amenities with biggest gap between top performers and average — the best ROI amenities to add",
          "items": { "type": "string" }
        }
      },
      "required": ["topPerformerAmenities", "recommendedAmenities"]
    },
    "topComparables": {
      "type": "array",
      "description": "Top 5 comparable listings for reference",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Listing name" },
          "url": { "type": "string", "description": "Airbnb listing URL" },
          "pricePerNight": { "type": "number", "description": "Price per night in USD" },
          "rating": { "type": "number", "description": "Average rating (0-5)" },
          "reviewCount": { "type": "number", "description": "Total number of reviews" },
          "roomType": { "type": "string", "description": "Type of room (entire_home, private_room)" },
          "isGuestFavorite": { "type": "boolean", "description": "Whether listing has Guest Favorite badge" }
        },
        "required": ["name", "url", "pricePerNight", "rating", "reviewCount", "roomType"]
      }
    },
    "investmentSummary": {
      "type": "string",
      "description": "AI-generated 2-3 sentence investment summary with key takeaways and recommendation"
    }
  },
  "required": [
    "location",
    "dataFreshness",
    "totalListingsAnalyzed",
    "filteredListings",
    "revenueEstimate",
    "averageDailyRate",
    "occupancyEstimate",
    "competitiveSaturation",
    "amenityGapAnalysis",
    "topComparables",
    "investmentSummary"
  ]
}
```

### _meta
```json
{
  "pricing": { "responseUsd": "0.15" },
  "surface": "query",
  "context": ["The tool requires a location string. For best results, include city + state for US locations."]
}
```

---

# PARTE 7: REVENUE ESTIMATION MODEL (O CORE DO PRODUTO)

O modelo de estimativa de receita é o diferencial. NÃO usamos calendar scraping (que o Alex criticou). Em vez disso:

## Review Velocity Model

```
Dado um listing com:
- reviewCount = 663
- listingAge = ~5 anos (estimado pela URL age ou primeiro review date)

1. Reviews por mês = 663 / 60 meses = ~11 reviews/mês
2. Booking rate = reviews/mês ÷ review_rate (0.50-0.70)
   → 11 / 0.60 = ~18.3 bookings/mês
3. Avg stay = checkOut - checkIn do search results (ou default 3.5 noites)
4. Nights booked/mês = 18.3 × 3.5 = ~64 → cap at 30 = 30 nights/mês
5. Occupancy = 30/30 = 100% → este listing é top performer

Para o MERCADO (mediana de todos os listings filtrados):
- Mediana de reviews/mês across all listings
- Apply same model → market occupancy rate
- ADR mediana × occupancy × 365 = annual revenue estimate
```

## Confidence Interval
```
lowEstimate  = ADR_p25 × occupancy_p25 × 365
midEstimate  = ADR_p50 × occupancy_p50 × 365
highEstimate = ADR_p75 × occupancy_p75 × 365

confidenceLevel:
- "high"   = 50+ listings analisados, review data consistente
- "medium" = 20-50 listings, ou dados parciais
- "low"    = <20 listings, ou localidade small/rural
```

## Competitive Saturation Score (0-100)
```
Fatores:
- Densidade de listings (listings per km² baseado em coordenadas)
- % de listings com rating ≥ 4.8 (mercado maduro)
- % de Guest Favorites (competição alta)
- Spread de preço (mercado tight = mais competitivo)

0-25:  "undersupplied"  → oportunidade clara
26-50: "balanced"        → mercado saudável
51-75: "competitive"     → precisa se diferenciar
76-100: "oversaturated"  → alto risco
```

## Amenity Gap Analysis (STRUCTURED — diferencial Tier S)
```
1. Separar listings em "top performers" (rating.guestSatisfaction ≥ 4.8 
   AND reviewCount > mediana) vs "all listings"
2. Ler campo `amenities[]` estruturado de cada listing
   → Cada amenity tem: { title, available: true/false }
   → Categorizado: "Kitchen and dining", "Bedroom and laundry", etc.
3. Contabilizar prevalência de cada amenity em top performers vs all
   Exemplo: Pool presente em 72% dos top performers, 31% de todos
4. Gap = prevalência_top - prevalência_all
5. Top 5 amenidades com maior gap = recomendações de ROI pro investidor
6. Também detectar "Not included" (available: "") — o que falta nos listings ruins

NOTA: Isso é impossível de fazer bem com o fast scraper (caption parsing).
O scraper detalhado retorna amenidades como dados estruturados, o que
torna essa análise confiável e defensável pro Alex.
```

---

# PARTE 8: CTX PROTOCOL SDK — PADRÕES DO SERVER

Mesmos padrões do BidScout e AdWinner. Copiando o que funcionou:

## Dependências
```bash
pnpm add @modelcontextprotocol/sdk @ctxprotocol/sdk express dotenv
pnpm add -D typescript @types/node @types/express tsx
```

## server.ts — Estrutura base (StreamableHTTP — padrão atual CTX)
```typescript
import "dotenv/config";
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { createContextMiddleware } from "@ctxprotocol/sdk";

const app = express();
app.use(express.json());

// Health endpoint (sem auth)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    service: "str-scout", 
    version: "1.0.0", 
    timestamp: new Date().toISOString() 
  });
});

// MCP Server
const server = new Server(
  { name: "str-scout", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case "analyze_str_market":
      return await handleAnalyzeMarket(args);
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// Session management
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Context Protocol middleware — OBRIGATÓRIO pra tools pagas
const verifyContextAuth = createContextMiddleware();

// MCP endpoint — POST (único endpoint, substitui /sse + /messages antigo)
app.post("/mcp", verifyContextAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Sessão existente
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // Nova sessão
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
      },
    });
    await server.connect(transport);
  } else {
    res.status(400).json({ error: "Invalid session" });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// MCP endpoint — GET (pra SSE streaming opcional)
app.get("/mcp", verifyContextAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`STR Scout running on port ${PORT}`);
  console.log(`MCP endpoint: /mcp`);
});
```

**NOTA IMPORTANTE:** O padrão antigo (SSEServerTransport com /sse + /messages) 
ainda é suportado mas NÃO é mais o recomendado. O BidScout e AdWinner usavam SSE.
O STR Scout vai usar StreamableHTTPServerTransport desde o início.
Diferenças chave:
- Endpoint único: `/mcp` (POST + GET) em vez de `/sse` + `/messages`
- Session via header `mcp-session-id` em vez de query param `?sessionId=`
- Import: `StreamableHTTPServerTransport` de `streamableHttp.js`
- Precisa de `isInitializeRequest` e `randomUUID`

## Resposta — Formato obrigatório
```typescript
return {
  content: [
    { 
      type: "text", 
      text: `STR Market Analysis for ${location}:\n\n${investmentSummary}` 
    }
  ],
  structuredContent: {
    location: "Austin, TX",
    dataFreshness: "live",
    cachedAt: null,
    totalListingsAnalyzed: 237,
    filteredListings: 142,
    revenueEstimate: {
      lowEstimate: 38500,
      midEstimate: 52000,
      highEstimate: 71000,
      confidenceLevel: "high",
      methodology: "Review velocity model: median 6.2 reviews/month across 142 entire_home listings, estimated 60% review rate, 3.5 avg night stay. Revenue = ADR × estimated occupancy × 365."
    },
    averageDailyRate: {
      median: 185,
      percentile25: 129,
      percentile75: 267
    },
    // ... rest of structuredContent matching outputSchema exactly
  }
};
```

---

# PARTE 9: APIFY CLIENT — INTEGRAÇÃO

## Chamar o scraper programaticamente
```typescript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

interface ScrapeOptions {
  location: string;
  checkIn?: string;
  checkOut?: string;
  minBedrooms?: number;
  minBathrooms?: number;
  propertyType?: 'entire_home' | 'private_room' | 'any';
}

async function scrapeAirbnbListings(options: ScrapeOptions) {
  const input: Record<string, any> = {
    locationQueries: [options.location],
    locale: 'en-US',
    currency: 'USD',
  };
  
  // Filtros nativos — CRÍTICOS pra manter custo < $0.15
  if (options.minBedrooms) input.minBedrooms = options.minBedrooms;
  if (options.minBathrooms) input.minBathrooms = options.minBathrooms;
  if (options.checkIn) input.checkIn = options.checkIn;
  if (options.checkOut) input.checkOut = options.checkOut;
  
  // Se user não especifica filtro, usar minBedrooms=1 como default
  // pra evitar scrape de 240 results ($0.30)
  if (!options.minBedrooms && !options.minBathrooms) {
    input.minBedrooms = 1; // exclui shared rooms, reduz volume
  }
  
  const run = await client.actor("tri_angle/airbnb-scraper").call(input, {
    timeout: 120, // detalhado é mais lento — precisa de mais tempo
    // NOTA: o timeout de 60s do CTX é pro NOSSO server responder,
    // não pro Apify. Precisamos de cache pra não estourar.
  });
  
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items;
}
```

## Actor ID e chamada
- `tri_angle/airbnb-scraper` → Actor ID: `GsNzxEKzE2vQ5d9HN`
- Chamada: `client.actor("tri_angle/airbnb-scraper").call(input)`

## PROBLEMA DE TIMEOUT
O scraper detalhado abre cada listing — pode levar 2-5 minutos.
O CTX Protocol tem timeout de 60 segundos.

**Solução: PRE-SCRAPE + CACHE OBRIGATÓRIO**
- Opção A: Background job que scrapa mercados populares periodicamente
- Opção B: Primeira query pra uma cidade nova retorna "market_estimates_only" 
  enquanto dispara o scrape async. Próxima query pega cache.
- Opção C: Usar Apify webhooks — dispara scrape, webhook notifica quando pronto,
  salva no cache. User query sempre serve do cache.

**Opção recomendada: B + C combinados.**
1. Query chega → check cache
2. Cache hit → serve dados (< 2s)
3. Cache miss → retorna partial response com dados genéricos + dispara scrape async
4. Scrape completa (webhook) → salva cache
5. Próxima query → cache hit com dados completos
---

# PARTE 10: CACHE STRATEGY

## Por que cache é AINDA MAIS crítico com o scraper detalhado
1. **Economias**: Amortiza custo do Apify ($0.125-0.30) entre múltiplas queries
2. **Resiliência**: Se Apify falhar, serve dados cached (ponto do Alex)
3. **Performance**: Cache hit responde em <2s vs 2-5 MINUTOS do scrape detalhado
4. **Timeout**: Scraper detalhado NUNCA responde em 60s — cache é obrigatório, não opcional

## Implementação
```typescript
// Redis ou PostgreSQL — escolher baseado no que já tem no Railway

interface CachedMarketData {
  location: string;       // normalized key
  listings: AirbnbListing[];
  scrapedAt: string;      // ISO timestamp
  expiresAt: string;      // scrapedAt + 48h
}

// Cache key: normalize location string
function cacheKey(location: string): string {
  return location.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  // "Austin, TX" → "austin-tx"
}

// Check cache before scraping
async function getListings(location: string): Promise<{
  listings: AirbnbListing[];
  dataFreshness: "live" | "cached_48h" | "cached_7d";
  cachedAt: string | null;
}> {
  const key = cacheKey(location);
  const cached = await redis.get(`str:${key}`);
  
  if (cached) {
    const data = JSON.parse(cached) as CachedMarketData;
    const ageHours = (Date.now() - new Date(data.scrapedAt).getTime()) / 3600000;
    
    return {
      listings: data.listings,
      dataFreshness: ageHours <= 48 ? "cached_48h" : "cached_7d",
      cachedAt: data.scrapedAt,
    };
  }
  
  // No cache — scrape fresh
  try {
    const listings = await scrapeAirbnbListings(location);
    
    // Save to cache
    await redis.set(`str:${key}`, JSON.stringify({
      location,
      listings,
      scrapedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
    }), 'EX', 7 * 24 * 3600); // 7 day TTL (serve stale up to 7d)
    
    return { listings, dataFreshness: "live", cachedAt: null };
  } catch (error) {
    // Apify failed — return error
    throw new Error(`Unable to fetch market data for ${location}. Please try again.`);
  }
}
```

---

# PARTE 11: STRUCTURED AMENITY ANALYSIS (TIER S DIFFERENTIATOR)

O scraper detalhado retorna amenidades como dados estruturados. NÃO fazemos caption parsing.

```typescript
interface AmenityValue {
  title: string;
  subtitle?: string;
  icon?: string;
  available: boolean | "";  // "" = not included
}

interface AmenityCategory {
  title: string;  // "Kitchen and dining", "Bedroom and laundry", etc.
  values: AmenityValue[];
}

// Amenidades que mais impactam receita de STR (baseado em pesquisa de mercado)
const HIGH_VALUE_AMENITIES = [
  'Pool', 'Hot tub', 'Air conditioning', 'Wifi', 'Kitchen',
  'Washer', 'Dryer', 'Free parking on premises', 'Paid parking on premises',
  'EV charger', 'Self check-in', 'Gym', 'TV', 'Fireplace',
  'Pets allowed', 'Hot water', 'Coffee maker', 'Patio or balcony',
  'BBQ grill', 'Outdoor dining area', 'Fire pit',
];

function analyzeAmenities(listings: AirbnbListing[]): AmenityGapResult {
  // 1. Dividir em top performers vs all
  const medianReviews = median(listings.map(l => l.rating.reviewsCount));
  const topPerformers = listings.filter(l => 
    l.rating.guestSatisfaction >= 4.8 && l.rating.reviewsCount > medianReviews
  );
  
  // 2. Contar amenidades em cada grupo
  const countAmenities = (group: AirbnbListing[]) => {
    const counts = new Map<string, number>();
    for (const listing of group) {
      const allAmenities = listing.amenities
        .flatMap(cat => cat.values)
        .filter(v => v.available === true)
        .map(v => v.title);
      
      for (const amenity of allAmenities) {
        counts.set(amenity, (counts.get(amenity) || 0) + 1);
      }
    }
    return counts;
  };
  
  const topCounts = countAmenities(topPerformers);
  const allCounts = countAmenities(listings);
  
  // 3. Calcular gap pra HIGH_VALUE_AMENITIES
  const gaps = HIGH_VALUE_AMENITIES.map(amenity => {
    const topPrev = (topCounts.get(amenity) || 0) / topPerformers.length;
    const allPrev = (allCounts.get(amenity) || 0) / listings.length;
    return {
      amenity,
      prevalenceTopPerformers: Math.round(topPrev * 100),
      prevalenceAll: Math.round(allPrev * 100),
      gap: Math.round((topPrev - allPrev) * 100),
    };
  }).sort((a, b) => b.gap - a.gap);
  
  return {
    topPerformerAmenities: gaps.slice(0, 10),
    recommendedAmenities: gaps
      .filter(g => g.gap > 10)  // só recomendar se gap > 10%
      .slice(0, 5)
      .map(g => g.amenity),
  };
}
```

---

# PARTE 12: DEPLOY (Railway)

Mesma abordagem do AdWinner e BidScout.

## Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

## railway.toml
```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

## Environment variables (Railway)
```
PORT=3000
APIFY_TOKEN=<apify_token>
GEMINI_API_KEY=<google_gemini_api_key>
REDIS_URL=<railway_redis_url>
```

---

# PARTE 13: CRONOGRAMA (BUILD FOR TIER S FROM DAY 1)

| Fase | Foco | Entregável |
|------|------|-----------|
| **1 (2-3 dias)** | Schema + boilerplate | outputSchema validado, server.ts base, Apify client testado manualmente, cache layer setup (Redis on Railway) |
| **2 (3-4 dias)** | Core logic | Revenue model (review velocity), saturation scoring, STRUCTURED amenity analysis, Gemini Flash integration |
| **3 (2-3 dias)** | Cache + resilience | Async scrape + webhook pipeline, partial response fallback, dataFreshness field, confidence intervals em tudo |
| **4 (2 dias)** | Deploy + test | Railway deploy, test via CTX Developer Mode, register no marketplace (price $0.00) |
| **5 (1-2 dias)** | Deep Validation | Rodar o [Deep Validation System Prompt](https://github.com/ctxprotocol/sdk/blob/main/docs/mcp-contributor-deep-validation-system-prompt.md) pra QA completo, fix issues |
| **6 (1 dia)** | Pre-seed top markets | Scrape 20-30 mercados populares (Austin, Nashville, Miami, Denver, etc.) pra popular cache antes do review |
| **7** | **PITCH TIER S** | Email pro Alex: "Tool live, implementei os fixes que você pediu (confidence intervals, cache resilience, structured amenity gap), gostaria de ser avaliado pra Tier S" |
| **8 (1 dia)** | Ajustes pós-feedback | Se Alex pedir mudanças, implementar rápido |

**Total: ~12-16 dias**

---

# PARTE 14: RISCOS E MITIGAÇÕES

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Scraper detalhado timeout (2-5min) | CRÍTICO | Cache obrigatório + async scrape + webhook. Query NUNCA espera scrape ao vivo |
| Apify scraper quebra (Airbnb muda selectors) | Alto | Cache 7d fallback, monitorar Apify actor status, ter fast scraper como plano B |
| Revenue estimates imprecisos | Alto | Confidence intervals obrigatórios, methodology transparente, nunca dar número único |
| Schema mismatch (lição do AdWinner) | Alto | Schema-first development, testar structuredContent contra outputSchema antes de deploy |
| Alex nega Tier S upgrade | Médio | Downside é entregar como Tier A — que já tá garantido. $250 seed já recebido. Zero risco |
| Custo > $0.15 sem filtros | Alto | SEMPRE aplicar pelo menos 1 filtro (minBedrooms=1 default), monitorar resultado count |
| Localidades pequenas sem dados | Médio | confidenceLevel "low", mínimo 10 listings, senão "insufficient data" |

---

# PARTE 15: TIER S PITCH STRATEGY

## O que mudou desde o feedback do Alex
O Alex disse: "I have concerns about your technical architecture and data accuracy"

Agora estamos endereçando CADA concern dele:

| Concern do Alex | Nossa solução | Status |
|----------------|---------------|--------|
| "blocked dates ≠ booked dates" | Review velocity model, NÃO usa calendar data | ✅ Solved by design |
| "accuracy risk that could crater user trust" | Confidence intervals em toda estimativa | ✅ Built into outputSchema |
| "Airbnb's anti-bot warfare" | Cache agressivo + async scrape + fallback | ✅ Architecture solves this |
| "no fallback cache for listing data" | 7-day cache TTL + dataFreshness field | ✅ Implemented |
| "amenity gap analysis is genuine value-add" | STRUCTURED amenity data (not caption parsing) | ✅ Upgraded with detailed scraper |
| "add a confidence interval to revenue estimates" | Low/mid/high estimates + confidenceLevel + methodology | ✅ Built into outputSchema |

## Email template pro Alex (Fase 7)
```
Subject: STR Scout — Ready for Review (Requesting Tier S Consideration)

Alex,

STR Scout is live and testable on the marketplace. Here's what I built:

I addressed every concern from your Tier A feedback:
1. Revenue estimation uses review velocity model, NOT calendar scraping — 
   no blocked≠booked problem
2. Every estimate includes confidence intervals (low/mid/high) with 
   methodology explanation
3. Aggressive cache layer with async scraping — cache miss returns partial 
   data + triggers background scrape, next query gets full analysis
4. Amenity gap analysis uses STRUCTURED amenity data from detailed listing 
   scrapes, not image caption parsing

The tool goes beyond what I originally proposed. I believe this meets 
Tier S criteria. Would you consider evaluating for an upgrade?

Test questions:
1. "How much could I earn with a 2-bedroom apartment on Airbnb in Austin, TX?"
2. "Is the Airbnb market in Nashville, TN oversaturated?"
3. "What amenities should I add to maximize my Airbnb revenue in Scottsdale, AZ?"
4. "Compare short-term rental potential for Miami Beach vs Fort Lauderdale"
5. "What's the average daily rate for entire home Airbnb listings in Denver, CO?"

Tool ID: [fill in]
Endpoint: [fill in]
Repo: https://github.com/ArthurRamoss/str-scout

Wallet: 0x330CaB65521F7e406b6123Dd2ED69c2D120a1642

Arthur
```

---

# PARTE 16: TEST QUESTIONS + EXPECTED RESPONSES

## Q1: "How much could I earn with a 2-bedroom apartment on Airbnb in Austin, TX?"
**Expected:** Revenue estimate with confidence interval ($38K-$71K range), ADR stats, occupancy estimate, saturation score, top 5 comparables, investment summary. dataFreshness = "live" or "cached_48h".

## Q2: "Is the Airbnb market in Nashville, TN oversaturated?"
**Expected:** Competitive saturation score (0-100) with label, total listings count, average rating, Guest Favorite %, density analysis. Clear "oversaturated"/"competitive"/"balanced"/"undersupplied" verdict.

## Q3: "What amenities should I add to maximize my Airbnb revenue in Scottsdale, AZ?"
**Expected:** Amenity gap analysis showing top performers vs all listings. Recommended amenities ranked by gap (e.g., "Pool: 72% of top performers vs 31% of all → highest ROI addition").

## Q4: "Compare short-term rental potential for Miami Beach vs Fort Lauderdale"
**Expected:** Side-by-side metrics for both markets. Revenue estimates, ADR, saturation, amenity profiles. Comparative summary.

## Q5: "What's the average daily rate for entire home Airbnb listings in Denver, CO?"
**Expected:** ADR with percentiles (p25/p50/p75). Price distribution. Filtered to entire_home only.

---

# PARTE 17: MARKETPLACE LISTING (pra Step 4 do grant)

**Tool name:** STR Scout
**Description:** Short-term rental market intelligence that replaces AirDNA MarketMinder ($1,200-$12,000/yr). Get estimated annual revenue with confidence intervals, average daily rates, occupancy estimates via review velocity model, competitive saturation scoring, and structured amenity gap analysis for any Airbnb market — all from a single query. Uses detailed listing data including 40+ amenities, rating breakdowns by category, and host metrics.
**Category:** Real Estate & Location
**Response price:** $0.00 (initial testing, change to $0.15 after review)

**Features:**
- Revenue estimation with confidence intervals (low/mid/high) — no calendar scraping
- Competitive saturation scoring (0-100)
- Structured amenity gap analysis (top performers vs market average)
- Detailed rating breakdown (accuracy, cleanliness, communication, location, value)
- Top comparable listings with direct Airbnb links
- AI-generated investment summary
- Cache-first architecture with async data refresh

**Try Asking:**
- "How much could I earn renting a 2-bedroom apartment in Austin TX on Airbnb?"
- "Is the Nashville STR market oversaturated?"
- "What amenities give the best ROI for Airbnb hosts in Scottsdale?"

**Agent Tips:**
- Include city + state for US locations (e.g., "Austin, TX" not just "Austin")
- Specify bedroom count for more accurate filtered results
- Use check-in/check-out dates for seasonal pricing insights
- First query to a new market may return partial data while full analysis caches

---

# PARTE 18: REPOSITÓRIO

```
str-scout/
├── src/
│   ├── server.ts              # Express + MCP + CTX middleware
│   ├── tools/
│   │   ├── index.ts            # TOOLS array com schemas
│   │   └── analyzeMarket.ts    # Handler principal
│   ├── services/
│   │   ├── apify.ts            # Apify client (tri_angle/airbnb-scraper)
│   │   ├── cache.ts            # Redis cache layer
│   │   ├── analysis.ts         # Revenue model, saturation, amenity gap
│   │   └── gemini.ts           # Gemini Flash pra investmentSummary
│   └── types/
│       └── index.ts            # TypeScript types pra listings, output, etc.
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.toml
└── README.md
```

---

# PARTE 19: GEMINI FLASH INTEGRATION

```typescript
// gemini.ts — AI synthesis layer
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateInvestmentSummary(data: {
  location: string;
  revenueEstimate: { lowEstimate: number; midEstimate: number; highEstimate: number };
  averageDailyRate: { median: number };
  occupancyEstimate: { estimatedRate: number };
  competitiveSaturation: { score: number; label: string };
  amenityGapAnalysis: { recommendedAmenities: string[] };
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  const prompt = `You are an STR (short-term rental) investment analyst. 
Given this market data for ${data.location}, write a 2-3 sentence investment summary.
Be specific with numbers. Include the key risk or opportunity.

Revenue estimate: $${data.revenueEstimate.lowEstimate.toLocaleString()}-$${data.revenueEstimate.highEstimate.toLocaleString()}/year
ADR: $${data.averageDailyRate.median}/night
Est. occupancy: ${Math.round(data.occupancyEstimate.estimatedRate * 100)}%
Market saturation: ${data.competitiveSaturation.label} (${data.competitiveSaturation.score}/100)
Top ROI amenities to add: ${data.amenityGapAnalysis.recommendedAmenities.join(', ')}

Write ONLY the summary, no preamble.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
```

## Dependência
```bash
pnpm add @google/generative-ai
```
