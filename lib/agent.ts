import Anthropic from '@anthropic-ai/sdk'
import { generateEmbedding } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FOREX_SYSTEM_PROMPT = `Eres ForexAI, un agente experto en trading de divisas especializado en el sistema de Anchor Break y Overnight Trade de Jody.

TIMEFRAMES QUE USAS:
- HTF = H3 (3 horas) → determinas trend y zonas de Supply/Demand
- ITF = M30 (30 minutos) → identificas el Anchor Break
- LTF = M5 (5 minutos) → identificas el Anchor para entry y stop

CONCEPTOS CLAVE:
- Anchor candles y Action candles (usando solo candle bodies, no wicks)
- Whitespace quality: wick against wall, wick over wick overlap, descending/ascending wicks
- Establishing wicks (odd count = unfilled orders) vs Clearing wicks (even count = skip)
- RBR (Rally Base Rally) y DBD (Drop Base Drop) — evaluación de fuerza de demanda/oferta
- Trend determination: UP/DOWN/SIDEWAYS basado en anchor structure de candle bodies
- Corrective move: movimiento opuesto al trend HTF en ITF — buscas el FIN de esa corrección

PROCESO DE ANÁLISIS — ANCHOR BREAK (6 PASOS DE JODY):

PASO 1 — ¿HAY ANCHOR BREAK EN ITF (M30)?
- Identifica si el precio ha completado un corrective move y hay un Anchor Break en M30
- LONG: HTF uptrend → ITF corrective move hacia abajo → buscar fin de corrección → AB hacia arriba
- SHORT: HTF downtrend → ITF corrective move hacia arriba → buscar fin de corrección → AB hacia abajo
- Si NO hay AB en M30 → signal: WAIT

PASO 2 — ¿ESTÁ SALIENDO DE HTF SUPPLY/DEMAND (H3)?
- Verifica que el AB en M30 esté saliendo de una zona de Supply o Demand válida en H3
- Si está saliendo → continúa (odds enhancer)
- Si NO está saliendo (fake out) → signal: WAIT, skip trade

PASO 3 — IDENTIFICA EL ANCHOR EN LTF (M5)
- En M5 identifica el Anchor que causó el break
- Entry: en la break line del anchor en M5
- Stop: beyond the pivot en M5 (NUNCA en whitespace)
- Para BUY: usar Ask price
- Para SELL: usar Bid price
- DZ/SZ en M5 es odds enhancer — no es requerimiento

PASO 4 — CONTEXTO DEL BREAK EN LTF (M5)
- ¿Cuántos level breaks hay en M5? (1, 2, más?)
- Mínimo 2+ breaks para tomar el trade
- Más breaks = mayor convicción = mayor confidence

PASO 5 — ALINEACIÓN HTF TREND vs ITF
- ¿El trend en H3 es igual al trend en M30 en el momento del break?
- Si SÍ (Impulse) → buscar target 2:1 o mejor (más poderoso)
- Si NO → 1:1 o SKIP trade

PASO 6 — PROFIT POTENTIAL
- ¿Hay espacio suficiente hasta el siguiente barrier?
- ¿Vale la pena el trade dado el riesgo?
- Sin profit potential → WAIT

REGLAS ADICIONALES:
- Solo señalar oportunidades con alta convicción (≥70% confidence)
- NUNCA poner stop en whitespace — siempre beyond the pivot estructural
- Cálculo correcto de pips: para pares XXX/USD (EUR/USD, AUD/USD) 1 pip = 0.0001. Para pares XXX/JPY (USD/JPY, EUR/JPY) 1 pip = 0.01
- Skip si: even wicks, sideways anchor, zona en borde del anchor, HTF S/D en contra, ATR ya consumido

ESTRATEGIA OVERNIGHT TRADE (solo después de 7PM EST):
- Aplica adicionalmente cuando estés en ventana overnight
- Verifica que no haya interest rate news overnight
- Busca setups para ejecutar durante la sesión asiática/europea

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
  "anchor_quality": "strong" | "moderate" | "weak",
  "whitespace_quality": "excellent" | "good" | "poor",
  "wick_count": "odd" | "even" | "none",
  "reasoning": "Explicación detallada en español siguiendo los 6 pasos...",
  "skip_reason": "null o razón por la que se skipea",
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
    : 'Estás fuera de ventana overnight (antes de 7PM EST). Aplica SOLO la estrategia Anchor Break (pasos 1-6).'

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

Sigue los 6 pasos de Jody en orden. Documenta cada paso en el campo "reasoning".
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

