import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runAnchorBreakAgent, matchTactics, fetchCandles, fetchNews } from '@/lib/agent-ab'
import { runOvernightTradeAgent } from '@/lib/agent-ot'
import { sendAlertEmail } from '@/lib/resend'

export const maxDuration = 300

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const nyHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
    const nyMinute = now.getMinutes()
    const nyDay = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' })

    // Overnight Trade: solo se ANALIZA entre 7PM y 8PM EST
    const isOvernightAnalysisWindow = nyHour >= 19 && nyHour < 20

    // Anchor Break: corre en cualquier hora de mercado
    const isMarketHours = nyHour >= 8 && nyHour < 19

    // Weekend skip
    const isFridayAfterClose = nyDay === 'Friday' && nyHour >= 17
    const isSaturdayAllDay = nyDay === 'Saturday'
    const isSundayBeforeOpen = nyDay === 'Sunday' && nyHour < 17
    if (isFridayAfterClose || isSaturdayAllDay || isSundayBeforeOpen) {
      return NextResponse.json({ ok: true, message: 'Market closed — weekend skip' })
    }

    // Smart cron: fuera de market hours solo corre en :00 y :30
    if (!isMarketHours && !isOvernightAnalysisWindow && nyMinute !== 0 && nyMinute !== 30) {
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

        // Duplicate check — solo para Anchor Break
        const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
        const recentABEntries: Record<string, number | null> = {}
        const activePairsAB: string[] = []

        await Promise.all(pairs.map(async ({ pair }: { pair: string }) => {
          const { data: veryRecentAlert } = await supabase
            .from('alerts')
            .select('id')
            .eq('user_id', cfg.user_id)
            .eq('pair', pair)
            .in('signal', ['BUY', 'SELL'])
            .gte('created_at', thirtyMinAgo)
            .limit(1)
            .maybeSingle()

          if (veryRecentAlert) return

          const { data: lastAlert } = await supabase
            .from('alerts')
            .select('entry')
            .eq('user_id', cfg.user_id)
            .eq('pair', pair)
            .in('signal', ['BUY', 'SELL'])
            .gte('created_at', fourHoursAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          recentABEntries[pair] = lastAlert?.entry ? parseFloat(lastAlert.entry) : null
          activePairsAB.push(pair)
        }))

        // News cache para todos los pares
        const allPairsList = pairs.map(({ pair }: { pair: string }) => pair)
        const activeCurrencySet = new Set<string>()
        allPairsList.forEach((pair: string) => pair.split('_').forEach((c: string) => activeCurrencySet.add(c)))
        const newsCache: Record<string, string> = {}
        await Promise.all(Array.from(activeCurrencySet).map(async (currency: string) => {
          newsCache[currency] = await fetchNews(currency)
        }))

        const isSameSetup = (pair: string, newEntry: number | null): boolean => {
          if (!newEntry) return false
          const lastEntry = recentABEntries[pair]
          if (!lastEntry) return false
          const pipSize = pair.includes('JPY') ? 0.01 : 0.0001
          const diffPips = Math.abs(newEntry - lastEntry) / pipSize
          return diffPips <= 10
        }

        const logScan = async (pair: string, analysis: any, strategy: string) => {
          const { error } = await supabase.from('scan_logs').insert({
            user_id: cfg.user_id,
            pair,
            signal: analysis.signal || 'UNKNOWN',
            confidence: analysis.confidence || 0,
            htf_state: analysis.htf_state || analysis.market_state || null,
            strategy,
            skip_reason: analysis.skip_reason || null,
            reasoning: analysis.reasoning || null,
          })
          if (error) console.error('[LOG INSERT ERROR]', pair, strategy, error.message)
          else console.log('[LOG SUCCESS]', pair, strategy, 'signal=' + analysis.signal)
        }

        const insertAndSendAlert = async (pair: string, analysis: any, strategy: string, timeframeFallback: string) => {
          if (analysis.signal === 'WAIT') return
          const { data: insertedAlert } = await supabase
            .from('alerts')
            .insert({
              user_id: cfg.user_id,
              pair,
              signal: analysis.signal,
              confidence: analysis.confidence,
              entry: analysis.entry || null,
              stop_loss: analysis.stop_loss || null,
              take_profit: analysis.take_profit || null,
              timeframe: analysis.timeframe || timeframeFallback,
              reasoning: analysis.reasoning,
              strategy,
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
        }

        const pairResults = await Promise.all(allPairsList.map(async (pair: string) => {
          const results: any[] = []
          const [base_currency, quote_currency] = pair.split('_')
          const news = [newsCache[base_currency], newsCache[quote_currency]].filter(Boolean).join('\n\n')

          // ════════════════════════════════
          // ANCHOR BREAK — corre siempre en market hours
          // ════════════════════════════════
          if (activePairsAB.includes(pair)) {
            console.log('[AB SCAN START]', pair)
            try {
              const [H3, M30, M5, tactics] = await Promise.all([
                fetchCandles(cfg.api_key, cfg.environment, pair, 'H3', 48),
                fetchCandles(cfg.api_key, cfg.environment, pair, 'M30', 60),
                fetchCandles(cfg.api_key, cfg.environment, pair, 'M5', 24),
                matchTactics(supabase, cfg.user_id, 'Anchor Break setup ' + pair + ' - HTF trend supply demand M30 M5 entry'),
              ])
              console.log('[AB CANDLES OK]', pair, 'H3=' + H3.length, 'M30=' + M30.length, 'M5=' + M5.length)
              if (pair === 'AUD_USD') {
  const { buildChartContextAB } = await import('@/lib/agent-ab')
  console.log('[AUD_USD CONTEXT]', buildChartContextAB({ H3, M30, M5 }, pair).substring(0, 6000))
}

              // Freshness check M5 — datos no más de 15 min de antiguedad
              const lastM5 = M5[M5.length - 1]
              if (lastM5) {
                const minutesAgo = (now.getTime() - new Date(lastM5.t).getTime()) / 60000
                if (minutesAgo > 15) {
                  console.log('[AB M5 STALE]', pair, Math.round(minutesAgo) + 'min')
                  results.push({ pair, strategy: 'anchor_break', signal: 'SKIP', reason: 'Stale M5: ' + Math.round(minutesAgo) + 'min ago' })
                  return results
                }
              }

              const analysis = await runAnchorBreakAgent({
                pair, candles: { H3, M30, M5 }, positions, news, tactics, minConfidence
              })
              console.log('[AB AGENT OK]', pair, 'signal=' + analysis.signal)

              await logScan(pair, analysis, 'anchor_break')

              if (analysis.send_alert && isSameSetup(pair, analysis.entry)) {
                results.push({ pair, strategy: 'anchor_break', signal: 'SKIP', reason: 'Mismo setup — entry similar al último' })
              } else {
                await insertAndSendAlert(pair, analysis, 'anchor_break', 'M30')
                results.push({ pair, strategy: 'anchor_break', signal: analysis.signal, confidence: analysis.confidence, sent: analysis.send_alert })
              }
            } catch (err: any) {
              console.error('[AB SCAN ERROR]', pair, err.message)
              await supabase.from('scan_logs').insert({
                user_id: cfg.user_id, pair, signal: 'ERROR', confidence: 0,
                strategy: 'anchor_break', skip_reason: err.message, reasoning: null,
              })
              results.push({ pair, strategy: 'anchor_break', error: err.message })
            }
          } else {
            results.push({ pair, strategy: 'anchor_break', signal: 'SKIP', reason: 'Setup AB reciente en progreso' })
          }

          // ════════════════════════════════
          // OVERNIGHT TRADE — solo 7PM-8PM EST
          // ════════════════════════════════
          if (isOvernightAnalysisWindow) {
            console.log('[OT SCAN START]', pair)
            try {
              const [W, D, H4, tactics] = await Promise.all([
                fetchCandles(cfg.api_key, cfg.environment, pair, 'W', 24),
                fetchCandles(cfg.api_key, cfg.environment, pair, 'D', 30),
                fetchCandles(cfg.api_key, cfg.environment, pair, 'H4', 48),
                matchTactics(supabase, cfg.user_id, 'Overnight trade setup ' + pair + ' - Daily trend anchor whitespace H4 level'),
              ])

              // Freshness check H4
              const lastH4 = H4[H4.length - 1]
              if (lastH4) {
                const minutesAgo = (now.getTime() - new Date(lastH4.t).getTime()) / 60000
                if (minutesAgo > 240) {
                  results.push({ pair, strategy: 'overnight_trade', signal: 'SKIP', reason: 'Stale H4: ' + Math.round(minutesAgo) + 'min ago' })
                  return results
                }
              }

              const analysis = await runOvernightTradeAgent({
                pair, candles: { W, D, H4 }, positions, news, tactics, minConfidence
              })
              console.log('[OT AGENT OK]', pair, 'signal=' + analysis.signal)

              await logScan(pair, analysis, 'overnight_trade')
              await insertAndSendAlert(pair, analysis, 'overnight_trade', 'H4')
              results.push({ pair, strategy: 'overnight_trade', signal: analysis.signal, confidence: analysis.confidence, sent: analysis.send_alert })
            } catch (err: any) {
              console.error('[OT SCAN ERROR]', pair, err.message)
              await supabase.from('scan_logs').insert({
                user_id: cfg.user_id, pair, signal: 'ERROR', confidence: 0,
                strategy: 'overnight_trade', skip_reason: err.message, reasoning: null,
              })
              results.push({ pair, strategy: 'overnight_trade', error: err.message })
            }
          }

          return results
        }))

        return pairResults.flat()
      } catch (userErr: any) {
        console.error('[SCAN ERROR] user=' + cfg.user_id, userErr.message)
        return [{ user_id: cfg.user_id, error: userErr.message }]
      }
    }))

    const results = allResults.flat()
    return NextResponse.json({
      ok: true,
      scanned: results,
      strategies_run: isOvernightAnalysisWindow ? ['anchor_break', 'overnight_trade'] : ['anchor_break']
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

