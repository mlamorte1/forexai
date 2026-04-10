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

    const supabase = createServiceClient()

    const { data: configs } = await supabase
      .from('oanda_configs')
      .select('user_id, api_key, account_id, environment')

    if (!configs || configs.length === 0) {
      return NextResponse.json({ ok: true, message: 'No users configured' })
    }

    // ✅ TODOS los usuarios en paralelo
    const allResults = await Promise.all(configs.map(async (cfg) => {
      try {
        const base = cfg.environment === 'live'
          ? 'https://api-fxtrade.oanda.com'
          : 'https://api-fxpractice.oanda.com'

        // ✅ Setup del usuario todo en paralelo
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

        const minConfidence = prefs?.min_confidence ?? 70
        const positions = positionsRaw.positions || []

        // ✅ TODOS los pares en paralelo
        const pairResults = await Promise.all(pairs.map(async ({ pair }) => {
          try {
            const tacticsQuery = `Overnight trade setup for ${pair} - trend analysis whitespace anchor`

            // ✅ Velas + news + tactics todo en paralelo
            const [W, D, H4, H1, news, tactics] = await Promise.all([
              fetchCandles(cfg.api_key, cfg.environment, pair, 'W', 20),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'D', 30),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'H4', 50),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'H1', 50),
              fetchNews(pair),
              matchTactics(supabase, cfg.user_id, tacticsQuery),
            ])

            const analysis = await runForexAgent({
              pair,
              candles: { W, D, H4, H1 },
              positions,
              news,
              tactics,
              minConfidence,
            })

            await supabase.from('alerts').insert({
              user_id: cfg.user_id,
              pair,
              signal: analysis.signal,
              confidence: analysis.confidence,
              entry: analysis.entry || null,
              stop_loss: analysis.stop_loss || null,
              take_profit: analysis.take_profit || null,
              timeframe: analysis.timeframe || 'H4',
              reasoning: analysis.reasoning,
              email_sent: false,
            })

            if (analysis.send_alert) {
              await sendAlertEmail({ to: user.email, analysis })
              await supabase
                .from('alerts')
                .update({ email_sent: true })
                .eq('user_id', cfg.user_id)
                .eq('pair', pair)
                .order('created_at', { ascending: false })
                .limit(1)
            }

            return { pair, signal: analysis.signal, confidence: analysis.confidence, sent: analysis.send_alert }
          } catch (pairErr: any) {
            return { pair, error: pairErr.message }
          }
        }))

        return pairResults
      } catch (userErr: any) {
        return [{ user_id: cfg.user_id, error: userErr.message }]
      }
    }))

    const results = allResults.flat()
    return NextResponse.json({ ok: true, scanned: results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
