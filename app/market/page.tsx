'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const TIMEFRAMES = ['M5', 'M15', 'H1', 'H4', 'D']
const PAIRS = ['EUR_USD', 'USD_JPY', 'GBP_USD', 'AUD_USD', 'USD_CAD', 'EUR_JPY', 'GBP_JPY', 'XAU_USD']
const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
]

function fmtNum(n: any, dec = 2) {
  const v = parseFloat(String(n))
  return isNaN(v) ? '—' : v.toFixed(dec)
}
function fmtPnl(n: any) {
  const v = parseFloat(String(n))
  if (isNaN(v)) return { txt: '—', color: '#5a6480' }
  return { txt: (v >= 0 ? '+' : '') + v.toFixed(2), color: v >= 0 ? '#00d4a0' : '#ff4d6a' }
}

function drawCandles(canvas: HTMLCanvasElement, data: any[]) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const w = rect.width
  const h = rect.height
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#070a10'
  ctx.fillRect(0, 0, w, h)

  const pad = { top: 24, bottom: 32, left: 8, right: 72 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const highs = data.map(d => d.h)
  const lows = data.map(d => d.l)
  const maxP = Math.max(...highs)
  const minP = Math.min(...lows)
  const range = maxP - minP || 0.001
  const priceToY = (p: number) => pad.top + chartH - ((p - minP) / range) * chartH

  const n = data.length
  const gap = chartW / n
  const candleW = Math.max(1, gap * 0.65)

  ctx.strokeStyle = '#1e2a40'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (chartH / 5) * i
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke()
    const price = maxP - (range / 5) * i
    ctx.fillStyle = '#5a6480'
    ctx.font = `10px 'Space Mono', monospace`
    ctx.textAlign = 'left'
    ctx.fillText(price.toFixed(5), w - pad.right + 4, y + 4)
  }

  data.forEach((d, i) => {
    const x = pad.left + i * gap + gap / 2
    const isUp = d.c >= d.o
    const color = isUp ? '#00d4a0' : '#ff4d6a'
    const bodyTop = priceToY(Math.max(d.o, d.c))
    const bodyBot = priceToY(Math.min(d.o, d.c))
    const bodyH = Math.max(1, bodyBot - bodyTop)

    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, priceToY(d.h))
    ctx.lineTo(x, priceToY(d.l))
    ctx.stroke()

    ctx.fillStyle = isUp ? 'rgba(0,212,160,0.85)' : 'rgba(255,77,106,0.85)'
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)
  })

  ctx.fillStyle = '#5a6480'
  ctx.font = `9px 'Space Mono', monospace`
  ctx.textAlign = 'center'
  const step = Math.max(1, Math.floor(n / 7))
  for (let i = 0; i < n; i += step) {
    const d = data[i]
    const x = pad.left + i * gap + gap / 2
    const t = new Date(d.t)
    const label = t.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })
    ctx.fillText(label, x, h - 8)
  }
}

export default function MarketPage() {
  const [pair, setPair] = useState('EUR_USD')
  const [tf, setTf] = useState('H1')
  const [candles, setCandles] = useState<any[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState('')
  const [lastCandle, setLastCandle] = useState<any>(null)
  const [refreshInterval, setRefreshInterval] = useState(0)
  const [countdown, setCountdown] = useState(0)

  const [positions, setPositions] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)

  const loadCandles = useCallback(async () => {
    setChartLoading(true)
    setChartError('')
    try {
      const countMap: Record<string, number> = { M5: 100, M15: 100, H1: 100, H4: 80, D: 60 }
      const res = await fetch(`/api/oanda/candles?instrument=${pair}&granularity=${tf}&count=${countMap[tf] || 100}`)
      const data = await res.json()
      if (data.error) { setChartError(data.error); return }
      const parsed = (data.candles || []).map((c: any) => ({
        t: c.time, o: parseFloat(c.mid.o), h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l), c: parseFloat(c.mid.c)
      }))
      setCandles(parsed)
      if (parsed.length) setLastCandle(parsed[parsed.length - 1])
    } catch (e: any) {
      setChartError(e.message)
    } finally {
      setChartLoading(false)
    }
  }, [pair, tf])

  const loadPositionsAndTrades = useCallback(async () => {
    setDataLoading(true)
    try {
      const [posRes, tradeRes] = await Promise.all([
        fetch('/api/oanda/positions'),
        fetch('/api/oanda/trades')
      ])
      const posData = await posRes.json()
      const tradeData = await tradeRes.json()
      setPositions(posData.positions || [])
      setTrades(tradeData.trades || [])
    } catch {}
    finally { setDataLoading(false) }
  }, [])

  // Auto-refresh logic
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)

    if (refreshInterval > 0) {
      setCountdown(refreshInterval)
      refreshTimerRef.current = setInterval(() => {
        loadCandles()
        setCountdown(refreshInterval)
      }, refreshInterval * 1000)

      countdownTimerRef.current = setInterval(() => {
        setCountdown(prev => prev <= 1 ? refreshInterval : prev - 1)
      }, 1000)
    } else {
      setCountdown(0)
    }

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [refreshInterval, loadCandles])

  useEffect(() => { loadCandles() }, [loadCandles])
  useEffect(() => { loadPositionsAndTrades() }, [loadPositionsAndTrades])

  useEffect(() => {
    if (candles.length && canvasRef.current) drawCandles(canvasRef.current, candles)
  }, [candles])

  useEffect(() => {
    const handleResize = () => {
      if (candles.length && canvasRef.current) drawCandles(canvasRef.current, candles)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [candles])

  const mono = { fontFamily: 'Space Mono, monospace' }
  const sans = { fontFamily: 'Syne, sans-serif' }
  const card = { background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', overflow: 'hidden' as const }
  const panelHeader = { padding: '12px 18px', borderBottom: '1px solid #1e2a40', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
  const panelTitle = { ...mono, fontSize: '10px', color: '#00d4a0', letterSpacing: '3px' }
  const signalColor = (s: string) => s === 'BUY' ? '#00d4a0' : s === 'SELL' ? '#ff4d6a' : '#f0b429'

  return (
    <div style={{ padding: '32px', maxWidth: '1300px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ ...mono, fontSize: '10px', color: '#5a6480', letterSpacing: '3px', marginBottom: '6px' }}>MERCADO</div>
        <h1 style={{ ...sans, fontSize: '28px', fontWeight: 800, color: '#e8eaf0', margin: 0 }}>Terminal de Mercado</h1>
      </div>

      {/* Chart Panel */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2a40', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const }}>
          <span style={{ ...mono, fontSize: '10px', color: '#00d4a0', letterSpacing: '3px' }}>VELAS</span>

          {/* Pair selector */}
          <select value={pair} onChange={e => setPair(e.target.value)}
            style={{ background: '#070a10', border: '1px solid #1e2a40', borderRadius: '6px', padding: '5px 10px', color: '#e8eaf0', ...mono, fontSize: '12px' }}>
            {PAIRS.map(p => <option key={p} value={p}>{p.replace('_', '/')}</option>)}
          </select>

          {/* Timeframe buttons */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {TIMEFRAMES.map(t => (
              <button key={t} onClick={() => setTf(t)} style={{
                padding: '4px 10px', borderRadius: '5px', cursor: 'pointer',
                border: tf === t ? 'none' : '1px solid #1e2a40',
                background: tf === t ? '#00d4a0' : 'transparent',
                color: tf === t ? '#000' : '#5a6480',
                ...mono, fontSize: '10px', fontWeight: tf === t ? 700 : 400, transition: 'all .15s'
              }}>{t}</button>
            ))}
          </div>

          {/* Auto-refresh */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ ...mono, fontSize: '9px', color: '#5a6480', letterSpacing: '1px' }}>AUTO</span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {REFRESH_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setRefreshInterval(opt.value)} style={{
                  padding: '4px 9px', borderRadius: '5px', cursor: 'pointer',
                  border: refreshInterval === opt.value ? 'none' : '1px solid #1e2a40',
                  background: refreshInterval === opt.value ? (opt.value === 0 ? '#1e2a40' : '#f0b429') : 'transparent',
                  color: refreshInterval === opt.value ? (opt.value === 0 ? '#5a6480' : '#000') : '#5a6480',
                  ...mono, fontSize: '9px', fontWeight: 700, transition: 'all .15s'
                }}>{opt.label}</button>
              ))}
            </div>
            {refreshInterval > 0 && (
              <span style={{ ...mono, fontSize: '10px', color: '#f0b429', minWidth: '24px' }}>{countdown}s</span>
            )}
          </div>

          <button onClick={loadCandles} style={{
            background: 'transparent', border: '1px solid #1e2a40', color: '#5a6480',
            borderRadius: '5px', padding: '4px 10px', cursor: 'pointer', ...mono, fontSize: '10px'
          }}>↻</button>
        </div>

        {/* Canvas */}
        <div style={{ position: 'relative', height: '340px', padding: '8px' }}>
          {chartLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', ...mono, fontSize: '12px', color: '#5a6480' }}>
              <div style={{ width: '14px', height: '14px', border: '2px solid #1e2a40', borderTopColor: '#00d4a0', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              Cargando velas...
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {chartError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: '12px', color: '#ff4d6a' }}>
              ✗ {chartError}
            </div>
          )}
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: chartLoading || chartError ? 'none' : 'block', borderRadius: '6px' }} />
        </div>

        {lastCandle && (
          <div style={{ display: 'flex', gap: '20px', padding: '8px 16px 14px', flexWrap: 'wrap' as const }}>
            {[
              { label: 'O', value: lastCandle.o.toFixed(5), color: '#e8eaf0' },
              { label: 'H', value: lastCandle.h.toFixed(5), color: '#00d4a0' },
              { label: 'L', value: lastCandle.l.toFixed(5), color: '#ff4d6a' },
              { label: 'C', value: lastCandle.c.toFixed(5), color: '#e8eaf0' },
              { label: 'TF', value: tf, color: '#f0b429' },
              { label: 'Velas', value: String(candles.length), color: '#5a6480' },
              ...(refreshInterval > 0 ? [{ label: 'Refresh', value: `${refreshInterval}s`, color: '#f0b429' }] : []),
            ].map(item => (
              <div key={item.label} style={{ ...mono, fontSize: '10px', color: '#5a6480' }}>
                {item.label}: <span style={{ color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Positions + Trades */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={card}>
          <div style={panelHeader}>
            <span style={panelTitle}>POSICIONES ABIERTAS</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ ...mono, fontSize: '10px', color: '#5a6480' }}>{positions.length}</span>
              <button onClick={loadPositionsAndTrades} style={{ background: 'transparent', border: '1px solid #1e2a40', color: '#5a6480', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', ...mono, fontSize: '10px' }}>↻</button>
            </div>
          </div>
          {dataLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', ...mono, fontSize: '11px', color: '#5a6480' }}>Cargando...</div>
          ) : !positions.length ? (
            <div style={{ padding: '32px', textAlign: 'center', ...mono, fontSize: '11px', color: '#5a6480' }}>Sin posiciones abiertas</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>{['Par', 'Lado', 'Unidades', 'P&L'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 18px', ...mono, fontSize: '9px', color: '#5a6480', letterSpacing: '2px', borderBottom: '1px solid #1e2a40' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {positions.map((p: any) => {
                  const longUnits = parseFloat(p.long?.units || 0)
                  const shortUnits = parseFloat(p.short?.units || 0)
                  const units = parseFloat(t.currentUnits) || parseFloat(t.initialUnits)
const side = units > 0 ? 'LONG' : 'SHORT'
const pnl = fmtPnl(t.realizedPL ?? t.unrealizedPL)
                  return (
                    <tr key={p.instrument} onClick={() => setPair(p.instrument)} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '12px', color: '#e8eaf0', borderBottom: '1px solid rgba(30,42,64,.4)' }}>{p.instrument.replace('_', '/')}</td>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '11px', color: signalColor(side === 'LONG' ? 'BUY' : 'SELL'), borderBottom: '1px solid rgba(30,42,64,.4)' }}>{side}</td>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '11px', color: '#e8eaf0', borderBottom: '1px solid rgba(30,42,64,.4)' }}>{fmtNum(Math.abs(units), 0)}</td>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '11px', color: pnl.color, borderBottom: '1px solid rgba(30,42,64,.4)' }}>{pnl.txt}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={card}>
          <div style={panelHeader}>
            <span style={panelTitle}>TRADES RECIENTES</span>
            <span style={{ ...mono, fontSize: '10px', color: '#5a6480' }}>{trades.length}</span>
          </div>
          {dataLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', ...mono, fontSize: '11px', color: '#5a6480' }}>Cargando...</div>
          ) : !trades.length ? (
            <div style={{ padding: '32px', textAlign: 'center', ...mono, fontSize: '11px', color: '#5a6480' }}>Sin trades recientes</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>{['Par', 'Lado', 'Precio', 'P&L'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 18px', ...mono, fontSize: '9px', color: '#5a6480', letterSpacing: '2px', borderBottom: '1px solid #1e2a40' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {trades.map((t: any) => {
                  const units = parseFloat(t.currentUnits)
                  const side = units > 0 ? 'LONG' : 'SHORT'
                  const pnl = fmtPnl(t.unrealizedPL)
                  return (
                    <tr key={t.id} onClick={() => setPair(t.instrument)} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '12px', color: '#e8eaf0', borderBottom: '1px solid rgba(30,42,64,.4)' }}>{t.instrument.replace('_', '/')}</td>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '11px', color: signalColor(side === 'LONG' ? 'BUY' : 'SELL'), borderBottom: '1px solid rgba(30,42,64,.4)' }}>{side}</td>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '11px', color: '#e8eaf0', borderBottom: '1px solid rgba(30,42,64,.4)' }}>{fmtNum(t.price, 5)}</td>
                      <td style={{ padding: '11px 18px', ...mono, fontSize: '11px', color: pnl.color, borderBottom: '1px solid rgba(30,42,64,.4)' }}>{pnl.txt}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

