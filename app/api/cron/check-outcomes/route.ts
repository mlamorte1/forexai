import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const now = new Date()

    // Buscar alertas BUY/SELL sin outcome, con entry/TP/SL definidos
    const { data: pendingAlerts } = await supabase
      .from('alerts')
      .select('id, user_id, pair, signal, entry, stop_loss, take_profit, created_at')
      .in('signal', ['BUY', 'SELL'])
      .is('outcome', null)
      .not('entry', 'is', null)
      .not('stop_loss', 'is', null)
      .not('take_profit', 'is', null)

    if (!pendingAlerts || pendingAlerts.length === 0) {
      return NextResponse.json({ ok: true, message: 'No pending alerts' })
    }

    // Agrupar por user para obtener sus configs de Oanda
    const userIds = [...new Set(pendingAlerts.map(a => a.user_id))]
    const { data: configs } = await supabase
      .from('oanda_configs')
      .select('user_id, api_key, account_id, environment')
      .in('user_id', userIds)

    if (!configs || configs.length === 0) {
      return NextResponse.json({ ok: true, message: 'No configs found' })
    }

    const results = []

    for (const cfg of configs) {
      const base = cfg.environment === 'live'
        ? 'https://api-fxtrade.oanda.com'
        : 'https://api-fxpractice.oanda.com'

      const userAlerts = pendingAlerts.filter(a => a.user_id === cfg.user_id)

      for (const alert of userAlerts) {
        try {
          const hoursOld = (now.getTime() - new Date(alert.created_at).getTime()) / (1000 * 60 * 60)

          // Expirar alertas con más de 24 horas sin resolverse
          if (hoursOld > 24) {
            await supabase
              .from('alerts')
              .update({
                outcome: 'expired',
                outcome_set_by: 'auto',
                outcome_checked_at: now.toISOString(),
              })
              .eq('id', alert.id)
            results.push({ id: alert.id, pair: alert.pair, outcome: 'expired' })
            continue
          }

          // Obtener precio actual de Oanda
          const priceRes = await fetch(
            `${base}/v3/instruments/${alert.pair}/candles?granularity=M1&count=1&price=M`,
            { headers: { Authorization: `Bearer ${cfg.api_key}` } }
          )
          if (!priceRes.ok) continue

          const priceData = await priceRes.json()
          const lastCandle = priceData.candles?.[priceData.candles.length - 1]
          if (!lastCandle) continue

          const currentPrice = parseFloat(lastCandle.mid.c)
          const entry = parseFloat(alert.entry)
          const tp = parseFloat(alert.take_profit)
          const sl = parseFloat(alert.stop_loss)

          let outcome: string | null = null

          if (alert.signal === 'BUY') {
            if (currentPrice >= tp) outcome = 'won'
            else if (currentPrice <= sl) outcome = 'lost'
          } else if (alert.signal === 'SELL') {
            if (currentPrice <= tp) outcome = 'won'
            else if (currentPrice >= sl) outcome = 'lost'
          }

          if (outcome) {
            await supabase
              .from('alerts')
              .update({
                outcome,
                outcome_set_by: 'auto',
                outcome_checked_at: now.toISOString(),
              })
              .eq('id', alert.id)
            results.push({ id: alert.id, pair: alert.pair, signal: alert.signal, outcome, currentPrice })
          }

        } catch (err: any) {
          results.push({ id: alert.id, error: err.message })
        }
      }
    }

    return NextResponse.json({ ok: true, checked: pendingAlerts.length, resolved: results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
