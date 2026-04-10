import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runForexAgent, matchTactics, fetchCandles, fetchNews } from '@/lib/agent'
import { sendAlertEmail } from '@/lib/resend'

export const maxDuration = 300

export async function GET(req: Request) {
  try {
    // Verify cron secret
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Get all users with Oanda configs
    const { data: configs } = await supabase
      .from('oanda_configs')
      .select('user_id, api_key, account_id, environment')

    if (!configs || configs.length === 0) {
      return NextResponse.json({ ok: true, message: 'No users configured' })
    }

    const results = []

    for (const cfg of configs) {
      try {
        // Get user email
        const { data: { user } } = await supabase.auth.admin.getUserById(cfg.user_id)
        if (!user?.email) continue

        // Get user preferences
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('min_confidence')
          .eq('user_id', cfg.user_id)
          .single()
        const minConfidence = prefs?.min_confidence ?? 70

        // Get watched pairs
        const { data: pairs } = await supabase
          .from('watched_pairs')
          .select('pair')
          .eq('user_id', cfg.user_id)
          .eq('active', true)

        if (!pairs || pairs.length === 0) continue

        // Get open positions
        const base = cfg.environment === 'live'
          ? 'https://api-fxtrade.oanda.com'
          : 'https://api-fxpractice.oanda.com'

        let positions = []
        try {
          const posRes = await fetch(`${base}/v3/accounts/${cfg.account_id}/openPositions`, {
            headers: { Authorization: `Bearer ${cfg.api_key}` }
          })
          const posData = await posRes.json()
          positions = posData.positions || []
        } catch {}

        // Analyze each pair
        for (const { pair } of pairs) {
          try {
            // Fetch candles for all timeframes
            const [W, D, H4, H1] = await Promise.all([
              fetchCandles(cfg.api_key, cfg.environment, pair, 'W', 20),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'D', 30),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'H4', 50),
              fetchCandles(cfg.api_key, cfg.environment, pair, 'H1', 50),
            ])

            // Fetch news
            const news = await fetchNews(pair)

            // Match relevant tactics
            const tacticsQuery = `Overnight trade setup for ${pair} - trend analysis whitespace anchor`
            const tactics = await matchTactics(supabase, cfg.user_id, tacticsQuery)

            // Run agent
            const analysis = await runForexAgent({
              pair,
              candles: { W, D, H4, H1 },
              positions,
              news,
              tactics,
              minConfidence,
            })

            // Save alert to DB
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

            // Send email if warranted
            if (analysis.send_alert) {
              await sendAlertEmail({ to: user.email, analysis })

              // Mark email sent
              await supabase
                .from('alerts')
                .update({ email_sent: true })
                .eq('user_id', cfg.user_id)
                .eq('pair', pair)
                .order('created_at', { ascending: false })
                .limit(1)
            }

            results.push({ pair, signal: analysis.signal, confidence: analysis.confidence, sent: analysis.send_alert })
          } catch (pairErr: any) {
            results.push({ pair, error: pairErr.message })
          }
        }
      } catch (userErr: any) {
        results.push({ user_id: cfg.user_id, error: userErr.message })
      }
    }

    return NextResponse.json({ ok: true, scanned: results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
