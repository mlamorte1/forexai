import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AlertRow from './alert-row'
import Sidebar from '@/components/Sidebar'

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: { pair?: string; signal?: string; page?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const page = parseInt(searchParams.page || '1')
  const pageSize = 20
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('alerts')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .in('signal', ['BUY', 'SELL'])
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (searchParams.pair) query = query.eq('pair', searchParams.pair)
  if (searchParams.signal) query = query.eq('signal', searchParams.signal)

  const { data: alerts, count } = await query

  // Stats
  const { data: allAlerts } = await supabase
    .from('alerts')
    .select('signal, confidence, email_sent')
    .eq('user_id', user.id)

  const total = allAlerts?.length ?? 0
  const buys = allAlerts?.filter(a => a.signal === 'BUY').length ?? 0
  const sells = allAlerts?.filter(a => a.signal === 'SELL').length ?? 0
  const emailsSent = allAlerts?.filter(a => a.email_sent).length ?? 0
  const avgConf = total > 0
    ? Math.round((allAlerts?.reduce((s, a) => s + (a.confidence || 0), 0) ?? 0) / total)
    : 0

  const signalColor = (s: string) =>
    s === 'BUY' ? '#00d4a0' : s === 'SELL' ? '#ff4d6a' : '#f0b429'

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0d14' }}>
      <Sidebar email={user.email ?? ''} />
      <main style={{ marginLeft: '220px', flex: 1, minHeight: '100vh' }}>
        <div style={{ padding: '32px', maxWidth: '1200px' }}>
          {/* Header */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', letterSpacing: '3px', marginBottom: '6px' }}>
              HISTORIAL
            </div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '28px', fontWeight: 800, color: '#e8eaf0', margin: 0 }}>
              Alertas
            </h1>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '28px' }}>
            {[
              { label: 'Total Scans', value: String(total), color: '#e8eaf0' },
              { label: 'BUY', value: String(buys), color: '#00d4a0' },
              { label: 'SELL', value: String(sells), color: '#ff4d6a' },
              { label: 'Emails Enviados', value: String(emailsSent), color: '#00d4a0' },
              { label: 'Confianza Prom.', value: `${avgConf}%`, color: '#e8eaf0' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: '#0f1420', border: '1px solid #1e2a40',
                borderRadius: '10px', padding: '16px 20px'
              }}>
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  {stat.label}
                </div>
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '22px', fontWeight: 700, color: stat.color }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{
            background: '#0f1420', border: '1px solid #1e2a40',
            borderRadius: '10px', padding: '14px 20px', marginBottom: '16px',
            display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap'
          }}>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', letterSpacing: '2px' }}>FILTRAR:</span>
            {['', 'BUY', 'SELL'].map(s => (
              <a key={s} href={`/alerts?${new URLSearchParams({ ...searchParams, signal: s, page: '1' }).toString()}`} style={{
                fontFamily: 'Space Mono, monospace', fontSize: '10px',
                padding: '4px 12px', borderRadius: '4px', textDecoration: 'none',
                background: (searchParams.signal || '') === s ? signalColor(s) + '20' : 'transparent',
                border: `1px solid ${(searchParams.signal || '') === s ? signalColor(s) + '60' : '#1e2a40'}`,
                color: (searchParams.signal || '') === s ? signalColor(s) : '#5a6480',
              }}>
                {s || 'TODOS'}
              </a>
            ))}
            {['', 'EUR_USD', 'USD_JPY', 'AUD_USD', 'EUR_JPY', 'USD_CAD'].map(p => (
              <a key={p} href={`/alerts?${new URLSearchParams({ ...searchParams, pair: p, page: '1' }).toString()}`} style={{
                fontFamily: 'Space Mono, monospace', fontSize: '10px',
                padding: '4px 12px', borderRadius: '4px', textDecoration: 'none',
                background: (searchParams.pair || '') === p ? 'rgba(0,212,160,0.1)' : 'transparent',
                border: `1px solid ${(searchParams.pair || '') === p ? 'rgba(0,212,160,0.3)' : '#1e2a40'}`,
                color: (searchParams.pair || '') === p ? '#00d4a0' : '#5a6480',
              }}>
                {p ? p.replace('_', '/') : 'TODOS'}
              </a>
            ))}
          </div>

          {/* Table */}
          <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 110px 70px 80px 80px 80px 1fr 100px',
              padding: '10px 20px', borderBottom: '1px solid #1e2a40',
              fontFamily: 'Space Mono, monospace', fontSize: '9px', color: '#5a6480', letterSpacing: '2px'
            }}>
              <span>SEÑAL</span>
              <span>PAR</span>
              <span>CONF.</span>
              <span>ENTRY</span>
              <span>SL</span>
              <span>TP</span>
              <span>RAZONAMIENTO</span>
              <span style={{ textAlign: 'right' }}>HORA</span>
            </div>

            {!alerts?.length ? (
              <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480' }}>
                Sin alertas para este filtro
              </div>
            ) : alerts.map(alert => <AlertRow key={alert.id} alert={alert} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <a key={p} href={`/alerts?${new URLSearchParams({ ...searchParams, page: String(p) }).toString()}`} style={{
                  fontFamily: 'Space Mono, monospace', fontSize: '11px',
                  padding: '6px 12px', borderRadius: '6px', textDecoration: 'none',
                  background: page === p ? 'rgba(0,212,160,0.1)' : 'transparent',
                  border: `1px solid ${page === p ? 'rgba(0,212,160,0.3)' : '#1e2a40'}`,
                  color: page === p ? '#00d4a0' : '#5a6480',
                }}>
                  {p}
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
