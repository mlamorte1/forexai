'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const DEFAULT_PAIRS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'EUR_JPY', 'GBP_JPY', 'XAU_USD']

type Section = 'oanda' | 'pairs' | 'notifications'

export default function SettingsPage() {
  const supabase = createClient()
  const [section, setSection] = useState<Section>('oanda')
  const [userId, setUserId] = useState('')

  // Oanda
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [env, setEnv] = useState<'practice' | 'live'>('practice')
  const [oandaSaving, setOandaSaving] = useState(false)
  const [oandaMsg, setOandaMsg] = useState<{ text: string, ok: boolean } | null>(null)
  const [oandaTesting, setOandaTesting] = useState(false)
  const [hasConfig, setHasConfig] = useState(false)

  // Pairs
  const [watchedPairs, setWatchedPairs] = useState<string[]>([])
  const [pairsSaving, setPairsSaving] = useState(false)
  const [pairsMsg, setPairsMsg] = useState<{ text: string, ok: boolean } | null>(null)

  // Notifications
  const [minConfidence, setMinConfidence] = useState(70)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMsg, setNotifMsg] = useState<{ text: string, ok: boolean } | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setEmail(user.email ?? '')

      const { data: cfg } = await supabase.from('oanda_configs').select('*').eq('user_id', user.id).single()
      if (cfg) {
        setApiKey(cfg.api_key)
        setAccountId(cfg.account_id)
        setEnv(cfg.environment)
        setHasConfig(true)
      }

      const { data: pairs } = await supabase.from('watched_pairs').select('pair').eq('user_id', user.id).eq('active', true)
      if (pairs) setWatchedPairs(pairs.map((p: any) => p.pair))

      const { data: prefs } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).single()
      if (prefs) setMinConfidence(prefs.min_confidence ?? 70)
    }
    load()
  }, [])

  async function testOanda() {
    setOandaTesting(true)
    setOandaMsg(null)
    try {
      const res = await fetch('/api/oanda/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, accountId, environment: env })
      })
      const data = await res.json()
      if (data.ok) setOandaMsg({ text: `✓ Conectado — ${data.currency} · ${data.balance}`, ok: true })
      else setOandaMsg({ text: `✗ ${data.error}`, ok: false })
    } catch {
      setOandaMsg({ text: '✗ Error de conexión', ok: false })
    } finally {
      setOandaTesting(false)
    }
  }

  async function saveOanda(e: React.FormEvent) {
    e.preventDefault()
    setOandaSaving(true)
    setOandaMsg(null)
    try {
      const payload = { user_id: userId, api_key: apiKey, account_id: accountId, environment: env }
      if (hasConfig) {
        await supabase.from('oanda_configs').update(payload).eq('user_id', userId)
      } else {
        await supabase.from('oanda_configs').insert(payload)
        setHasConfig(true)
      }
      setOandaMsg({ text: '✓ Configuración guardada', ok: true })
    } catch {
      setOandaMsg({ text: '✗ Error al guardar', ok: false })
    } finally {
      setOandaSaving(false)
    }
  }

  async function savePairs() {
    setPairsSaving(true)
    setPairsMsg(null)
    try {
      await supabase.from('watched_pairs').delete().eq('user_id', userId)
      if (watchedPairs.length > 0) {
        await supabase.from('watched_pairs').insert(
          watchedPairs.map(pair => ({ user_id: userId, pair, active: true }))
        )
      }
      setPairsMsg({ text: '✓ Pares guardados', ok: true })
    } catch {
      setPairsMsg({ text: '✗ Error al guardar', ok: false })
    } finally {
      setPairsSaving(false)
    }
  }

  async function saveNotifications() {
    setNotifSaving(true)
    setNotifMsg(null)
    try {
      const { data: existing } = await supabase.from('user_preferences').select('id').eq('user_id', userId).single()
      if (existing) {
        await supabase.from('user_preferences').update({ min_confidence: minConfidence }).eq('user_id', userId)
      } else {
        await supabase.from('user_preferences').insert({ user_id: userId, min_confidence: minConfidence })
      }
      setNotifMsg({ text: '✓ Preferencias guardadas', ok: true })
    } catch {
      setNotifMsg({ text: '✗ Error al guardar', ok: false })
    } finally {
      setNotifSaving(false)
    }
  }

  const togglePair = (pair: string) => {
    setWatchedPairs(prev =>
      prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair]
    )
  }

  const sectionBtn = (id: Section, label: string) => (
    <button
      onClick={() => setSection(id)}
      style={{
        padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
        fontFamily: 'Space Mono, monospace', fontSize: '11px',
        background: section === id ? '#00d4a0' : 'transparent',
        color: section === id ? '#000' : '#5a6480',
        fontWeight: section === id ? 700 : 400,
        transition: 'all .15s'
      }}
    >
      {label}
    </button>
  )

  const inputStyle = {
    width: '100%', background: '#070a10', border: '1px solid #1e2a40',
    borderRadius: '6px', padding: '11px 14px', color: '#e8eaf0',
    fontFamily: 'Space Mono, monospace', fontSize: '13px'
  }

  const labelStyle = {
    display: 'block', fontFamily: 'Space Mono, monospace', fontSize: '10px',
    color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: '6px'
  }

  return (
    <div style={{ padding: '32px', maxWidth: '720px' }}>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', letterSpacing: '3px', marginBottom: '6px' }}>AJUSTES</div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '28px', fontWeight: 800, color: '#e8eaf0', margin: 0 }}>Configuración</h1>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '8px', padding: '6px' }}>
        {sectionBtn('oanda', 'Oanda')}
        {sectionBtn('pairs', 'Pares')}
        {sectionBtn('notifications', 'Notificaciones')}
      </div>

      {/* OANDA SECTION */}
      {section === 'oanda' && (
        <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', padding: '28px' }}>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0', letterSpacing: '3px', marginBottom: '20px' }}>
            CONEXIÓN OANDA
          </div>
          <form onSubmit={saveOanda}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Entorno</label>
              <select value={env} onChange={e => setEnv(e.target.value as any)} style={{ ...inputStyle }}>
                <option value="practice">Practice (Demo)</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>API Key</label>
              <input
                type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="Tu token de Oanda..." style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Account ID</label>
              <input
                type="text" value={accountId} onChange={e => setAccountId(e.target.value)}
                placeholder="101-001-XXXXXXX-001" style={inputStyle}
              />
            </div>
            {oandaMsg && (
              <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: oandaMsg.ok ? '#00d4a0' : '#ff4d6a', marginBottom: '16px' }}>
                {oandaMsg.text}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={testOanda} disabled={oandaTesting || !apiKey || !accountId} style={{
                padding: '11px 20px', background: 'transparent', border: '1px solid #00d4a0',
                color: '#00d4a0', borderRadius: '6px', cursor: 'pointer',
                fontFamily: 'Space Mono, monospace', fontSize: '11px',
                opacity: oandaTesting || !apiKey || !accountId ? 0.5 : 1
              }}>
                {oandaTesting ? 'Probando...' : 'Probar conexión'}
              </button>
              <button type="submit" disabled={oandaSaving || !apiKey || !accountId} style={{
                padding: '11px 24px', background: '#00d4a0', color: '#000',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', fontSize: '13px', fontWeight: 700,
                opacity: oandaSaving || !apiKey || !accountId ? 0.5 : 1
              }}>
                {oandaSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PAIRS SECTION */}
      {section === 'pairs' && (
        <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', padding: '28px' }}>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0', letterSpacing: '3px', marginBottom: '8px' }}>
            PARES A MONITOREAR
          </div>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480', marginBottom: '20px' }}>
            El agente escaneará estos pares en cada ciclo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
            {DEFAULT_PAIRS.map(pair => {
              const active = watchedPairs.includes(pair)
              return (
                <button key={pair} onClick={() => togglePair(pair)} style={{
                  padding: '12px', borderRadius: '8px', cursor: 'pointer',
                  border: active ? '1px solid #00d4a0' : '1px solid #1e2a40',
                  background: active ? 'rgba(0,212,160,0.08)' : 'transparent',
                  color: active ? '#00d4a0' : '#5a6480',
                  fontFamily: 'Space Mono, monospace', fontSize: '12px',
                  fontWeight: active ? 700 : 400, transition: 'all .15s'
                }}>
                  {pair.replace('_', '/')}
                </button>
              )
            })}
          </div>
          {pairsMsg && (
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: pairsMsg.ok ? '#00d4a0' : '#ff4d6a', marginBottom: '16px' }}>
              {pairsMsg.text}
            </div>
          )}
          <button onClick={savePairs} disabled={pairsSaving} style={{
            padding: '11px 24px', background: '#00d4a0', color: '#000',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            fontFamily: 'Syne, sans-serif', fontSize: '13px', fontWeight: 700,
            opacity: pairsSaving ? 0.5 : 1
          }}>
            {pairsSaving ? 'Guardando...' : `Guardar (${watchedPairs.length} pares)`}
          </button>
        </div>
      )}

      {/* NOTIFICATIONS SECTION */}
      {section === 'notifications' && (
        <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', padding: '28px' }}>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0', letterSpacing: '3px', marginBottom: '20px' }}>
            NOTIFICACIONES POR EMAIL
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Email de destino</label>
            <div style={{ ...inputStyle, color: '#5a6480', cursor: 'not-allowed' } as any}>{email}</div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', marginTop: '6px' }}>
              Las alertas se envían a tu email de registro
            </div>
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Confianza mínima para alertar</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
              <input
                type="range" min={50} max={95} step={5} value={minConfidence}
                onChange={e => setMinConfidence(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#00d4a0' }}
              />
              <div style={{
                fontFamily: 'Space Mono, monospace', fontSize: '16px', fontWeight: 700,
                color: '#00d4a0', minWidth: '48px', textAlign: 'right'
              }}>
                {minConfidence}%
              </div>
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', marginTop: '8px' }}>
              Solo recibirás alertas cuando el agente tenga al menos {minConfidence}% de confianza
            </div>
          </div>
          {notifMsg && (
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: notifMsg.ok ? '#00d4a0' : '#ff4d6a', marginBottom: '16px' }}>
              {notifMsg.text}
            </div>
          )}
          <button onClick={saveNotifications} disabled={notifSaving} style={{
            padding: '11px 24px', background: '#00d4a0', color: '#000',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            fontFamily: 'Syne, sans-serif', fontSize: '13px', fontWeight: 700,
            opacity: notifSaving ? 0.5 : 1
          }}>
            {notifSaving ? 'Guardando...' : 'Guardar preferencias'}
          </button>
        </div>
      )}
    </div>
  )
}
