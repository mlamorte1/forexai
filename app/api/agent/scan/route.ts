import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runForexAgent, matchTactics, fetchCandles, fetchNews } from '@/lib/agent'
import { sendAlertEmail } from '@/lib/resend'

export const maxDuration = 300

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Determinar hora EST y estrategia
    const now = new Date()
    const nyHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
    const nyMinute = now.getMinutes()
    const isOvernightWindow = nyHour >= 19
    const isMarketHours = nyHour >= 8 && nyHour < 17

    // ✅ Cron inteligente: fuera de horario solo correr en :00 y :30
    if (!isMarketHours && !isOvernightWindow && nyMinute !== 0 && nyMinute !== 30) {
      return NextResponse.json({ ok: true, message: 'Off-hours skip' })
    }

    const supabase = createServiceClient()

    const { data: configs } = await supabase
      .from('oanda_configs')
      .select('user_id, api_key, account_id, environment')

    if (!configs || configs.length === 0) {
      return NextResponse.json({ ok: true, message: 'No users configured' })
    }

    const allResults = await Promise.all(configs.map(async (cfg) => {
      try {
        const base = cfg.environment === 'live'
          ? 'https://api-fxtrade.oanda.com'
          : 'https://api-fxpractice.oanda.com'

        const [
          { data: { user } },
          { data: prefs },
          { data: pairs },
          positionsRaw,
        ] = await Promise.all([
          supabase.auth.admin.getUserById(cfg.user_id),
          supabase.from('user_preferences').select('min_confidence').eq('user_id', cfg.user_id).single(),
          supabase.from('watched_pairs').select('pair').eq('user_id', cfg.user_id).eq('active', true),
          fetch(`${base}/v3/accounts/${cfg.account_id}/openPositions`, {
            headers: { Authorization: `Bearer ${cfg.api_key}` }
          }).then(r => r.json()).catch(() => ({ positions: [] })),
        ])

        if (!user?.email || !pairs || pairs.length === 0) return []
        const userEmail = user.email
        const minConfidence = prefs?.min_confidence ?? 70
        const positions = positionsRaw.positions || []

        // ✅ News cache por moneda única
        const currencies = [...new Set(pairs.flatMap(({ pair }: { pair: string }) => pair.split('_')))]
        const newsCache: Record<string, string> = {}
        await Promise.all(currencies.map(async (currency: string) => {
          newsCache[currency] = await fetchNews(currency)
        }))

        const pairResults = await Promise.all(pairs.map(async ({ pair }: { pair: string }) => {
          try {
            const tacticsQuery = isOvernightWindow
              ? `Overnight trade setup ${pair} - Daily trend anchor whitespace H4 level`
              : `Anchor Break setup ${pair} - HTF trend supply demand M30 M5 entry`

            // ✅ Timeframes dinámicos según estrategia
            let candles: Record<string, any[]>

            if (isOvernightWindow) {
              // Overnight Trade: W → D → H4
              const [W, D, H4, tactics] = await Promise.all([
                fetchCandles(cfg.api_key, cfg.environment, pair, 'W', 24),   // Weekly curve
                fetchCandles(cfg.api_key, cfg.environment, pair, 'D', 30),   // Daily trend
                fetchCandles(cfg.api_key, cfg.environment, pair, 'H4', 48),  // H4 entry
                matchTactics(supabase, cfg.user_id, tacticsQuery),
              ])
              candles = { W, D, H4 }

              const [base_currency, quote_currency] = pair.split('_')
              const news = [newsCache[base_currency], newsCache[quote_currency]].filter(Boolean).join('\n\n')

              // ✅ Freshness check — última vela H4 no debe tener más de 15 min
              const lastH4 = H4[H4.length - 1]
              if (lastH4) {
                const minutesAgo = (now.getTime() - new Date(lastH4.t).getTime()) / 60000
                if (minutesAgo > 15) {
                  return { pair, signal: 'SKIP', reason: `Stale data: ${Math.round(minutesAgo)}min ago` }
                }
              }

              const analysis = await runForexAgent({
                pair, candles, positions, news, tactics, minConfidence, isOvernightWindow: true
              })

              const { data: insertedAlert } = await supabase
                .from('alerts')
                .insert({
                  user_id: cfg.user_id, pair,
                  signal: analysis.signal,
                  confidence: analysis.confidence,
                  entry: analysis.entry || null,
                  stop_loss: analysis.stop_loss || null,
                  take_profit: analysis.take_profit || null,
                  timeframe: analysis.timeframe || 'H4',
                  reasoning: analysis.reasoning,
                  email_sent: false,
                })
                .select('id')
                .single()

              if (analysis.send_alert) {
                await sendAlertEmail({ to: userEmail, analysis })
                if (insertedAlert?.id) {
                  await supabase.from('alerts').update({ email_sent: true }).eq('id', insertedAlert.id)
                }
              }

              return { pair, signal: analysis.signal, confidence: analysis.confidence, sent: analysis.send_alert }

            } else {
              // Anchor Break: H3 → M30 → M5
              const [H3, M30, M5, tactics] = await Promise.all([
                fetchCandles(cfg.api_key, cfg.environment, pair, 'H3', 48),  // HTF S/D
                fetchCandles(cfg.api_key, cfg.environment, pair, 'M30', 60), // ITF AB
                fetchCandles(cfg.api_key, cfg.environment, pair, 'M5', 24),  // LTF entry
                matchTactics(supabase, cfg.user_id, tacticsQuery),
              ])
              candles = { H3, M30, M5 }

              const [base_currency, quote_currency] = pair.split('_')
              const news = [newsCache[base_currency], newsCache[quote_currency]].filter(Boolean).join('\n\n')

              // ✅ Freshness check — última vela M5 no debe tener más de 15 min
              const lastM5 = M5[M5.length - 1]
              if (lastM5) {
                const minutesAgo = (now.getTime() - new Date(lastM5.t).getTime()) / 60000
                if (minutesAgo > 15) {
                  return { pair, signal: 'SKIP', reason: `Stale data: ${Math.round(minutesAgo)}min ago` }
                }
              }

              const analysis = await runForexAgent({
                pair, candles, positions, news, tactics, minConfidence, isOvernightWindow: false
              })

              const { data: insertedAlert } = await supabase
                .from('alerts')
                .insert({
                  user_id: cfg.user_id, pair,
                  signal: analysis.signal,
                  confidence: analysis.confidence,
                  entry: analysis.entry || null,
                  stop_loss: analysis.stop_loss || null,
                  take_profit: analysis.take_profit || null,
                  timeframe: analysis.timeframe || 'M30',
                  reasoning: analysis.reasoning,
                  email_sent: false,
                })
                .select('id')
                .single()

              if (analysis.send_alert) {
                await sendAlertEmail({ to: userEmail, analysis })
                if (insertedAlert?.id) {
                  await supabase.from('alerts').update({ email_sent: true }).eq('id', insertedAlert.id)
                }
              }

              return { pair, signal: analysis.signal, confidence: analysis.confidence, sent: analysis.send_alert }
            }

          } catch (pairErr: any) {
            console.error(`[SCAN ERROR] pair=${pair}`, pairErr)
            return { pair, error: pairErr.message }
          }
        }))

        return pairResults
      } catch (userErr: any) {
        console.error(`[SCAN ERROR] user=${cfg.user_id}`, userErr)
        return [{ user_id: cfg.user_id, error: userErr.message }]
      }
    }))

    const results = allResults.flat()
    return NextResponse.json({ ok: true, scanned: results, strategy: isOvernightWindow ? 'overnight' : 'anchor_break' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
