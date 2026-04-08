import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchTactics, fetchCandles } from '@/lib/agent'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHAT_SYSTEM_PROMPT = `Eres ForexAI, un agente experto en trading de divisas y asistente personal de trading.

Tienes acceso a:
- Las tácticas de trading personales del usuario (Overnight Trade, Anchor Brake, News Trade, etc.)
- Datos de mercado en tiempo real de Oanda (ya incluidos en el contexto)
- Conocimiento profundo de análisis técnico de price action

Tu estilo de comunicación:
- Directo, preciso, profesional
- Respondes en español
- Cuando analizas mercados, aplicas las tácticas específicas del usuario
- SIEMPRE terminas un análisis con una conclusión clara y accionable

REGLA CRÍTICA — CONCLUSIÓN OBLIGATORIA:
Cuando el usuario pide analizar un par o un setup, SIEMPRE debes terminar con una sección llamada:

## 🎯 CONCLUSIÓN

Que incluya obligatoriamente:
- **SEÑAL**: BUY / SELL / WAIT / SKIP
- **Razón**: Una línea explicando por qué
- Si es BUY o SELL:
  - **Entry**: precio exacto
  - **Stop Loss**: precio exacto + razón estructural
  - **Take Profit**: precio exacto (achievable pips al siguiente barrier)
  - **Confianza**: porcentaje
  - **Acción**: "Colocar orden límite a las 7PM EST" o similar
- Si es WAIT o SKIP:
  - **Razón específica**: cuál regla del sistema no se cumple
  - **Qué esperar**: qué condición haría que el trade sea válido

NUNCA termines un análisis sin esta sección de conclusión.
NUNCA preguntes "¿quieres que continúe?" — siempre completa el análisis hasta la conclusión.

Puedes ayudar con:
- Análisis completo de pares usando las tácticas del usuario
- Explicar conceptos de sus tácticas (whitespace, anchor, wicks, etc.)
- Revisar si un setup cumple las reglas del Overnight Trade u otras tácticas
- Discutir el mercado actual y noticias relevantes
- Responder preguntas sobre gestión de riesgo basada en sus reglas

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

    const { data: cfg } = await supabase
      .from('oanda_configs')
      .select('api_key, account_id, environment')
      .eq('user_id', user.id)
      .single()

    const lastMessage = messages[messages.length - 1]?.content || ''
    const tactics = await matchTactics(supabase, user.id, lastMessage)

    let marketContext = ''
    const activePair = pair || 'EUR_USD'
    if (cfg) {
      try {
        const [W, D, H4, H1] = await Promise.all([
          fetchCandles(cfg.api_key, cfg.environment, activePair, 'W', 20),
          fetchCandles(cfg.api_key, cfg.environment, activePair, 'D', 30),
          fetchCandles(cfg.api_key, cfg.environment, activePair, 'H4', 50),
          fetchCandles(cfg.api_key, cfg.environment, activePair, 'H1', 30),
        ])

        const recentH4 = H4.slice(-10).map((c: any) => `${c.t.slice(0,16)} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')
        const recentD = D.slice(-10).map((c: any) => `${c.t.slice(0,10)} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')
        const recentW = W.slice(-5).map((c: any) => `${c.t.slice(0,10)} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')
        const lastH1 = H1[H1.length - 1]

        marketContext = `

=== DATOS DE MERCADO EN TIEMPO REAL: ${activePair.replace('_', '/')} ===

WEEKLY (últimas 5 velas):
${recentW}

DAILY (últimas 10 velas):
${recentD}

H4 (últimas 10 velas — entry timeframe):
${recentH4}

PRECIO ACTUAL: ${lastH1?.c || '—'}
HORA PANAMA: ${new Date().toLocaleString('es-PA', { timeZone: 'America/Panama' })}

USA ESTOS DATOS REALES para tu análisis. No uses datos hipotéticos.
Aplica el checklist de Overnight Trade completo y SIEMPRE termina con la sección ## 🎯 CONCLUSIÓN.`
      } catch {
        marketContext = '\n[Error obteniendo datos de mercado]'
      }
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
