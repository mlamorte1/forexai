import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchTactics, fetchCandles } from '@/lib/agent'
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
PASO 7: HTF Confluence → UTS Conf (DTAB/UT/UTS/SBU/SBUC) = IMPULSE LONG | DTS Conf = IMPULSE SHORT
Estados válidos: UTS/UTAB/SBUC → LONG | DTS/DTAB/SBDC → SHORT | UTNS/DTNS → SKIP

════════════════════════════════
ESTRATEGIA 1: ANCHOR BREAK (antes de 7PM EST) — H3/H4 → M30 → M5
════════════════════════════════
LONG: HTF uptrend → M30 corrective move bajista → Pivot Low → velas combinadas rompen 2+ highs → AB arriba
SHORT: HTF downtrend → M30 corrective move alcista → Pivot High → velas combinadas rompen 2+ lows → AB abajo
VELAS COMBINADAS: consecutivas del mismo color sin interrupción = una sola vela de ruptura

FLUJO: 
1. AB + Pivot en M30 (2+ level breaks)
2. Sale de HTF S/D — si no → fake out → SKIP
3. BAJAR A M5 OBLIGATORIO: anchor exacto, entry en break line, stop beyond pivot en M5
4. 2+ breaks en M5
5. HTF confluence → IMPULSE=2:1 | CORRECTIVE=1:1 o SKIP
6. Whitespace hasta barrier, sin Race Track

ENTRY (M5): breakout | wick impulso | pullback al nivel roto
STOP: beyond pivot M5 + buffer (USD: 0.0003-0.0005 | JPY: 0.03-0.05)
TP: high/low más cercano ANTES del corrective move
FRESHNESS: AB en últimas 3 velas M30 (90 min) — si no → WAIT

════════════════════════════════
ESTRATEGIA 2: OVERNIGHT TRADE (después de 7PM EST) — W → D → H4 → H1
════════════════════════════════
PRE-FILTRO: identificas condiciones, el trader ejecuta en H4 manualmente.
Estado óptimo: DTS (SHORT) | UTS (LONG)
Progresión: SBD/SBU (2+ candles) → SBDC/SBUC (1 candle) → DTS/UTS (ÓPTIMO) → DTAB/UTAB (missed, pullback)

6 CRITERIOS ENTRY ZONE H4: Big Move In/Out | 50% Basing Candle | Fresh 70%+ | Authentic | Whitespace ODD | Profit Potential
REPORTAR: dirección, rango anchor Daily, market_state, proximity_to_trade
Box 120% ATR | Color Change en H1 | ONCE GREEN NEVER RED

════════════════════════════════
WICKS: ODD = establishing = TRADE | EVEN = clearing = SKIP
Race Track = NO entrar breaking INTO RT
PIPS: XXX/USD = 0.0001 | XXX/JPY = 0.01

CONCLUSIÓN OBLIGATORIA al analizar:
🎯 SEÑAL: BUY | SELL | WAIT | SKIP
Entry | Stop | TP | Confianza %
Si WAIT/SKIP: razón + qué activaría el trade

Disclaimer: No es asesoría financiera.`

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages, pair } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    // Get oanda config
    const { data: cfg } = await supabase
      .from('oanda_configs')
      .select('api_key, account_id, environment')
      .eq('user_id', user.id)
      .single()

    // Get relevant tactics
    const lastMessage = messages[messages.length - 1]?.content || ''
    const tactics = await matchTactics(supabase, user.id, lastMessage)

    // Get ALL watched pairs
    const { data: watchedPairs } = await supabase
      .from('watched_pairs')
      .select('pair')
      .eq('user_id', user.id)
      .eq('active', true)

    // Build market context for ALL pairs
    let marketContext = ''

    if (cfg && watchedPairs && watchedPairs.length > 0) {
      const allPairs = watchedPairs.map((p: any) => p.pair)

      // Add selected pair if not already in watched pairs
      if (pair && !allPairs.includes(pair)) allPairs.unshift(pair)

      const pairDataSections: string[] = []

      // Fetch candles for all pairs in parallel
      await Promise.all(allPairs.map(async (p: string) => {
        try {
          const [W, D, H4, H1] = await Promise.all([
            fetchCandles(cfg.api_key, cfg.environment, p, 'W', 10),
            fetchCandles(cfg.api_key, cfg.environment, p, 'D', 20),
            fetchCandles(cfg.api_key, cfg.environment, p, 'H4', 30),
            fetchCandles(cfg.api_key, cfg.environment, p, 'H1', 20),
          ])

          const fmtC = (c: any) => `${c.t.slice(0, 16)} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`
          const lastH1 = H1[H1.length - 1]

          pairDataSections.push(`
--- ${p.replace('_', '/')} ---
Precio actual: ${lastH1?.c || '—'}

Weekly (últimas 5):
${W.slice(-5).map(fmtC).join('\n')}

Daily (últimas 10):
${D.slice(-10).map(fmtC).join('\n')}

H4 (últimas 15):
${H4.slice(-15).map(fmtC).join('\n')}

H1 (últimas 10):
${H1.slice(-10).map(fmtC).join('\n')}`)
        } catch {
          pairDataSections.push(`\n--- ${p.replace('_', '/')} ---\n[Error obteniendo datos]`)
        }
      }))

      marketContext = `

=== DATOS DE MERCADO EN TIEMPO REAL (TODOS LOS PARES) ===
Hora Panama: ${new Date().toLocaleString('es-PA', { timeZone: 'America/Panama' })}

${pairDataSections.join('\n')}

IMPORTANTE: Tienes datos reales de TODOS los pares listados arriba.
Usa estos datos para tu análisis. NUNCA digas que no tienes datos de un par.`
    }

    const systemWithContext = `${CHAT_SYSTEM_PROMPT}

=== TÁCTICAS DEL USUARIO ===
${tactics || 'No hay tácticas guardadas aún'}
${marketContext}`

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
