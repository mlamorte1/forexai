import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchTactics, fetchCandles } from '@/lib/agent'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHAT_SYSTEM_PROMPT = `Eres ForexAI, un agente experto en trading de divisas y asistente personal de trading.

Tienes acceso a:
- Las tácticas de trading personales del usuario (Overnight Trade, Anchor Break, News Trade, etc.)
- Datos de mercado en tiempo real de Oanda (ya incluidos en el contexto para TODOS los pares)
- Conocimiento profundo de análisis técnico de price action

Tu estilo de comunicación:
- Directo, preciso, profesional
- Respondes en español
- Cuando analizas mercados, aplicas las tácticas específicas del usuario
- SIEMPRE terminas un análisis con una conclusión clara y accionable

REGLA CRÍTICA — CONCLUSIÓN OBLIGATORIA:
Cuando el usuario pide analizar un par o setup, SIEMPRE debes terminar con:

## 🎯 CONCLUSIÓN

Que incluya obligatoriamente:
- **SEÑAL**: BUY / SELL / WAIT / SKIP
- **Razón**: Una línea explicando por qué
- Si es BUY o SELL:
  - **Entry**: precio exacto
  - **Stop Loss**: precio exacto + razón estructural
  - **Take Profit**: precio exacto (achievable pips al siguiente barrier)
  - **Confianza**: porcentaje
  - **Acción**: cuándo y cómo colocar la orden
- Si es WAIT o SKIP:
  - **Razón específica**: cuál regla del sistema no se cumple
  - **Qué esperar**: qué condición haría que el trade sea válido

NUNCA termines un análisis sin esta sección de conclusión.
NUNCA preguntes "¿quieres que continúe?" — siempre completa el análisis hasta la conclusión.
NUNCA digas "necesito los candles de X" — los datos de TODOS los pares ya están en el contexto.

Puedes ayudar con:
- Análisis completo de pares usando las tácticas del usuario
- Explicar conceptos de sus tácticas (whitespace, anchor, wicks, etc.)
- Revisar si un setup cumple las reglas del Overnight Trade, Anchor Break u otras tácticas
- Discutir el mercado actual y noticias relevantes
- Responder preguntas sobre gestión de riesgo

Disclaimer: No es asesoría financiera. Siempre usa tu propio criterio y gestión de riesgo.`

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
