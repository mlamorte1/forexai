import Anthropic from '@anthropic-ai/sdk'
import { generateEmbedding } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FOREX_SYSTEM_PROMPT = `Eres ForexAI, un agente experto en trading de divisas con profundo conocimiento en análisis técnico de price action.

Tu especialidad es el análisis multi-timeframe usando los siguientes conceptos clave:
- Anchor candles y Action candles (usando solo candle bodies, no wicks)
- Whitespace quality: wick against wall, wick over wick overlap, descending/ascending wicks
- Establishing wicks (odd count = unfilled orders) vs Clearing wicks (even count = skip)
- RBR (Rally Base Rally) y DBD (Drop Base Drop) — evaluación de fuerza de demanda/oferta
- Trend determination: UP/DOWN/SIDEWAYS basado en anchor structure
- Zone location dentro del anchor (preferir 70% medio)
- Nivel fresco y auténtico (wall a la izquierda, sin price action a la derecha)

REGLAS DE TRADING QUE SIEMPRE SIGUES:
- Solo señalar oportunidades con alta convicción (≥70% confidence)
- NUNCA poner stop en whitespace — siempre detrás de un pivot estructural
- Target: achievable pips al siguiente barrier (no home runs)
- Skip si: even wicks, sideways anchor, zona en borde del anchor, HTF Supply/Demand en contra, ATR ya consumido, interest rate news overnight
- Considerar sesión actual: overnight trades se ejecutan después de las 7PM EST

CUANDO ANALICES:
1. Determina el trend en Daily usando candle bodies
2. Verifica si hay setup (action candles del color opuesto al trend)
3. Busca zona de calidad con whitespace en H4
4. Evalúa wicks (odd = trade, even = skip)
5. Verifica que la zona esté en el 70% medio del anchor
6. Considera noticias que puedan afectar
7. Calcula entry, stop (detrás de pivot) y target (siguiente barrier)

RESPONDE SIEMPRE en JSON puro sin markdown:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "pair": "EUR_USD",
  "confidence": 85,
  "entry": 1.08420,
  "stop_loss": 1.08150,
  "take_profit": 1.08960,
  "timeframe": "H4",
  "trend": "UP" | "DOWN" | "SIDEWAYS",
  "anchor_quality": "strong" | "moderate" | "weak",
  "whitespace_quality": "excellent" | "good" | "poor",
  "wick_count": "odd" | "even" | "none",
  "reasoning": "Explicación detallada en español de por qué se toma o no se toma el trade...",
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
  const userMessage = `
ANÁLISIS REQUERIDO PARA: ${pair.replace('_', '/')}

=== VELAS W (Weekly — últimas 20) ===
${JSON.stringify(candles.W?.slice(-20) || [], null, 1)}

=== VELAS D (Daily — últimas 30) ===
${JSON.stringify(candles.D?.slice(-30) || [], null, 1)}

=== VELAS H4 (4 horas — últimas 50) ===
${JSON.stringify(candles.H4?.slice(-50) || [], null, 1)}

=== VELAS H1 (1 hora — últimas 50) ===
${JSON.stringify(candles.H1?.slice(-50) || [], null, 1)}

=== POSICIONES ABIERTAS ===
${JSON.stringify(positions, null, 1)}

=== NOTICIAS ECONÓMICAS ===
${news || 'No se encontraron noticias relevantes'}

=== MIS TÁCTICAS DE TRADING ===
${tactics || 'No hay tácticas guardadas'}

=== HORA ACTUAL ===
${new Date().toLocaleString('es-PA', { timeZone: 'America/Panama' })} (Panama / EST)

Con base en toda esta información, aplica el sistema de Overnight Trade y genera tu análisis completo en JSON.
La confianza mínima para enviar alerta es ${minConfidence}%.
Si confidence < ${minConfidence}% o el análisis no cumple las reglas → signal: "WAIT", send_alert: false.
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: FOREX_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const clean = text.replace(/```json|```/g, '').trim()

  try {
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
      // Fallback: get all tactics
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
    // Fallback: return all tactics as plain text
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
