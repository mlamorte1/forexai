import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAnchorBreakAgent, matchTactics, fetchCandles, fetchNews } from '@/lib/agent-ab'
import { runOvernightTradeAgent } from '@/lib/agent-ot'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHAT_SYSTEM_PROMPT = `Eres ForexAI, asistente personal de trading experto en el sistema de Jody (Anchor Break y Overnight Trade).

REGLAS GENERALES:
- Respondes siempre en español, directo y preciso
- Los datos de TODOS los pares están en el contexto — NUNCA digas que no tienes datos
- NUNCA preguntes "¿quieres que continúe?" — siempre completa el análisis

════════════════════════════════
METODOLOGÍA — 7 PASOS DE JODY (BODIES únicamente, ignorar wicks)
════════════════════════════════
PASO 1: ID Action Candle (precio actual + mismo color) → IGNORAR
PASO 2: ID Anchor (2do color a la izquierda) → marcar HIGH y LOW con bodies
PASO 3: Sideways? → ¿previous move engulfa el anchor? SÍ = sideways
PASO 4: Closest Open → vela con OPEN más cercano FUERA de anchor lines:
  ROJA (c<o) = DOWNTREND | AZUL (c>o) = UPTREND
PASO 5: Setup → UT + action roja = LONG | DT + action azul = SHORT
PASO 6: Anchor Break → ¿action rompió anchor? SÍ: UTS→UTAB, DTS→DTAB, SBU→SBUC, SBD→SBDC
PASO 7: HTF Confluence:
  ⚠️ UTS Confluence: HTF muestra UTAB/UT/UTS/SBU/SBUC → HTF going UP → IMPULSE LONG
  ⚠️ DTS Confluence: HTF muestra DTAB/DT/DTS/SBD/SBDC → HTF going DOWN → IMPULSE SHORT
  Sin confluencia → CORRECTIVE → 1:1 máximo o SKIP
Estados válidos: UTS/UTAB/SBUC → LONG | DTS/DTAB/SBDC → SHORT | UTNS/DTNS → SKIP

════════════════════════════════
ESTRATEGIA 1: ANCHOR BREAK (H3 → M30 → M5)
════════════════════════════════
CORRECTIVE MOVE:
- Movimiento en M30 que va CONTRA el trend del H3
- Puede tener interrupciones pequeñas del color opuesto — busca la dirección PREDOMINANTE
- No es solo velas consecutivas del mismo color

ANCHOR:
- Grupo de velas al FINAL del corrective move, justo antes de la vela de ruptura
- Puede ser 1 sola vela o varias
- PIVOT = wick más extremo del anchor (NO del corrective move completo)

VELAS DE RUPTURA:
- Consecutivas del MISMO COLOR sin interrupción
- ⚠️ UNA sola vela del color opuesto = combinación ROTA = NO es AB
- El CLOSE debe cerrar fuera del body del anchor (solo close cuenta, NO wicks)
- Mínimo 2 level breaks

FRESHNESS: contar velas M30 desde el AB hasta la última — si más de 3 → WAIT

FLUJO:
1. AB en M30 (corrective move + anchor + break con 2+ level breaks)
2. Sale de HTF S/D — si no → fake out → SKIP
3. BAJAR A M5: anchor exacto, entry en break line, stop beyond pivot del ANCHOR en M5
4. HTF confluence → IMPULSE=2:1 | CORRECTIVE=1:1 o SKIP
5. Whitespace hasta barrier, sin Race Track

ENTRY (M5): breakout | pullback | CC en M1 (BRB long, RBR short)
STOP: beyond pivot del ANCHOR en M5 + buffer (USD: 0.0003-0.0005 | JPY: 0.03-0.05)
TP: high/low más cercano ANTES del corrective move

════════════════════════════════
ESTRATEGIA 2: OVERNIGHT TRADE (análisis 7PM-8PM EST — W → D → H4)
════════════════════════════════
Estado óptimo: DTS (SHORT) | UTS (LONG)
120% ATR BOX: LONG Entry=TOP | SHORT Entry=BOTTOM
ONCE GREEN NEVER RED

════════════════════════════════
3 KEYS: HEATMAP | DOLLAR | RACETRACK
WICKS: ODD = TRADE | EVEN = SKIP
PIPS: XXX/USD = 0.0001 | XXX/JPY = 0.01

════════════════════════════════
CUANDO EL USUARIO PIDE ANÁLISIS DE UN PAR:
════════════════════════════════
- Los resultados del agente vienen en el contexto como "ANÁLISIS DEL AGENTE"
- Presenta el análisis de forma clara y conversacional
- Si hay señal BUY/SELL: muestra entry, stop, TP claramente con los números de vela citados
- Si es WAIT: explica exactamente qué falta para que el trade sea válido

CONCLUSIÓN OBLIGATORIA:
🎯 SEÑAL: BUY | SELL | WAIT | SKIP
Estrategia | Entry | Stop | TP | Confianza %
Si WAIT/SKIP: razón + qué activaría el trade

Disclaimer: No es asesoría financiera.`

function extractPairFromMessage(message: string, watchedPairs: string[]): string | null {
  const msg = message.toUpperCase()
  for (const pair of watchedPairs) {
    const formatted = pair.replace('_', '/')
    if (msg.includes(pair) || msg.includes(formatted)) return pair
  }
  const aliases: Record<string, string> = {
    'EURUSD': 'EUR_USD', 'EURO': 'EUR_USD',
    'USDJPY': 'USD_JPY', 'YEN': 'USD_JPY',
    'USDCAD': 'USD_CAD', 'CAD': 'USD_CAD',
    'EURJPY': 'EUR_JPY',
    'AUDUSD': 'AUD_USD', 'AUD': 'AUD_USD',
  }
  for (const [alias, pair] of Object.entries(aliases)) {
    if (msg.includes(alias)) return pair
  }
  return null
}

function isAnalysisRequest(message: string): boolean {
  const keywords = ['analiz', 'setup', 'trade', 'señal', 'signal', 'entry', 'buy', 'sell', 'wait',
    'anchor break', 'overnight', 'tendencia', 'trend', 'revisar', 'chec', 'como va', 'qué ves',
    'hay algo', 'oportunidad', 'recomienda']
  const msg = message.toLowerCase()
  return keywords.some(k => msg.includes(k))
}

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    const { data: cfg } = await supabase
      .from('oanda_configs')
      .select('api_key, account_id, environment')
      .eq('user_id', user.id)
      .single()

    const { data: watchedPairs } = await supabase
      .from('watched_pairs')
      .select('pair')
      .eq('user_id', user.id)
      .eq('active', true)

    const allWatchedPairs = watchedPairs?.map((p: any) => p.pair) || []

    const lastMessage = messages[messages.length - 1]?.content || ''
    const tactics = await matchTactics(supabase, user.id, lastMessage)

    const now = new Date()
    const nyHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
    const isOvernightWindow = nyHour >= 19 && nyHour < 20

    let agentAnalysisContext = ''

    if (cfg && isAnalysisRequest(lastMessage)) {
      const mentionedPair = extractPairFromMessage(lastMessage, allWatchedPairs)
      const pairsToAnalyze = mentionedPair ? [mentionedPair] : allWatchedPairs.slice(0, 3)

      const analyses: string[] = []

      await Promise.all(pairsToAnalyze.map(async (pair: string) => {
        try {
          const [base, quote] = pair.split('_')
          const newsBase = await fetchNews(base)
          const newsQuote = await fetchNews(quote)
          const news = [newsBase, newsQuote].filter(Boolean).join('\n')

          let analysis: any

          if (isOvernightWindow) {
            const [W, D, H4] = await Promise.all([
              fetchCandles(cfg.api_key, cfg.environment, pair, 'W', 24),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'D', 30),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'H4', 48),
            ])
            analysis = await runOvernightTradeAgent({
              pair, candles: { W, D, H4 }, positions: [], news, tactics, minConfidence: 65
            })
          } else {
            const [H3, M30, M5] = await Promise.all([
              fetchCandles(cfg.api_key, cfg.environment, pair, 'H3', 48),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'M30', 60),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'M5', 24),
            ])
            analysis = await runAnchorBreakAgent({
              pair, candles: { H3, M30, M5 }, positions: [], news, tactics, minConfidence: 65
            })
          }

          const strategyLabel = isOvernightWindow ? 'Overnight Trade' : 'Anchor Break'

          analyses.push(`
=== ANÁLISIS DEL AGENTE: ${pair.replace('_', '/')} ===
Estrategia: ${strategyLabel}
Señal: ${analysis.signal}
Confianza: ${analysis.confidence}%
${analysis.entry ? `Entry: ${analysis.entry}` : ''}
${analysis.stop_loss ? `Stop: ${analysis.stop_loss}` : ''}
${analysis.take_profit ? `TP: ${analysis.take_profit}` : ''}
HTF State: ${analysis.htf_state || analysis.market_state || 'N/A'}
AB vela M30: ${analysis.ab_candle_m30 || 'N/A'}
Freshness velas: ${analysis.freshness_candles || 'N/A'}
Skip reason: ${analysis.skip_reason || 'ninguna'}
Reasoning: ${analysis.reasoning}`)
        } catch (e: any) {
          analyses.push(`\n=== ${pair} ===\nError: ${e.message}`)
        }
      }))

      agentAnalysisContext = analyses.join('\n')
    }

    let marketContext = ''
    if (cfg && allWatchedPairs.length > 0 && !agentAnalysisContext) {
      const pairSections: string[] = []
      await Promise.all(allWatchedPairs.map(async (p: string) => {
        try {
          const H4 = await fetchCandles(cfg.api_key, cfg.environment, p, 'H4', 6)
          const last = H4[H4.length - 1]
          pairSections.push(`${p.replace('_', '/')}: ${last?.c || '—'}`)
        } catch {}
      }))
      marketContext = `\n=== PRECIOS ACTUALES ===\n${pairSections.join(' | ')}`
    }

    const systemWithContext = `${CHAT_SYSTEM_PROMPT}

=== TÁCTICAS DEL USUARIO ===
${tactics || 'No hay tácticas guardadas aún'}
${agentAnalysisContext ? `\n${agentAnalysisContext}` : marketContext}
Hora EST: ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })}
Estrategia activa: ${isOvernightWindow ? 'Overnight Trade (W/D/H4)' : 'Anchor Break (H3/M30/M5)'}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: systemWithContext,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content }))
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    const updatedMessages = [...messages, { role: 'assistant', content: reply }]

    await supabase
      .from('chat_sessions')
      .upsert({
        user_id: user.id,
        messages: updatedMessages,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    return NextResponse.json({ reply, messages: updatedMessages })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('chat_sessions')
      .select('messages, updated_at')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({ messages: data?.messages || [] })
  } catch {
    return NextResponse.json({ messages: [] })
  }
}
