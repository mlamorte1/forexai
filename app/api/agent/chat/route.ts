import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchTactics, fetchCandles } from '@/lib/agent'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHAT_SYSTEM_PROMPT = `Eres ForexAI, un agente experto en trading de divisas y asistente personal de trading.

Tienes acceso a:
- Las tácticas de trading personales del usuario (Overnight Trade, Anchor Brake, News Trade, etc.)
- Datos de mercado en tiempo real de Oanda
- Conocimiento profundo de análisis técnico de price action

Tu estilo de comunicación:
- Directo, preciso, profesional
- Respondes en español
- Cuando analizas mercados, aplicas las tácticas específicas del usuario
- Cuando hay dudas sobre una táctica, explicas el concepto claramente
- Siempre incluyes disclaimers de que no es asesoría financiera cuando das señales específicas

Puedes ayudar con:
- Análisis de pares específicos usando las tácticas del usuario
- Explicar conceptos de sus tácticas (whitespace, anchor, wicks, etc.)
- Revisar si un setup cumple las reglas del Overnight Trade u otras tácticas
- Discutir el mercado actual y noticias relevantes
- Responder preguntas sobre gestión de riesgo basada en sus reglas`

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

    // Optionally fetch current candles for context
    let marketContext = ''
    if (pair && cfg) {
      try {
        const [D, H4] = await Promise.all([
          fetchCandles(cfg.api_key, cfg.environment, pair, 'D', 10),
          fetchCandles(cfg.api_key, cfg.environment, pair, 'H4', 20),
        ])
        const lastH4 = H4[H4.length - 1]
        const lastD = D[D.length - 1]
        if (lastH4) {
          marketContext = `\nDATO ACTUAL ${pair.replace('_', '/')}: H4 último precio: O:${lastH4.o} H:${lastH4.h} L:${lastH4.l} C:${lastH4.c} | D último: C:${lastD?.c}`
        }
      } catch {}
    }

    // Build system with tactics context
    const systemWithContext = `${CHAT_SYSTEM_PROMPT}

=== TÁCTICAS DEL USUARIO ===
${tactics || 'No hay tácticas guardadas aún'}
${marketContext}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: systemWithContext,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      }))
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

    // Save session
    const updatedMessages = [
      ...messages,
      { role: 'assistant', content: reply }
    ]

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

// GET — load chat history
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
