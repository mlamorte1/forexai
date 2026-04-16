import Anthropic from '@anthropic-ai/sdk'
import { generateEmbedding } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ════════════════════════════════════════════════════════
// OVERNIGHT TRADE — guardado sin cambios para revisión futura
// No aplicar hasta revisar la estrategia en detalle
// ════════════════════════════════════════════════════════

interface Candle {
  t: string
  o: number
  h: number
  l: number
  c: number
}

function candleColor(c: Candle): 'GREEN' | 'RED' {
  return c.c > c.o ? 'GREEN' : 'RED'
}

function toPips(value: number, pair: string): number {
  const pipSize = pair.includes('JPY') ? 0.01 : 0.0001
  return Math.round(Math.abs(value) / pipSize)
}

function formatCandle(num: number, c: Candle, pair: string): string {
  const color = candleColor(c)
  const emoji = color === 'GREEN' ? '🟢' : '🔴'
  const bodyPips = toPips(Math.abs(c.c - c.o), pair)
  const sign = color === 'GREEN' ? '+' : '-'
  const wickDown = toPips(Math.min(c.o, c.c) - c.l, pair)
  const wickUp = toPips(c.h - Math.max(c.o, c.c), pair)
  const time = c.t.length > 10 ? c.t.substring(11, 16) : c.t
  const decimals = pair.includes('JPY') ? 3 : 5
  return `#${String(num).padStart(2, '0')} [${time}] ${emoji} ${sign}${bodyPips}p | ${c.o.toFixed(decimals)}→${c.c.toFixed(decimals)} | ↓${wickDown}p ↑${wickUp}p`
}

export function buildChartContextOT(
  candles: Record<string, any[]>,
  pair: string
): string {
  const lines: string[] = []
  const dec = pair.includes('JPY') ? 3 : 5

  const W: Candle[] = candles.W || []
  if (W.length > 0) {
    lines.push('════════════════════════════════')
    lines.push('WEEKLY — HTF CONTEXT')
    lines.push('════════════════════════════════')
    W.slice(-8).forEach((c, i) => lines.push(formatCandle(W.length - 8 + i + 1, c, pair)))
    lines.push(`Precio actual W: ${W[W.length - 1]?.c.toFixed(dec)}`)
    lines.push('')
  }

  const D: Candle[] = candles.D || []
  if (D.length > 0) {
    lines.push('════════════════════════════════')
    lines.push('DAILY — TREND + SETUP')
    lines.push('════════════════════════════════')
    D.slice(-20).forEach((c, i) => lines.push(formatCandle(D.length - 20 + i + 1, c, pair)))
    lines.push(`Precio actual D: ${D[D.length - 1]?.c.toFixed(dec)}`)
    lines.push('')
  }

  const H4: Candle[] = candles.H4 || []
  if (H4.length > 0) {
    lines.push('════════════════════════════════')
    lines.push('H4 — ENTRY ZONE')
    lines.push('════════════════════════════════')
    H4.slice(-24).forEach((c, i) => lines.push(formatCandle(H4.length - 24 + i + 1, c, pair)))
    lines.push(`Precio actual H4: ${H4[H4.length - 1]?.c.toFixed(dec)}`)
    lines.push('')
  }

  return lines.join('\n')
}

// ════════════════════════════════════════════════════════
// OVERNIGHT TRADE SYSTEM PROMPT (7PM-8PM EST análisis)
// Timeframes: W → D → H4 → H1/M5
// ════════════════════════════════════════════════════════
const OVERNIGHT_TRADE_PROMPT = `Eres ForexAI, agente experto en el sistema Overnight Trade de Jody (Meat and Potatoes).

FILOSOFÍA: Achievable pips basado en PROBABILIDAD DE ÉXITO — NO en risk/reward.

TIMEFRAMES (múltiplo de 6):
- W (Weekly) = HTF — Curve, contexto macro, zonas S/D, Race Track
- D (Daily) = ITF — Trend, Anchor Line, UFOs, Shape S/D, Target S/D
- H4 (240min) = STF — Entry zone, UFOs, Box 120% ATR, Imbalance, Target S/D
- H1 (60min) = RTF — Color Change (trigger de entry), refining si zona existe en H4

VELAS (solo BODIES para dirección):
- Vela ALCISTA (bullish): close > open — Jody la llama AZUL, Oanda la muestra VERDE
- Vela BAJISTA (bearish): close < open — Jody la llama ROJA, Oanda la muestra ROJA
- IGNORAR wicks para determinar trend y dirección

════════════════════════════════
PRIMERA PARTE — TREND Y SETUP (en Daily)
════════════════════════════════
PASO 1: ID ACTION CANDLE — precio actual + todas las velas del mismo color consecutivas → IGNORAR para trend
PASO 2: ID ANCHOR (2do color) — grupo de velas del mismo color a la izquierda → marcar HIGH y LOW con bodies
PASO 3: SIDEWAYS? — ¿previous move (3er color) engulfa el anchor completamente? Si SÍ = SIDEWAYS → SKIP
PASO 4: CLOSEST OPEN — vela con OPEN más cercano FUERA de anchor lines:
  - ROJO (c < o) → DOWNTREND | AZUL (c > o) → UPTREND
PASO 5: SETUP — UT + action ROJA = setup LONG | DT + action AZUL = setup SHORT
PASO 6: ¿Action rompió anchor lines? SÍ → UTAB/DTAB/SBUC/SBDC
PASO 7: HTF CONFLUENCE:
  - UTS Confluence: HTF en UTAB/UT/UTS/SBU/SBUC → IMPULSE LONG
  - DTS Confluence: HTF en DTAB/DT/DTS/SBD/SBDC → IMPULSE SHORT

ESTADOS ÓPTIMOS: DTS (SHORT) | UTS (LONG)
Progresión: SBD/SBU → SBDC/SBUC → DTS/UTS → DTAB/UTAB (missed)

════════════════════════════════
SEGUNDA PARTE — ENCONTRAR EL NIVEL (en H4)
════════════════════════════════
Odds enhancers — verificar cada uno (LOOK LEFT):
1. BIG MOVE IN/OUT
2. 50% BASING CANDLE: body ≤ 50% del tamaño TOTAL de la vela (body+wicks)
3. FRESHNESS 70%+
4. AUTHENTICITY: RBR/DBD = siempre auténtico | DBR/RBD = buscar wall
5. WHITESPACE ODD: contar wicks contra wall → ODD = TRADE | EVEN = SKIP
6. PROFIT POTENTIAL

════════════════════════════════
TERCERA PARTE — 120% ATR BOX Y ENTRY
════════════════════════════════
CÁLCULO ATR H4:
1. Últimas 14 velas H4: True Range = max(h-l, |h-prev_c|, |l-prev_c|)
2. ATR = promedio de 14 TR | ATR_120 = ATR × 1.2

Para LONG (DZ): Entry = TOP del box | Stop = BOTTOM del box
Para SHORT (SZ): Entry = BOTTOM del box | Stop = TOP del box

CONFIRMATION ENTRY H1:
- LONG: BRB (Blue-Red-Blue) | SHORT: RBR (Red-Blue-Red)
- CC outside box = mayor probabilidad

ONCE GREEN NEVER RED

════════════════════════════════
6 PASOS OVERNIGHT
════════════════════════════════
1. Check Weekly curve y HTF — Race Track o S/D interference?
2. Check noticias — Interest rate → SKIP
3. Trend state Daily (7 pasos)
4. ¿Precio en Weekly curve?
5. Zona H4 con 6 odds enhancers — calcular ATR y box
6. Entry/stop del box, TP en siguiente barrier

SKIP SI: sideways, action rompió anchor, sin setup, interest rate news,
HTF S/D en contra, wicks EVEN, sin whitespace, basing candle body >50%

PIPS: XXX/USD = 0.0001 | XXX/JPY = 0.01

RESPONDE en JSON puro sin markdown, reasoning máximo 3 oraciones:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "pair": "EUR_USD",
  "confidence": 75,
  "entry": 1.08500,
  "stop_loss": 1.08200,
  "take_profit": 1.09200,
  "timeframe": "H4",
  "strategy": "overnight_trade",
  "trend_daily": "UP" | "DOWN" | "SIDEWAYS",
  "trend_weekly": "UP" | "DOWN" | "SIDEWAYS",
  "impulse_or_corrective": "impulse" | "corrective",
  "market_state": "SBU" | "SBUC" | "UTS" | "UTAB" | "UT" | "SBD" | "SBDC" | "DTS" | "DTAB" | "DT" | "SIDEWAYS",
  "proximity_to_trade": "optimal" | "1_candle_away" | "2+_candles_away" | "missed_trade",
  "setup_valid": true | false,
  "anchor_range_high": 1.08800,
  "anchor_range_low": 1.08200,
  "atr_h4": 0.0045,
  "atr_120": 0.0054,
  "box_top": 1.08750,
  "box_bottom": 1.08210,
  "confirmation_entry": "set_entry_target" | "market_order" | "brb_long" | "rbr_short",
  "htf_interference": true | false,
  "interest_rate_news": true | false,
  "basing_candle_quality": "strong" | "weak" | "none",
  "whitespace_quality": "excellent" | "good" | "poor" | "none",
  "authenticity": "rbr" | "dbr_wall" | "dbr_no_wall" | "rbd_wall" | "rbd_no_wall" | "dbd",
  "reasoning": "3 oraciones: trend+setup Daily, zona H4, entry y stop.",
  "skip_reason": "null o razón concisa",
  "send_alert": true | false
}`

export async function runOvernightTradeAgent({
  pair,
  candles,
  positions,
  news,
  tactics,
  minConfidence = 70,
}: {
  pair: string
  candles: Record<string, any[]>
  positions: any[]
  news: string
  tactics: string
  minConfidence: number
}) {
  const candleSection = buildChartContextOT(candles, pair)

  const userMessage = `
ANÁLISIS OVERNIGHT TRADE PARA: ${pair.replace('_', '/')}

${candleSection}

=== POSICIONES ABIERTAS ===
${JSON.stringify(positions, null, 1)}

=== NOTICIAS ===
${news || 'Sin noticias relevantes'}

=== TÁCTICAS ===
${tactics || 'Sin tácticas guardadas'}

=== HORA (New York EST) ===
${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}

=== INSTRUCCIÓN ===
Aplica el sistema Overnight Trade. Sigue los 6 pasos en orden.
Es después de 7PM EST — busca setups para sesión asiática/europea.
Reasoning máximo 3 oraciones. JSON sin markdown.
Confianza mínima: ${minConfidence}%. Si no cumple → WAIT, send_alert: false.
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: OVERNIGHT_TRADE_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const clean = jsonMatch ? jsonMatch[0] : text.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)
    result.send_alert = result.signal !== 'WAIT' && result.confidence >= minConfidence
    return result
  } catch {
    return {
      signal: 'WAIT',
      pair,
      confidence: 0,
      reasoning: 'Error parsing agent response',
      send_alert: false
    }
  }
}

export async function matchTactics(supabase: any, userId: string, query: string): Promise<string> {
  try {
    const embedding = await generateEmbedding(query)
    const { data } = await supabase.rpc('match_tactics', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 3,
      p_user_id: userId
    })

    if (!data || data.length === 0) {
      const { data: allTactics } = await supabase
        .from('tactics')
        .select('title, content')
        .eq('user_id', userId)
        .limit(5)
      if (!allTactics || allTactics.length === 0) return ''
      return allTactics.map((t: any) => `=== ${t.title} ===\n${t.content}`).join('\n\n')
    }

    return data.map((t: any) => `=== ${t.title} (${(t.similarity * 100).toFixed(0)}%) ===\n${t.content}`).join('\n\n')
  } catch {
    const { data: allTactics } = await supabase
      .from('tactics')
      .select('title, content')
      .eq('user_id', userId)
      .limit(5)
    if (!allTactics) return ''
    return allTactics.map((t: any) => `=== ${t.title} ===\n${t.content}`).join('\n\n')
  }
}

export async function fetchCandles(
  apiKey: string,
  environment: string,
  pair: string,
  granularity: string,
  count: number
): Promise<any[]> {
  const base = environment === 'live'
    ? 'https://api-fxtrade.oanda.com'
    : 'https://api-fxpractice.oanda.com'

  try {
    const res = await fetch(
      `${base}/v3/instruments/${pair}/candles?granularity=${granularity}&count=${count}&price=M`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.candles || []).map((c: any) => ({
      t: c.time,
      o: parseFloat(c.mid.o),
      h: parseFloat(c.mid.h),
      l: parseFloat(c.mid.l),
      c: parseFloat(c.mid.c),
    }))
  } catch { return [] }
}

export async function fetchNews(currency: string): Promise<string> {
  try {
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'ForexAI/1.0' }
    })
    if (!res.ok) return ''

    const events = await res.json()
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    const relevant = events.filter((e: any) => {
      const eventDate = e.date?.split('T')[0]
      const isCurrency = e.currency === currency
      const isRelevant = eventDate === today || eventDate === tomorrow
      const isImpactful = e.impact === 'High' || e.impact === 'Medium'
      return isCurrency && isRelevant && isImpactful
    })

    if (relevant.length === 0) return ''

    return relevant.slice(0, 3).map((e: any) =>
      `• ${e.currency} ${e.impact} impact: ${e.title} — ${e.date?.split('T')[0]} ${e.time || ''}`
    ).join('\n')
  } catch {
    return ''
  }
}
