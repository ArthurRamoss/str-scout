# STR Scout — Claude Code Development Prompt
# Cola esse arquivo inteiro como prompt inicial no Claude Code.
# O agente vai criar o repo, testar scrapers, e começar a desenvolver.

---

## REGRAS DO AGENTE

1. **SALVE SEU CONTEXTO**: Antes de QUALQUER pausa ou ao final de cada sessão de trabalho, atualize o arquivo `AGENT_CONTEXT.md` na raiz do repositório com: o que foi feito, o que falta, decisões tomadas, problemas encontrados, e próximos passos. Isso é CRÍTICO porque o desenvolvimento continuará em outro computador.

2. **USE CONTEXT7**: Para buscar documentação de qualquer biblioteca (Apify SDK, MCP SDK, CTX Protocol SDK, Express, Google Generative AI, etc.), use o Context7 MCP. Comando: busque a library ID com `resolve-library-id` e depois `query-docs` com a dúvida.

3. **PESQUISE QUANDO TIVER DÚVIDA**: Se algo não funcionar ou você tiver incerteza sobre um comportamento, pesquise antes de assumir. Use web search, Context7, ou leia os docs diretamente.

4. **SCHEMA-FIRST**: Defina o outputSchema ANTES de escrever qualquer lógica. O planning LLM do CTX lê o schema pra gerar código. Schema errado = retry loops de 30-60s cada.

5. **TESTE TUDO**: Teste cada componente individualmente antes de integrar. Teste o Apify client, teste o cache, teste o analysis engine, teste o Gemini client. Depois integre.

6. **COMMITS FREQUENTES**: Faça commits pequenos e descritivos. Um commit por feature/fix.

---

## FASE 0: SETUP DO REPOSITÓRIO

### 0.1 Criar repositório privado no GitHub via CLI
```bash
mkdir str-scout && cd str-scout
git init
gh repo create ArthurRamoss/str-scout --private --source=. --push
```

Se `gh` não estiver instalado, instale com `brew install gh` ou o equivalente, e faça login com `gh auth login`.

### 0.2 Inicializar o projeto TypeScript
```bash
pnpm init
pnpm add @modelcontextprotocol/sdk @ctxprotocol/sdk express dotenv apify-client @google/generative-ai ioredis
pnpm add -D typescript @types/node @types/express tsx
```

### 0.3 Criar tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

### 0.4 Criar package.json scripts
```json
{
  "name": "str-scout",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "build": "tsc",
    "test:apify": "tsx src/tests/test-apify.ts",
    "test:analysis": "tsx src/tests/test-analysis.ts"
  }
}
```

### 0.5 Criar .env (NÃO commitar)
```
PORT=3000
APIFY_TOKEN=<pedir pro arthur>
GEMINI_API_KEY=<pedir pro arthur>
REDIS_URL=<configurar depois no Railway>
```

### 0.6 Criar .gitignore
```
node_modules/
dist/
.env
*.log
```

### 0.7 Criar AGENT_CONTEXT.md na raiz
```markdown
# STR Scout — Agent Development Context
## Atualizado em: [data atual]

### Status atual
- [ ] Fase 0: Setup
- [ ] Fase 1: Testes de scrapers
- [ ] Fase 2: Schemas e boilerplate
- [ ] Fase 3: Core logic
- [ ] Fase 4: Integração
- [ ] Fase 5: Deploy
- [ ] Fase 6: Deep Validation
- [ ] Fase 7: Pitch Tier S

### Decisões tomadas
(preencher conforme avança)

### Problemas encontrados
(preencher conforme avança)

### Próximos passos
Testar scrapers do Apify pra definir custo real.
```

### 0.8 Estrutura de pastas
```
str-scout/
├── src/
│   ├── server.ts
│   ├── tools/
│   │   ├── index.ts
│   │   └── analyzeMarket.ts
│   ├── services/
│   │   ├── apify.ts
│   │   ├── cache.ts
│   │   ├── analysis.ts
│   │   └── gemini.ts
│   ├── types/
│   │   └── index.ts
│   └── tests/
│       ├── test-apify.ts
│       └── test-analysis.ts
├── AGENT_CONTEXT.md
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.toml
├── .env
├── .gitignore
└── README.md
```

---

## FASE 1: TESTES DE SCRAPERS (FAZER PRIMEIRO, ANTES DE CODAR QUALQUER COISA)

O objetivo é descobrir qual scraper do Apify dá a melhor relação custo/qualidade.
O Arthur tem plano Starter (Bronze 50% discount) com $29/mês de créditos.

### Candidatos a testar (em ordem de prioridade)

**1. `tri_angle/new-fast-airbnb-scraper`** (baseline — mais barato)
- Modelo: Pay per event, ~$0.25/1K results no Starter
- Retorna ~240 listings por destinação
- Custo estimado: ~$0.06/query
- NÃO retorna amenidades estruturadas (só captions de imagem)

**2. `sovereigntaylor/airbnb-scraper`** (potencial winner — pay per usage)
- Modelo: Pay per USAGE (consome CUs do plano, SEM taxa extra por resultado)
- Custo estimado: ~$0.01-0.05 por query (depende do CU)
- PRECISA verificar: retorna amenidades estruturadas? Rating detalhado?

**3. `curious_coder/airbnb-scraper`** (backup — rated 5.0, "Free")
- 352 users, rating 5.0
- Verificar modelo de pricing e dados retornados

**4. `tri_angle/airbnb-scraper`** (detalhado — referência de qualidade)
- $2.00/1K no Starter (CARO mas dados completos)
- Retorna amenidades estruturadas, rating por categoria, host details
- Usar como REFERÊNCIA de qualidade, não como scraper principal

### Script de teste — criar `src/tests/test-apify.ts`

```typescript
import { ApifyClient } from 'apify-client';
import * as fs from 'fs';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const SCRAPERS = [
  { name: 'fast', actorId: 'tri_angle/new-fast-airbnb-scraper' },
  { name: 'sovereigntaylor', actorId: 'sovereigntaylor/airbnb-scraper' },
  { name: 'curious_coder', actorId: 'curious_coder/airbnb-scraper' },
];

async function testScraper(scraperName: string, actorId: string) {
  console.log(`\n=== Testing ${scraperName} (${actorId}) ===`);
  
  const startTime = Date.now();
  
  try {
    const run = await client.actor(actorId).call({
      locationQueries: ['Austin, TX'],
      locale: 'en-US',
      currency: 'USD',
      minBedrooms: 2,  // filter pra reduzir volume
    }, { timeout: 180 });
    
    const elapsed = (Date.now() - startTime) / 1000;
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    console.log(`Results: ${items.length}`);
    console.log(`Time: ${elapsed}s`);
    console.log(`Usage USD: ${run.usageTotalUsd || 'check console'}`);
    
    // Salvar amostra pra análise
    const sample = items.slice(0, 3);
    fs.writeFileSync(
      `src/tests/sample-${scraperName}.json`,
      JSON.stringify(sample, null, 2)
    );
    
    // Checklist de dados
    const first = items[0] as any;
    console.log('\n--- Data Quality Check ---');
    console.log(`Has price: ${!!first?.price || !!first?.pricing}`);
    console.log(`Has rating: ${!!first?.rating}`);
    console.log(`Has reviewCount: ${!!first?.rating?.reviewsCount || !!first?.rating?.reviewCount}`);
    console.log(`Has coordinates: ${!!first?.coordinates}`);
    console.log(`Has amenities (structured): ${!!first?.amenities && Array.isArray(first.amenities)}`);
    console.log(`Has host info: ${!!first?.host}`);
    console.log(`Has roomType: ${!!first?.roomType}`);
    console.log(`Has images: ${!!first?.images}`);
    console.log(`Has badges: ${!!first?.badges}`);
    
    // Se tem amenities, mostrar estrutura
    if (first?.amenities && Array.isArray(first.amenities)) {
      console.log(`\nAmenities structure (first category):`);
      console.log(JSON.stringify(first.amenities[0], null, 2));
    }
    
    return { scraperName, results: items.length, elapsed, sample };
  } catch (error: any) {
    console.error(`FAILED: ${error.message}`);
    return { scraperName, error: error.message };
  }
}

async function main() {
  console.log('STR Scout — Apify Scraper Comparison Test');
  console.log('Location: Austin, TX | Filter: minBedrooms=2\n');
  
  // Testar um por vez pra não gastar demais
  // Começar pelo mais promissor
  const results = [];
  
  for (const scraper of SCRAPERS) {
    const result = await testScraper(scraper.name, scraper.actorId);
    results.push(result);
    
    // Pausa entre testes
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Resumo
  console.log('\n\n=== RESUMO ===');
  for (const r of results) {
    if ('error' in r) {
      console.log(`${r.scraperName}: FAILED — ${r.error}`);
    } else {
      console.log(`${r.scraperName}: ${r.results} results in ${r.elapsed}s`);
    }
  }
}

main().catch(console.error);
```

**IMPORTANTE**: Rode os testes UM POR VEZ se quiser economizar créditos. Comece pelo `sovereigntaylor`. Se ele retornar amenidades estruturadas, é o winner.

### Decisão pós-teste

Baseado nos resultados, escolha UMA das estratégias:

| Se... | Então usar... | Custo estimado |
|-------|--------------|---------------|
| sovereigntaylor tem amenidades + barato | sovereigntaylor only | ~$0.03/query |
| sovereigntaylor não tem amenidades | fast (bulk) + detailed (amostra top 20) | ~$0.10/query |
| Nenhum alternativo funciona | fast only + caption parsing | ~$0.06/query |

Atualize o AGENT_CONTEXT.md com a decisão e os números reais.

---

## FASE 2: SCHEMAS E BOILERPLATE

### 2.1 Definir os types (`src/types/index.ts`)

Use Context7 pra buscar docs do `@modelcontextprotocol/sdk` se precisar.

Crie interfaces pra:
- `AirbnbListing` — o que vem do scraper (varia por scraper, usar os samples da Fase 1)
- `MarketAnalysis` — o output estruturado que retornamos (DEVE bater 100% com outputSchema)
- `CachedMarketData` — o que guardamos no cache
- `ScrapeOptions` — input pro Apify client

### 2.2 Definir TOOLS com outputSchema (`src/tools/index.ts`)

O outputSchema é o item MAIS CRÍTICO. O planning LLM do CTX lê esse schema pra gerar código TypeScript que processa a resposta. Se uma property name estiver errada, gera retry loop de 30-60s.

**REGRAS DO outputSchema:**
- Documentar TODA property com `description`
- Usar camelCase (o planning LLM assume camelCase)
- `items.properties` pra arrays — nunca só `{ type: "array" }`
- Incluir `required` em todo objeto
- Tipos EXATOS — se é number, retorne number (não string)

O schema completo do `analyze_str_market` está no plano (PARTE 6).
Copie fielmente e ajuste se necessário baseado no scraper escolhido.

### 2.3 Criar server.ts base

**PADRÃO ATUAL DO CTX: StreamableHTTPServerTransport (NÃO SSE)**

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
```

- Endpoint único: `POST /mcp` e `GET /mcp`
- Session via header `mcp-session-id`
- `createContextMiddleware()` como middleware em `/mcp`
- Health endpoint em `GET /health` SEM auth
- `isInitializeRequest(req.body)` pra detectar sessão nova

**Confirme que isso está atualizado**: Use Context7 pra buscar a doc do `@ctxprotocol/sdk` e `@modelcontextprotocol/sdk` e validar os imports corretos.

### 2.4 Testar localmente

```bash
pnpm dev
# Em outro terminal:
curl http://localhost:3000/health
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}'
```

O `initialize` deve funcionar sem auth.
O `tools/list` também funciona sem auth.
O `tools/call` retorna `{"error":"Unauthorized"}` — isso é ESPERADO (middleware ativo).

Pra testar `tools/call` localmente, temporariamente remova o `verifyContextAuth` do middleware no POST /mcp. LEMBRE DE RESTAURAR ANTES DO DEPLOY.

---

## FASE 3: CORE LOGIC

### 3.1 Apify service (`src/services/apify.ts`)
- Wrapper pro scraper escolhido na Fase 1
- SEMPRE aplicar pelo menos 1 filtro (ex: `minBedrooms: 1`) pra reduzir custo
- Timeout de 120s no Apify call
- Error handling robusto — se falhar, throw com mensagem clara

### 3.2 Cache service (`src/services/cache.ts`)
- Redis (via ioredis) OU simple in-memory Map (pra dev)
- Cache key: location normalizado (lowercase, trim, replace spaces)
- TTL: 48h pra dados "fresh", serve até 7d como "stale"
- Campo `dataFreshness`: "live" | "cached_48h" | "cached_7d" | "market_estimates_only"
- Se Redis não disponível (dev), fallback pra Map em memória

### 3.3 Analysis engine (`src/services/analysis.ts`)

**Revenue Estimation Model (Review Velocity):**
- NÃO usa calendar scraping (blocked ≠ booked)
- `reviewCount / estimatedMonths = reviews/month`
- `bookings/month = reviews/month ÷ 0.60` (60% review rate)
- `nights/month = bookings × avg_stay (default 3.5)`
- `occupancy = nights/month / 30` (cap at 1.0)
- `annual_revenue = ADR × occupancy × 365`
- SEMPRE retornar low/mid/high (p25/p50/p75)

**Competitive Saturation Score (0-100):**
- Baseado em: density de listings, % com rating ≥ 4.8, spread de preço
- Labels: undersupplied (0-25), balanced (26-50), competitive (51-75), oversaturated (76-100)

**Amenity Gap Analysis:**
- Se scraper retorna amenidades estruturadas: contabilizar prevalência por amenidade em top performers vs all
- Se só tem captions: parsear keywords das captions de imagem
- Top 5 amenidades com maior gap = recomendações

### 3.4 Gemini service (`src/services/gemini.ts`)
- Google Generative AI SDK, modelo `gemini-2.0-flash`
- Input: dados já processados (revenue estimate, saturation, amenities)
- Output: 2-3 frases de investmentSummary
- Prompt focado e curto — Flash é bom pra síntese rápida

---

## FASE 4: INTEGRAÇÃO E TESTES

### 4.1 Handler principal (`src/tools/analyzeMarket.ts`)
- Recebe args do MCP (location, propertyType, bedrooms, checkIn, checkOut)
- Check cache → se hit, usa cached data
- Se cache miss → chama Apify → salva no cache
- Roda analysis engine sobre os dados
- Chama Gemini pra investmentSummary
- Retorna `{ content: [text], structuredContent: {...} }`
- structuredContent DEVE bater 100% com outputSchema

### 4.2 Testes end-to-end
- Criar `src/tests/test-analysis.ts` que roda a pipeline inteira com dados mockados
- Validar que structuredContent bate com outputSchema (comparar tipos)
- Verificar response < 60s

---

## FASE 5: DEPLOY

### 5.1 Dockerfile
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

### 5.2 railway.toml
```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### 5.3 Environment variables no Railway
```
PORT=3000
APIFY_TOKEN=xxx
GEMINI_API_KEY=xxx
REDIS_URL=xxx (criar Redis addon no Railway)
```

### 5.4 Deploy e verificar
```bash
git add . && git commit -m "Ready for deploy"
git push origin main
# Deploy via Railway dashboard ou CLI
```

Verificar:
- `curl https://YOUR-URL/health` retorna 200
- Initialize via curl funciona
- tools/list retorna o schema correto

---

## FASE 6: REGISTRO NO MARKETPLACE E DEEP VALIDATION

### 6.1 Registrar em ctxprotocol.com/contribute
- Paste endpoint URL: `https://YOUR-URL.railway.app/mcp`
- Use o MCP Server Analysis Prompt pra gerar nome/descrição/categoria
- Price: $0.00 (inicial, pra testing)
- Add stake ($10 USDC mínimo)

### 6.2 Testar via Developer Mode
- Settings → Developer Settings → Enable Developer Mode
- Selecionar STR Scout no sidebar tool selector
- Mandar query: "How much could I earn with a 2BR apartment in Austin TX on Airbnb?"
- Verificar Developer Logs pra erros

### 6.3 Deep Validation
Usar o prompt de: https://github.com/ctxprotocol/sdk/blob/main/docs/mcp-contributor-deep-validation-system-prompt.md
Rodar validação completa e corrigir issues.

### 6.4 Pre-seed cache
Scrape 20-30 mercados populares pra popular cache ANTES do review:
Austin TX, Nashville TN, Miami Beach FL, Denver CO, Scottsdale AZ,
San Diego CA, New Orleans LA, Savannah GA, Charleston SC, Asheville NC,
Portland OR, Seattle WA, Key West FL, Honolulu HI, Park City UT,
Joshua Tree CA, Gatlinburg TN, Destin FL, Myrtle Beach SC, Sedona AZ

---

## FASE 7: PITCH TIER S

### 7.1 Enviar email pro Alex
```
To: grants@ctxprotocol.com
Subject: STR Scout — Ready for Review (Requesting Tier S Consideration)

Alex,

STR Scout is live and testable on the marketplace.

I addressed every concern from your Tier A feedback:
1. Revenue estimation uses review velocity model, NOT calendar scraping
2. Every estimate includes confidence intervals (low/mid/high) with methodology
3. Cache layer with fallback — cache miss returns partial data + triggers background refresh
4. Structured amenity gap analysis from real listing data

Tool ID: [fill in]
Endpoint: [fill in]
Repo: https://github.com/ArthurRamoss/str-scout

Test questions:
1. "How much could I earn with a 2-bedroom apartment on Airbnb in Austin, TX?"
2. "Is the Airbnb market in Nashville, TN oversaturated?"
3. "What amenities should I add to maximize my Airbnb revenue in Scottsdale, AZ?"
4. "Compare short-term rental potential for Miami Beach vs Fort Lauderdale"
5. "What's the average daily rate for entire home Airbnb listings in Denver, CO?"

Wallet: 0x330CaB65521F7e406b6123Dd2ED69c2D120a1642

Arthur
```

---

## REFERÊNCIA TÉCNICA — CTX PROTOCOL

### Transport: StreamableHTTPServerTransport (OBRIGATÓRIO)
- Import: `@modelcontextprotocol/sdk/server/streamableHttp.js`
- Endpoint: `/mcp` (POST + GET)
- NÃO usar SSEServerTransport (padrão antigo)
- Session management via `mcp-session-id` header
- `isInitializeRequest(req.body)` pra criar sessão nova

### Middleware de segurança
```typescript
import { createContextMiddleware } from "@ctxprotocol/sdk";
const verifyContextAuth = createContextMiddleware();
app.post("/mcp", verifyContextAuth, handler);
app.get("/mcp", verifyContextAuth, handler);
```

### Formato de resposta (OBRIGATÓRIO pra tools pagas)
```typescript
return {
  content: [{ type: "text", text: "..." }],      // human-readable
  structuredContent: { ... },                       // DEVE bater com outputSchema
};
```

### outputSchema — regras
- Documentar TODA property name com `description`
- Usar camelCase (planning LLM assume JS convention)
- `items.properties` pra arrays
- `required` em todo objeto
- Tipos exatos: number é number, string é string
- Aim for payloads < 500K chars

### _meta no tool definition
```typescript
{
  name: "analyze_str_market",
  description: "...",
  inputSchema: { ... },
  outputSchema: { ... },
  _meta: {
    rateLimit: {
      maxRequestsPerMinute: 10,
      cooldownMs: 6000,
      maxConcurrency: 1,
      supportsBulk: false,
      notes: "Apify scraper has ~45s latency. Cache serves in <2s."
    }
  }
}
```

### MCP Security Model
| Método | Auth | Nota |
|--------|------|------|
| initialize | NÃO | Setup de sessão |
| tools/list | NÃO | Discovery — agentes precisam ver schemas |
| tools/call | SIM | Execução — custa dinheiro |

### Staking
- Mínimo $10 USDC pra tools pagas
- Refundável com 7 dias de delay

### Deploy requirements
- HTTPS obrigatório (Railway provê automaticamente)
- Health endpoint em `/health`
- Response < 60 segundos

---

## REFERÊNCIA TÉCNICA — APIFY

### Input schema do fast scraper
```json
{
  "locationQueries": ["Austin, TX"],
  "locale": "en-US",
  "currency": "USD",
  "minBedrooms": 2,
  "minBathrooms": 1,
  "checkIn": "2026-04-01",
  "checkOut": "2026-04-06",
  "priceMin": 50,
  "priceMax": 500
}
```

### Chamar via SDK
```typescript
import { ApifyClient } from 'apify-client';
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor("ACTOR_ID").call(input, { timeout: 120 });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

---

## REGRAS DE MARGEM — NÃO VIOLAR

| Regra | Detalhe |
|-------|---------|
| Custo max por query | $0.12 (sem cache) |
| Preço de venda | $0.15 |
| Revenue (90% share) | $0.135 |
| Margem mínima aceitável | 15% ($0.02) |
| SEMPRE usar filtros | reduz volume de resultados e custo |
| Cache é obrigatório | amortiza custo entre queries |

Se descobrir que o custo por query é > $0.12, PARE e ajuste a estratégia (scraper diferente, menos resultados, pricing mais alto).

---

## LINKS IMPORTANTES

- CTX Protocol Docs: https://docs.ctxprotocol.com
- Build Tools Guide: https://docs.ctxprotocol.com/guides/build-tools
- Quickstart: https://docs.ctxprotocol.com/guides/quickstart
- Tool Metadata: https://docs.ctxprotocol.com/guides/tool-metadata
- Troubleshooting: https://docs.ctxprotocol.com/guides/troubleshooting
- SDK Reference: https://docs.ctxprotocol.com/sdk/reference
- Protocol Architecture: https://docs.ctxprotocol.com/architecture/protocol
- Grant Page: https://docs.ctxprotocol.com/grants
- Deep Validation Prompt: https://github.com/ctxprotocol/sdk/blob/main/docs/mcp-contributor-deep-validation-system-prompt.md
- MCP Server Analysis Prompt: https://github.com/ctxprotocol/sdk/blob/main/docs/mcp-server-analysis-prompt.md
- MCP Builder Template: https://github.com/ctxprotocol/sdk/blob/main/docs/mcp-builder-template.md
- Example Servers: https://github.com/ctxprotocol/sdk/tree/main/examples/server
- Apify Airbnb Scrapers: https://apify.com/store?search=airbnb
- AdWinner (referência, projeto anterior): https://github.com/ArthurRamoss/AdWinner-Intel
- BidScout (referência, projeto anterior): https://github.com/ArthurRamoss/bidscout-intel

---

## CONTEXTO DO PROJETO (pra o agente entender o "porquê")

Este é um projeto de grant do Context Protocol — um marketplace de MCP servers onde AI agents pagam por dados. O desenvolvedor (Arthur/Ramos) já tem 2 tools aprovadas (AdWinner e BidScout Intel) e está construindo a terceira.

O STR Scout substitui o AirDNA MarketMinder ($1,200-$12,000/year) por queries de $0.15.
O grant foi aprovado como Tier A ($500), mas a estratégia é entregar com qualidade Tier S ($1,000) e pedir upgrade.

O feedback do Alex (grant manager) foi claro:
1. Não usar calendar scraping (blocked ≠ booked) → usar review velocity model
2. Adicionar confidence intervals em toda estimativa
3. Ter fallback cache pra quando Apify falhar
4. A amenity gap analysis e competitive saturation scoring são os diferenciais

O Arthur tem plano Starter do Apify ($29/mês, Bronze 50% discount).
Usar Gemini 2.0 Flash (não Claude) pra AI synthesis — 10-20x mais barato.
Deploy no Railway Pro (US region) — mesmo stack do AdWinner e BidScout.
