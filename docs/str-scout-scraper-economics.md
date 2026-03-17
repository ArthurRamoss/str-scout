# STR Scout — Análise de Scrapers & Economics
## Atualizado com pricing real (Starter plan, Bronze 50% discount)

---

## SCRAPERS ANALISADOS

### 1. tri_angle/new-fast-airbnb-scraper (O que você achou)
- **Modelo:** Pay per event
- **Preço Free:** $0.50/1K results
- **Preço Starter (Bronze 50%):** ~$0.25/1K results
- **Resultado típico:** ~240 listings por destinação
- **Custo por query (Starter):** 240/1000 × $0.25 = **$0.06**
- **Dados:** Preço/noite, rating (só average), review count, coordenadas, captions de imagem, badges
- **NÃO tem:** Amenidades estruturadas, rating por categoria, host details, bed/bath direto
- **Velocidade:** Rápido (só página de busca, não abre listings)
- **Confiabilidade:** 99.8% runs succeeded, 823 users

### 2. tri_angle/airbnb-scraper (O detalhado da screenshot)
- **Modelo:** Pay per event  
- **Preço Free:** $6.00/1K listings
- **Preço Starter (Bronze 50%):** $2.00/1K listings
- **Enriched listing (host details):** extra $3.35/1K no Starter
- **Actor start:** $0.00009
- **Custo por query (100 listings, SEM enrichment, Starter):** 100/1000 × $2.00 = **$0.20**
- **Custo por query (100 listings, COM enrichment):** $0.20 + $0.335 = **$0.535** ← INVIÁVEL
- **Custo por query (50 listings, SEM enrichment):** $0.10
- **Dados:** TUDO — amenidades estruturadas, rating por categoria, host info, bed/bath, price breakdown
- **Velocidade:** Lento (abre cada listing, 2-5 min)
- **Confiabilidade:** 86.6% runs succeeded (pior), 11.9K users

### 3. sovereigntaylor/airbnb-scraper ⭐ POTENCIAL WINNER
- **Modelo:** Pay per USAGE (usa compute credits do seu plano, SEM taxa por resultado!)
- **Preço:** $0 por resultado — só consome CUs do plano Starter ($29/mo = ~100 CUs)
- **Scrape típico:** ~0.05-0.15 CU por run (estimar, precisa testar)
- **Custo estimado por query:** **$0.01-0.05** (depende do CU consumption)
- **Dados declarados:** Preços, ratings, review counts, amenidades, host info, coordinates, images
- **Filtros:** check-in/out, price range, property type (entire home/private room/shared)
- **Stats:** Novo (não tem rating ainda), mas ativamente mantido
- **RISCO:** Precisa testar pra ver se os dados são completos e confiáveis

### 4. caprolok/airbnb-scraper — DESCARTADO
- $15/month + usage — assinatura mensal mata viabilidade

### 5. curious_coder/airbnb-scraper ("Free Airbnb Scraper")
- 352 users, 5.0 rating
- Precisa verificar se é pay-per-usage ou tem taxa escondida
- Menor comunidade mas rating perfeito

### 6. jupri/airbnb ("Airbnb Explorer")
- 769 users, 5.0 rating — "All-in-One Airbnb.com Scraper"
- Precisa verificar pricing model

---

## ESTRATÉGIA RECOMENDADA: HÍBRIDA

### Opção A: Fast scraper only (margem máxima, dados mínimos)
| Item | Custo (Starter) |
|------|----------------|
| Fast scraper (240 results) | $0.06 |
| Gemini Flash | $0.003 |
| **Total** | **$0.063** |
| Venda a $0.15 (90% share = $0.135) | |
| **Margem** | **$0.072 (53%)** |

Pro: Barato, rápido, margem boa
Contra: Sem amenidades estruturadas (caption parsing only), amenity gap analysis fraco

### Opção B: Detailed scraper only (dados completos, margem apertada)
| Item | Custo (Starter, 100 filtered, sem enrichment) |
|------|----------------------------------------------|
| Detailed scraper | $0.20 |
| Gemini Flash | $0.003 |
| **Total** | **$0.203** |
| Venda a $0.15 | |
| **Margem** | **NEGATIVA (-$0.068)** ← NÃO VIÁVEL a $0.15 |

Pra viabilizar: vender a $0.25? Ou reduzir pra 50 listings ($0.10)?

### Opção C: sovereigntaylor "pay per usage" (SE funcionar)
| Item | Custo estimado |
|------|---------------|
| Scraper (~0.1 CU) | ~$0.03 |
| Gemini Flash | $0.003 |
| **Total** | **~$0.033** |
| Venda a $0.15 (90% share = $0.135) | |
| **Margem** | **~$0.10 (75%)** |

Pro: Margem excelente, sem taxa por resultado, dados completos
Contra: Novo, precisa testar qualidade, pode não ter amenidades tão detalhadas

### Opção D: HÍBRIDA — Fast bulk + Detailed sample ⭐ RECOMENDADA
| Item | Custo (Starter) |
|------|----------------|
| Fast scraper (240 results, market overview) | $0.06 |
| Detailed scraper (top 20 listings only) | 20/1000 × $2.00 = $0.04 |
| Gemini Flash | $0.003 |
| **Total** | **$0.103** |
| Venda a $0.15 (90% share = $0.135) | |
| **Margem** | **$0.032 (24%)** |

Pro: Dados de mercado completos (240 surface) + amenidades reais dos top 20
Contra: Dois scrapes = mais complexidade, mais tempo

### Opção E: Fast + sovereigntaylor pra amenities (SE funcionar)
| Fast scraper (240 results) | $0.06 |
| sovereigntaylor (20 detailed) | ~$0.01 |
| Gemini Flash | $0.003 |
| **Total** | **~$0.073** |
| **Margem** | **~$0.062 (46%)** |

---

## RECOMENDAÇÃO FINAL

### Passo 1: TESTAR o sovereigntaylor/airbnb-scraper HOJE
Roda um test run grátis ($5 free credits) com "Austin, TX" e vê:
- Retorna amenidades estruturadas? (array com available: true/false)
- Quantos resultados retorna?
- Quanto CU consome?
- Qualidade dos dados vs tri_angle?

### Passo 2: Baseado no teste:
- Se sovereigntaylor tem amenidades boas → Opção C ou E (margem 46-75%)
- Se não tem amenidades → Opção D híbrida (margem 24%) 
- Se quer simplificar → Opção A fast only (margem 53%, sem amenity gap detalhado)

### Passo 3: Preço de venda
Com cache (3+ queries por cidade), QUALQUER opção fica lucrativa:
- Opção A com cache 3x: custo $0.023, margem 83%
- Opção D com cache 3x: custo $0.037, margem 73%

O cache transforma economics ruins em excelentes.

---

## PRICING DA QUERY NO CTX MARKETPLACE

**Preço recomendado: $0.15/response**
- Usuário paga $0.15
- CTX fica com 10% = $0.015
- Você recebe 90% = $0.135
- Seu custo: $0.06-0.10 (depende da opção)
- **Margem líquida: $0.035-0.075 por query (26-56%)**
- **Com cache: $0.09-0.12 por query (67-89%)**

Poderia cobrar $0.20? Talvez, mas $0.15 é mais atrativo pra adoção inicial.
O Alex sugeriu $0.10-0.15 na aplicação original.
