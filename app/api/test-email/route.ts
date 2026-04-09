import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendAlertEmail } from '@/lib/resend'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const testAnalysis = {
      signal: 'BUY',
      pair: 'AUD_USD',
      confidence: 82,
      entry: 0.63450,
      stop_loss: 0.63180,
      take_profit: 0.63990,
      timeframe: 'H4',
      trend: 'UP',
      whitespace_quality: 'excellent',
      wick_count: 'odd',
      reasoning: 'TEST EMAIL — Setup de Overnight Trade detectado en AUD/USD. Uptrend confirmado en Daily con action candles rojas indicando retroceso. Zona de demanda fresca identificada con whitespace de calidad (wick against wall) en el 65% medio del anchor. Wicks odd count (3) confirmando unfilled orders. Stop protegido detrás del pivot en 0.6318. Target en siguiente barrier con ~54 pips alcanzables.',
    }

    await sendAlertEmail({ to: user.email!, analysis: testAnalysis })

    return NextResponse.json({ ok: true, sent_to: user.email })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
