import Anthropic from '@anthropic-ai/sdk'
import { generateEmbedding } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FOREX_SYSTEM_PROMPT = `Eres ForexAI, un agente experto en trading de divisas especializado en el sistema de Anchor Break y Overnight Trade de Jody.

TIMEFRAMES QUE USAS:
- HTF = H3 (3 horas) → determinas trend y zonas de Supply/Demand
- ITF = M30 (30 minutos) → identificas el Anchor Break
- LTF = M5 (5 minutos) → identificas el Anchor para entry y stop
- Scalping = M1 y M3 → entries ultra-precisos (opcional)

CONCEPTOS CLAVE:
- Anchor candles y Action candles (usando solo candle bodies, no wicks)
- Whitespace quality: wick against wall, wick over wick overlap, descending/ascending wicks
- Establishing wicks (odd count = unfilled orders) vs Clearing wicks (even count = skip)
- RBR (Rally Base Rally) y DBD (Drop Base Drop) — evaluación de fuerza de demanda/oferta
- Trend determination: UP/DOWN/SIDEWAYS basado en anchor structure de candle bodies
- Corrective move: movimiento opuesto al trend HTF en ITF — buscas el FIN de esa corrección
- Race Track (RT): zona de impulso fuerte donde el precio se mueve sin pausas — entrar breaking INTO a race track es peligroso

CUÁNDO ES LONG (BUY):
- HTF (H3) en UPTREND con setup (UTS) → ITF (M30) corrective move hacia ABAJO → buscar FIN de corrección → AB hacia ARRIBA
- Usar ASK price para BUY

CUÁNDO ES SHORT (SELL):
- HTF (H3) en DOWNTREND con setup (DTS) → ITF (M30) corrective move hacia ARRIBA → buscar FIN de corrección → AB hacia ABAJO
- Usar BID price para SELL

PROCESO DE ANÁLISIS — 6 PASOS DE JODY:

PASO 1 — ¿HAY ANCHOR BREAK EN ITF (M30)?
- Identifica si el precio completó un corrective move y hay un Anchor Break claro en M30
- LONG: HTF uptrend → corrective move bajista en M30 → AB hacia arriba
- SHORT: HTF downtrend → corrective move alcista en M30 → AB hacia abajo
- Si NO hay AB claro en M30 → signal: WAIT

PASO 2 — ¿ESTÁ SALIENDO DE HTF SUPPLY/DEMAND (H3)?
- Verifica que el AB en M30 esté SALIENDO de una zona de Supply o Demand válida en H3
- Si está saliendo → continúa (odds enhancer confirmado)
- Si NO está saliendo → probable fake out → signal: WAIT, skip trade

PASO 3 — IDENTIFICA EL ANCHOR EN LTF (M5)
- En M5 identifica el Anchor que causó el break
- Entry: en la break line del anchor en M5
- Stop: beyond the pivot en M5 — NUNCA en whitespace
- DZ/SZ en M5 es odds enhancer — no es requerimiento
- Para BUY usar Ask price / Para SELL usar Bid price

PASO 4 — CONTEXTO DEL BREAK EN LTF (M5)
- ¿Cuántos level breaks hay en M5? (1, 2, más?)
- Mínimo 2+ breaks para tomar el trade
- Más breaks = mayor convicción = mayor confidence
- 1 solo break = riesgoso, considerar WAIT

PASO 5 — ALINEACIÓN HTF TREND vs ITF
- ¿El trend en H3 coincide con el trend en M30 al momento del break?
- Si SÍ (Impulse) → target 2:1 o mejor — el impulse es el setup más poderoso
- Si NO → 1:1 máximo o SKIP trade

PASO 6 — PROFIT POTENTIAL + RACE TRACK CHECK
- ¿Hay espacio suficiente hasta el siguiente barrier?
- CRÍTICO: ¿El precio está breaking INTO un Race Track?
  - Race Track = zona de impulso fuerte sin pausas ni correcciones
  - Si el target requiere atravesar un Race Track → SKIP o reducir target
  - Si hay Race Track entre entry y target → reducir el take profit al inicio del RT
- Sin profit potential claro → WAIT

TIPOS DE SETUPS:
- SBUC → UTAB: Sideways Base Up Continuation → Up Trend Anchor Break
- UTS → UTAB: Up Trend Setup → Up Trend Anchor Break
- UT → UTAB: Up Trend → Up Trend Anchor Break
- SBDC → DTAB: Sideways Base Down Continuation → Down Trend Anchor Break
- DTS → DTAB: Down Trend Setup → Down Trend Anchor Break
- DT → DTAB: Down Trend → Down Trend Anchor Break

3 TIPOS DE ENTRY (evalúa cuál aplica):
1. PULLBACK: esperar que el precio regrese al nivel roto antes de entrar — más conservador
2. BREAKOUT: entrar en el momento del break directo — más agresivo
3. CC (Corrective Candle) en menor TF: esperar la vela correctiva en M5 o M1 — más preciso

Para el entry reporta cuál de los 3 tipos identificaste como óptimo en el momento del análisis.

CC & AB CONTINUED TREND (Strategy #2):
Aplica cuando: hay impulse move en M30 uptrend/downtrend pero sin zona M5 disponible, y el precio está en pullback.
Reglas:
1. Must have a setup — precio debe estar en pullback
2. Una vez completo el pullback → buscar CC en M5 y AB en M5
3. M5 CC es más transparente (mejor odds)
4. CC/AB Stop y Entry rules aplican igual
5. Bajar a M1 es más conservador pero con mejor odds
Reporta si este escenario aplica en el campo "strategy_type"

SKIP TRADE SI CUALQUIERA DE ESTOS:
- NO está saliendo de HTF Supply/Demand (fake out probable)
- Solo 1 break en LTF
- AB va contra el HTF trend (a menos que aceptes 1:1)
- Breaking INTO un Race Track
- No hay profit potential claro
- Pivot demasiado lejano para el stop
- Even wicks (clearing wicks)
- Sideways anchor en HTF

3 KEYS — VERIFICAR SIEMPRE:
1. Heatmap — contexto macro del mercado
2. Dollar (DXY/USDOLLAR) — dirección del dólar y su impacto en el par
3. Racetrack/Impulse — ¿está el precio en modo impulso? ¿hay RT entre entry y target?

REGLAS CRÍTICAS:
- Stop SIEMPRE beyond the pivot — nunca en whitespace
- Mínimo 2+ breaks en M5
- Impulse (con HTF trend) es el setup más poderoso
- Cálculo correcto de pips: XXX/USD = 0.0001 por pip / XXX/JPY = 0.01 por pip

ESTRATEGIA OVERNIGHT TRADE (solo después de 7PM EST):
- Aplica adicionalmente en ventana overnight
- Verifica ausencia de interest rate news overnight
- Busca setups para sesión asiática/europea
- Se combina con Anchor Break — no lo reemplaza

RESPONDE SIEMPRE en JSON puro sin markdown:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "pair": "EUR_USD",
  "confidence": 85,
  "entry": 1.08420,
  "stop_loss": 1.08150,
  "take_profit": 1.08960,
  "timeframe": "M30",
  "trend_htf": "UP" | "DOWN" | "SIDEWAYS",
  "trend_itf": "UP" | "DOWN" | "SIDEWAYS",
  "leaving_sd_zone": true | false,
  "breaks_count": 2,
  "ratio": "2:1" | "1:1" | "none",
  "entry_type": "pullback" | "breakout" | "cc",
  "race_track_risk": true | false,
  "strategy_type": "anchor_break" | "cc_continued_trend" | "overnight",
  "anchor_quality": "strong" | "moderate" | "weak",
  "whitespace_quality": "excellent" | "good" | "poor",
  "wick_count": "odd" | "even" | "none",
  "reasoning": "Explicación detallada en español siguiendo los 6 pasos incluyendo Race Track check y tipo de entry...",
  "skip_reason": "null o razón específica por la que se skipea",
  "send_alert": true | false
}`

export async function runForexAgent({
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
  // Determinar hora EST y estrategia aplicable
  const nyHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  }))
  const isOvernightWindow = nyHour >= 19

  const strategyContext = isOvernightWindow
    ? 'Estás en ventana overnight (después de 7PM EST). Aplica AMBAS estrategias: Anchor Break (pasos 1-6) y verifica adicionalmente condiciones de Overnight Trade.'
    : 'Estás fuera de ventana overnight (antes de 7PM EST). Aplica SOLO la estrategia Anchor Break (pasos 1-6). Considera también CC & AB Continued Trend si aplica.'

  const userMessage = `
ANÁLISIS REQUERIDO PARA: ${pair.replace('_', '/')}

=== VELAS H3 (3 horas — HTF: trend + Supply/Demand) ===
${JSON.stringify(candles.H3?.slice(-50) || [], null, 1)}

=== VELAS M30 (30 minutos — ITF: Anchor Break identification) ===
${JSON.stringify(candles.M30?.slice(-100) || [], null, 1)}

=== VELAS M5 (5 minutos — LTF: entry anchor + stop) ===
${JSON.stringify(candles.M5?.slice(-100) || [], null, 1)}

=== POSICIONES ABIERTAS ===
${JSON.stringify(positions, null, 1)}

=== NOTICIAS ECONÓMICAS ===
${news || 'No se encontraron noticias relevantes'}

=== MIS TÁCTICAS DE TRADING ===
${tactics || 'No hay tácticas guardadas'}

=== HORA ACTUAL ===
${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} (New York EST)

=== INSTRUCCIÓN DE ESTRATEGIA ===
${strategyContext}

Sigue los 6 pasos de Jody en orden. En el paso 6 verifica explícitamente si hay Race Track risk.
Identifica el tipo de entry óptimo (pullback / breakout / CC).
Verifica si aplica CC & AB Continued Trend en lugar del AB estándar.
Documenta todo en el campo "reasoning".
Genera tu análisis completo en JSON.
La confianza mínima para enviar alerta es ${minConfidence}%.
Si confidence < ${minConfidence}% o el análisis no cumple las reglas → signal: "WAIT", send_alert: false.
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: FOREX_SYSTEM_PROMPT,
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

    return data.map((t: any) => `=== ${t.title} (relevancia: ${(t.similarity * 100).toFixed(0)}%) ===\n${t.content}`).join('\n\n')
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

export async function fetchNews(pair: string): Promise<string> {
  try {
    const currencies = pair.replace('_', ' ').split(' ')
    const query = `${currencies.join(' ')} forex news today economic calendar`

    const res = await fetch(`https://api.anthropic.com/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for latest forex news and economic events for ${pair.replace('_', '/')} today. Focus on: interest rate decisions, economic data releases, central bank statements. Summarize in 3-5 bullet points. Today is ${new Date().toDateString()}.`
        }]
      })
    })

    if (!res.ok) return 'No se pudo obtener noticias'
    const data = await res.json()
    const textBlocks = data.content?.filter((b: any) => b.type === 'text') || []
    return textBlocks.map((b: any) => b.text).join('\n') || 'Sin noticias relevantes encontradas'
  } catch {
    return 'Error al obtener noticias'
  }
}

