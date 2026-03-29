import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function getOandaData(apiKey: string, accountId: string, env: string) {
  const base = env === 'live'
    ? 'https://api-fxtrade.oanda.com'
    : 'https://api-fxpractice.oanda.com'

  try {
    const res = await fetch(`${base}/v3/accounts/${accountId}/summary`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 }
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.account
  } catch { return null }
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Get Oanda config
  const { data: oandaConfig } = await supabase
    .from('oanda_configs')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Get recent alerts
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Get watched pairs
  const { data: pairs } = await supabase
    .from('watched_pairs')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)

  let account = null
  if (oandaConfig) {
    account = await getOandaData(oandaConfig.api_key, oandaConfig.account_id, oandaConfig.environment)
  }

  const fmtNum = (n: string | number, dec = 2) => {
    const v = parseFloat(String(n))
    return isNaN(v) ? '—' : v.toFixed(dec)
  }

  const fmtPnl = (n: string | number) => {
    const v = parseFloat(String(n))
    if (isNaN(v)) return { txt: '—', color: '#5a6480' }
    return { txt: (v >= 0 ? '+' : '') + v.toFixed(2), color: v >= 0 ? '#00d4a0' : '#ff4d6a' }
  }

  const signalColor = (s: string) =>
    s === 'BUY' ? '#00d4a0' : s === 'SELL' ? '#ff4d6a' : '#f0b429'

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', letterSpacing: '3px', marginBottom: '6px' }}>
          OVERVIEW
        </div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '28px', fontWeight: 800, color: '#e8eaf0', margin: 0 }}>
          Dashboard
        </h1>
      </div>

      {/* No config warning */}
      {!oandaConfig && (
        <div style={{
          background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.2)',
          borderRadius: '10px', padding: '16px 20px', marginBottom: '24px',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ color: '#f0b429', fontFamily: 'Space Mono, monospace', fontSize: '12px' }}>⚠</span>
          <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '14px', color: '#f0b429' }}>
            Conecta tu cuenta Oanda para activar el agente.{' '}
            <a href="/settings" style={{ color: '#00d4a0', textDecoration: 'underline' }}>Ir a Configuración →</a>
          </span>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Balance', value: account ? `${fmtNum(account.balance)} ${account.currency}` : '—', color: '#f0b429' },
          { label: 'NAV', value: account ? fmtNum(account.NAV) : '—', color: '#e8eaf0' },
          { label: 'P&L No Realizado', value: account ? fmtPnl(account.unrealizedPL).txt : '—', color: account ? fmtPnl(account.unrealizedPL).color : '#5a6480' },
          { label: 'Margen Usado', value: account ? fmtNum(account.marginUsed) : '—', color: '#e8eaf0' },
          { label: 'Trades Abiertos', value: account ? String(account.openTradeCount ?? 0) : '—', color: '#e8eaf0' },
          { label: 'Alertas Hoy', value: String(alerts?.filter(a => new Date(a.created_at).toDateString() === new Date().toDateString()).length ?? 0), color: '#00d4a0' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#0f1420', border: '1px solid #1e2a40',
            borderRadius: '10px', padding: '18px 20px'
          }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '20px', fontWeight: 700, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Two columns: Alerts + Pairs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Recent Alerts */}
        <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e2a40', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0', letterSpacing: '3px' }}>ALERTAS RECIENTES</span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>{alerts?.length ?? 0} total</span>
          </div>
          {!alerts?.length ? (
            <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480' }}>
              Sin alertas aún — el agente está escaneando
            </div>
          ) : (
            <div>
              {alerts.map(alert => {
                const pnl = fmtPnl(0)
                return (
                  <div key={alert.id} style={{
                    padding: '14px 20px', borderBottom: '1px solid rgba(30,42,64,0.5)',
                    display: 'flex', alignItems: 'center', gap: '12px'
                  }}>
                    <div style={{
                      background: signalColor(alert.signal) + '18',
                      color: signalColor(alert.signal),
                      fontFamily: 'Space Mono, monospace', fontSize: '10px', fontWeight: 700,
                      padding: '3px 8px', borderRadius: '4px', minWidth: '44px', textAlign: 'center'
                    }}>
                      {alert.signal}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: '#e8eaf0' }}>{alert.pair?.replace('_', '/')}</div>
                      <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>{alert.timeframe} · {alert.confidence}% conf.</div>
                    </div>
                    <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>
                      {new Date(alert.created_at).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Watched Pairs */}
        <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e2a40', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0', letterSpacing: '3px' }}>PARES MONITOREADOS</span>
            <a href="/settings" style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', textDecoration: 'none' }}>+ Editar</a>
          </div>
          {!pairs?.length ? (
            <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480' }}>
              Configura tus pares en <a href="/settings" style={{ color: '#00d4a0' }}>Configuración</a>
            </div>
          ) : (
            <div>
              {pairs.map(pair => (
                <div key={pair.id} style={{
                  padding: '14px 20px', borderBottom: '1px solid rgba(30,42,64,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '13px', color: '#e8eaf0' }}>
                    {pair.pair.replace('_', '/')}
                  </span>
                  <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0' }}>● activo</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent status */}
      <div style={{
        marginTop: '16px', background: '#0f1420', border: '1px solid #1e2a40',
        borderRadius: '10px', padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: '12px'
      }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: oandaConfig ? '#00d4a0' : '#5a6480',
          boxShadow: oandaConfig ? '0 0 8px #00d4a0' : 'none',
          animation: oandaConfig ? 'pulse 2s infinite' : 'none'
        }} />
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480' }}>
          {oandaConfig
            ? `Agente activo · escaneando cada 15 min · entorno ${oandaConfig.environment.toUpperCase()}`
            : 'Agente inactivo · configura Oanda para activar'}
        </span>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      </div>
    </div>
  )
}
