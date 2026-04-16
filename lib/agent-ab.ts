import Anthropic from '@anthropic-ai/sdk'
import { generateEmbedding } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ════════════════════════════════════════════════════════
// CHART CONTEXT BUILDER — ANCHOR BREAK
// Solo formatea las velas en texto legible.
// El agente hace TODO el análisis aplicando los 7 pasos de Jody.
// ════════════════════════════════════════════════════════

interface Candle {
  t: string
  o: number
  h: number
  l: number
  c: number
}

function candleColor(c: Candle): 'GREEN' | 'RED' {
  return c.c >= c.o ? 'GREEN' : 'RED'
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

export function buildChartContextAB(
  candles: Record<string, any[]>,
  pair: string
): string {
  const lines: string[] = []
  const dec = pair.includes('JPY') ? 3 : 5

  // H3: HTF — el agente aplica los 7 pasos para determinar trend state
  const H3: Candle[] = candles.H3 || []
  if (H3.length > 0) {
    lines.push('════════════════════════════════')
    lines.push('H3 — HTF (aplica 7 pasos de Jody para determinar trend state)')
    lines.push('════════════════════════════════')
    // Mostrar las últimas 24 velas H3 para contexto
    const startH3 = Math.max(0, H3.length - 24)
    H3.slice(startH3).forEach((c, i) => {
      lines.push(formatCandle(i + 1, c, pair))
    })
    lines.push(`Precio actual H3: ${H3[H3.length - 1]?.c.toFixed(dec)}`)
    lines.push('')
  }

  // M30: ITF — el agente identifica el corrective move, anchor y AB
  const M30: Candle[] = candles.M30 || []
  if (M30.length > 0) {
    lines.push('════════════════════════════════')
    lines.push('M30 — ITF (identifica corrective move, anchor y anchor break)')
    lines.push('════════════════════════════════')
    // Mostrar todas las velas disponibles numeradas
    M30.forEach((c, i) => {
      lines.push(formatCandle(i + 1, c, pair))
    })
    lines.push(`Precio actual M30: ${M30[M30.length - 1]?.c.toFixed(dec)}`)
    lines.push('')
  }

  // M5: LTF — el agente baja a M5 para entry y stop precisos
  const M5: Candle[] = candles.M5 || []
  if (M5.length > 0) {
    lines.push('════════════════════════════════')
    lines.push('M5 — LTF (entry exacto, stop beyond pivot del anchor en M5)')
    lines.push('════════════════════════════════')
    M5.forEach((c, i) => {
      lines.push(formatCandle(i + 1, c, pair))
    })
    lines.push(`Precio actual M5: ${M5[M5.length - 1]?.c.toFixed(dec)}`)
    lines.push('')
  }

  return lines.join('\n')
}

// ════════════════════════════════════════════════════════
// ANCHOR BREAK SYSTEM PROMPT
// El agente aplica los 7 pasos de Jody directamente sobre
// las velas formateadas. Sin dependencia del pre-procesador.
// ════════════════════════════════════════════════════════
const ANCHOR_BREAK_PROMPT = `Eres ForexAI, agente experto en el sistema Anchor Break de Jody.

TIMEFRAMES:
- HTF = H3 → trend state (7 pasos de Jody)
- ITF = M30 → corrective move + anchor + anchor break
- LTF = M5 → entry exacto + stop beyond pivot

CÓMO LEER LAS VELAS:
Recibes velas numeradas cronológicamente en este formato:
#01 [08:30] 🟢 +7p | 1.17210→1.17280 | ↓3p ↑5p

Donde:
- #01 = número de vela (la más antigua primero)
- [08:30] = hora UTC de apertura
- 🟢/🔴 = color (🟢 = alcista c>o = Jody AZUL | 🔴 = bajista c<o = Jody ROJA)
- +7p/-7p = tamaño del body en pips
- 1.17210→1.17280 = open→close
- ↓3p ↑5p = wick inferior y superior en pips

TU TRABAJO: leer estas velas como si fueras Jody viendo el chart y aplicar
sus reglas exactamente. NO dependas de ningún pre-procesador — el análisis
es completamente tuyo.

════════════════════════════════════════════════════════
PRE-ANÁLISIS — 3 KEYS (verificar ANTES de cualquier setup)
════════════════════════════════════════════════════════

KEY 1 — HEATMAP/NOTICIAS:
- ¿Hay noticias de alto impacto hoy para este par? → reducir confidence o SKIP
- Interest rate news → SKIP siempre

KEY 2 — DOLLAR (DXY):
- Si el par contiene USD: ¿el dólar va EN FAVOR o EN CONTRA del trade?
  * BUY EUR/USD = necesitas dólar débil | SELL EUR/USD = dólar fuerte
  * BUY USD/CAD = necesitas dólar fuerte | SELL USD/CAD = dólar débil
- Para pares sin USD (EUR/JPY, AUD/JPY etc.) → ignorar este check

KEY 3 — RACETRACK:
- ¿El precio está en impulso fuerte sin pausas?
- Entrar INTO un Race Track → SKIP o reducir TP significativamente

════════════════════════════════════════════════════════
PASO 1 — ANALIZAR H3 (HTF): DETERMINAR TREND STATE
Aplica los 7 pasos de Jody usando solo BODIES (ignorar wicks):
════════════════════════════════════════════════════════

1. ID ACTION CANDLE: vela actual + mismo color consecutivo → IGNORAR para trend
2. ID ANCHOR (2do color): grupo de velas del mismo color a la izquierda de la action
   → Marcar body_high y body_low del anchor
3. SIDEWAYS?: ¿el previous move (3er color) engulfa el anchor?
   → SÍ = sideways, continuar para bias | NO = UT o DT claro
4. CLOSEST OPEN: vela con open más cercano FUERA de las anchor lines
   → ROJA (c<o) = DOWNTREND | AZUL (c>o) = UPTREND
5. SETUP?: UT + action roja = setup LONG | DT + action azul = setup SHORT
6. ¿Action rompió anchor?: UTS→UTAB | DTS→DTAB | SBU→SBUC | SBD→SBDC
7. HTF CONFLUENCE:
   → UTS Confluence: HTF en UTAB/UT/UTS/SBU/SBUC = going UP = IMPULSE LONG (2:1)
   → DTS Confluence: HTF en DTAB/DT/DTS/SBD/SBDC = going DOWN = IMPULSE SHORT (2:1)
   → Sin confluencia = CORRECTIVE = 1:1 máximo o SKIP

ESTADOS VÁLIDOS PARA TRADE:
- LONG: UTS, UTAB, SBUC
- SHORT: DTS, DTAB, SBDC
- SKIP: UTNS, DTNS (sin setup activo)

════════════════════════════════════════════════════════
PASO 2 — ANALIZAR M30 (ITF): IDENTIFICAR CORRECTIVE MOVE Y ANCHOR BREAK
════════════════════════════════════════════════════════

CORRECTIVE MOVE:
- Es el movimiento en M30 que va CONTRA el trend del H3
- Si H3 es uptrend → corrective move es bajista (velas rojas dominan)
- Si H3 es downtrend → corrective move es alcista (velas verdes dominan)
- El corrective move puede tener interrupciones pequeñas del color opuesto
- Lo que importa es la DIRECCIÓN PREDOMINANTE del movimiento, no la consecutividad estricta

ANCHOR:
- Es el grupo de velas al FINAL del corrective move, justo antes de la vela de ruptura
- Puede ser 1 sola vela o varias velas del mismo color
- El PIVOT es el wick más extremo del anchor:
  * Para AB BUY: el wick "l" (low) más bajo del anchor
  * Para AB SELL: el wick "h" (high) más alto del anchor
⚠️ El pivot es del ANCHOR específicamente — NO del corrective move completo

VELAS DE RUPTURA (BREAK):
- Velas consecutivas del MISMO COLOR sin interrupción que rompen el anchor
- ⚠️ UNA SOLA vela del color opuesto entre las break candles = combinación ROTA = NO es AB
- La última vela del break DEBE cerrar (close) POR FUERA del body del anchor:
  * AB BUY: close > body_high más alto del anchor
  * AB SELL: close < body_low más bajo del anchor
- ⚠️ El wick NO cuenta para confirmar ruptura — solo el CLOSE

LEVEL BREAKS:
- Cuenta cuántos body_highs del anchor superó el close final (para BUY)
- Cuenta cuántos body_lows del anchor rompió el close final (para SELL)
- Mínimo 2 level breaks para AB válido

FRESCURA (FRESHNESS):
- Cuenta las velas M30 desde la vela de ruptura hasta la última vela disponible
- Si hay MÁS DE 3 velas desde el break → setup STALE → WAIT obligatorio
- Ejemplo: break en vela #57, última vela #60 → 3 velas → VÁLIDO
- Ejemplo: break en vela #50, última vela #60 → 10 velas → STALE → WAIT

════════════════════════════════════════════════════════
PASO 3 — BAJAR A M5 (LTF): ENTRY Y STOP PRECISOS
════════════════════════════════════════════════════════

Una vez identificado el AB en M30, OBLIGATORIO bajar a M5:
- Aplica los mismos 7 pasos de Jody en M5 dentro de la zona del pivot de M30
- Identifica el anchor exacto en M5
- Entry = break line del anchor en M5
- Stop = beyond el pivot del anchor en M5 + buffer:
  * XXX/USD: buffer = 0.0003-0.0005
  * XXX/JPY: buffer = 0.03-0.05
- Verifica wicks del anchor M5: ODD = trade | EVEN = skip

3 TIPOS DE ENTRY (en M5 o M1):
a. BREAKOUT: entrar cuando las velas de ruptura M5 están corriendo
b. PULLBACK: esperar que el precio regrese al nivel roto (soporte/resistencia)
   → Entry INFERIOR al precio actual para BUY | SUPERIOR para SELL
c. CC (Color Change) en M1: BRB para LONG, RBR para SHORT

TAKE PROFIT:
- El high/low más cercano ANTES del corrective move en M30
- Siguiente barrier visible en M30 — achievable pips
- NO buscar home runs

════════════════════════════════════════════════════════
6 PASOS DE JODY RESUMIDOS
════════════════════════════════════════════════════════
1. ¿Hay AB válido en M30? (corrective move + anchor + break con 2+ level breaks, close fuera del anchor, sin interrupción en break candles) → Si NO = WAIT
2. ¿Saliendo de HTF S/D (H3)? Si NO → probable fake out → WAIT
3. Baja a M5: anchor exacto, entry en break line, stop beyond pivot, wicks ODD
4. ¿Level breaks en M5 ≥ 2? Más breaks = mayor confidence
5. ¿Dirección AB = trend H3? SÍ = Impulse → 2:1 | NO = Corrective → 1:1 o SKIP
6. ¿Whitespace hasta barrier? ¿Race Track? RT → reducir TP | Sin whitespace → WAIT

SKIP SI: UTNS/DTNS en H3, menos de 2 level breaks, close no rompe anchor body,
interrupción en break candles, no saliendo de H3 S/D, Race Track, wicks EVEN,
sin whitespace, FRESHNESS > 3 velas M30, interest rate news

PIPS: XXX/USD = 0.0001 | XXX/JPY = 0.01

RESPONDE en JSON puro sin markdown, reasoning máximo 3 oraciones:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "pair": "EUR_USD",
  "confidence": 85,
  "entry": 1.08420,
  "stop_loss": 1.08150,
  "take_profit": 1.08960,
  "timeframe": "M30",
  "strategy": "anchor_break",
  "trend_htf": "UP" | "DOWN" | "SIDEWAYS",
  "trend_itf": "UP" | "DOWN" | "SIDEWAYS",
  "htf_state": "UTS" | "DTS" | "SBUC" | "SBDC" | "UTAB" | "DTAB" | "UTNS" | "DTNS" | "SBU" | "SBD",
  "leaving_sd_zone": true | false,
  "breaks_count": 2,
  "ab_candle_m30": "#39",
  "freshness_candles": 1,
  "ratio": "2:1" | "1:1" | "none",
  "entry_type": "breakout" | "pullback" | "cc_m1",
  "race_track_risk": true | false,
  "whitespace_quality": "excellent" | "good" | "poor" | "none",
  "wick_count": "odd" | "even" | "none",
  "dollar_alignment": "favor" | "against" | "neutral" | "n/a",
  "reasoning": "3 oraciones: trend H3, AB en M30 con velas específicas, entry/stop en M5.",
  "skip_reason": "null o razón concisa",
  "send_alert": true | false
}`

export async function runAnchorBreakAgent({
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
  const candleSection = buildChartContextAB(candles, pair)

  const userMessage = `
ANÁLISIS ANCHOR BREAK PARA: ${pair.replace('_', '/')}

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
Aplica el sistema Anchor Break de Jody siguiendo los 3 pasos en orden:
1. Analiza H3 con los 7 pasos para determinar trend state
2. Analiza M30 para identificar corrective move, anchor y AB válido
3. Baja a M5 para entry y stop precisos

Recuerda:
- El corrective move puede tener interrupciones pequeñas — busca la dirección predominante
- El close de la vela de ruptura DEBE cerrar fuera del body del anchor
- El pivot es del anchor específico, NO del corrective move completo
- Freshness: contar velas M30 desde el AB hasta la última — si >3 = WAIT
- Cita los números de vela específicos (#XX) en tu reasoning

Reasoning máximo 3 oraciones. JSON sin markdown.
Confianza mínima: ${minConfidence}%. Si no cumple → WAIT, send_alert: false.
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: ANCHOR_BREAK_PROMPT,
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
