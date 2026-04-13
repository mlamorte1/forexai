'use client'
import { useState } from 'react'

const signalColor = (s: string) =>
  s === 'BUY' ? '#00d4a0' : s === 'SELL' ? '#ff4d6a' : '#f0b429'

const outcomeConfig: Record<string, { color: string; label: string }> = {
  won:     { color: '#00d4a0', label: '✓ Ganó' },
  lost:    { color: '#ff4d6a', label: '✗ Perdió' },
  skipped: { color: '#f0b429', label: '⊘ No Entré' },
  expired: { color: '#5a6480', label: '— Expiró' },
}

export default function AlertRow({ alert }: { alert: any }) {
  const [expanded, setExpanded] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(alert.outcome || null)
  const [loading, setLoading] = useState(false)

  const handleSkip = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (outcome) return
    setLoading(true)
    try {
      const res = await fetch('/api/alerts/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: alert.id, outcome: 'skipped' })
      })
      if (res.ok) setOutcome('skipped')
    } finally {
      setLoading(false)
    }
  }

  const currentOutcome = outcome ? outcomeConfig[outcome] : null

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        display: 'grid',
        gridTemplateColumns: expanded ? '1fr' : '80px 100px 60px 75px 75px 75px 1fr 130px',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(30,42,64,0.5)',
        alignItems: 'start',
        cursor: 'pointer',
        background: expanded ? 'rgba(0,212,160,0.03)' : 'transparent',
        transition: 'background 0.15s',
        gap: expanded ? '0' : undefined,
      }}
    >
      {expanded ? (
        // Expanded view
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              background: signalColor(alert.signal) + '18',
              color: signalColor(alert.signal),
              fontFamily: 'Space Mono, monospace', fontSize: '10px', fontWeight: 700,
              padding: '3px 10px', borderRadius: '4px'
            }}>
              {alert.signal}
            </div>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '13px', color: '#e8eaf0', fontWeight: 700 }}>
              {alert.pair?.replace('_', '/')}
            </span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: alert.confidence >= 70 ? '#00d4a0' : '#5a6480' }}>
              {alert.confidence}% conf
            </span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>
              ENTRY: {alert.entry ? parseFloat(alert.entry).toFixed(4) : '—'}
            </span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#ff4d6a' }}>
              SL: {alert.stop_loss ? parseFloat(alert.stop_loss).toFixed(4) : '—'}
            </span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0' }}>
              TP: {alert.take_profit ? parseFloat(alert.take_profit).toFixed(4) : '—'}
            </span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', marginLeft: 'auto' }}>
              {new Date(alert.created_at).toLocaleDateString('es-PA', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })} {new Date(alert.created_at).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
            </span>
          </div>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#8a94a8', lineHeight: '1.7' }}>
            {alert.reasoning || '—'}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {currentOutcome ? (
              <span style={{
                fontFamily: 'Space Mono, monospace', fontSize: '10px', fontWeight: 700,
                color: currentOutcome.color,
                padding: '4px 12px', borderRadius: '4px',
                background: currentOutcome.color + '18',
                border: `1px solid ${currentOutcome.color}40`,
              }}>
                {currentOutcome.label}
              </span>
            ) : (
              <button
                onClick={handleSkip}
                disabled={loading}
                style={{
                  fontFamily: 'Space Mono, monospace', fontSize: '10px',
                  color: '#f0b429', background: 'rgba(240,180,41,0.08)',
                  border: '1px solid rgba(240,180,41,0.3)',
                  borderRadius: '4px', padding: '4px 12px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? '...' : '⊘ No Entré'}
              </button>
            )}
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', color: '#5a6480' }}>
              ▲ cerrar
            </span>
          </div>
        </div>
      ) : (
        // Collapsed view
        <>
          <div style={{
            background: signalColor(alert.signal) + '18',
            color: signalColor(alert.signal),
            fontFamily: 'Space Mono, monospace', fontSize: '10px', fontWeight: 700,
            padding: '3px 8px', borderRadius: '4px', textAlign: 'center', width: 'fit-content'
          }}>
            {alert.signal}
          </div>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: '#e8eaf0' }}>
            {alert.pair?.replace('_', '/')}
          </span>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: alert.confidence >= 70 ? '#00d4a0' : '#5a6480' }}>
            {alert.confidence}%
          </span>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480' }}>
            {alert.entry ? parseFloat(alert.entry).toFixed(4) : '—'}
          </span>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#ff4d6a' }}>
            {alert.stop_loss ? parseFloat(alert.stop_loss).toFixed(4) : '—'}
          </span>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#00d4a0' }}>
            {alert.take_profit ? parseFloat(alert.take_profit).toFixed(4) : '—'}
          </span>
          <span style={{
            fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480',
            lineHeight: '1.5', paddingRight: '12px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {alert.reasoning || '—'}
          </span>
          <div style={{ textAlign: 'right' }}>
            {currentOutcome ? (
              <div style={{
                fontFamily: 'Space Mono, monospace', fontSize: '9px', fontWeight: 700,
                color: currentOutcome.color, marginBottom: '4px'
              }}>
                {currentOutcome.label}
              </div>
            ) : (
              <button
                onClick={handleSkip}
                disabled={loading}
                style={{
                  fontFamily: 'Space Mono, monospace', fontSize: '9px',
                  color: '#f0b429', background: 'transparent',
                  border: '1px solid rgba(240,180,41,0.3)',
                  borderRadius: '4px', padding: '2px 8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px', display: 'block', marginLeft: 'auto',
                }}
              >
                {loading ? '...' : '⊘ No Entré'}
              </button>
            )}
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>
              {new Date(alert.created_at).toLocaleDateString('es-PA', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>
              {new Date(alert.created_at).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', color: '#5a6480', marginTop: '2px' }}>
              ▼ ver más
            </div>
          </div>
        </>
      )}
    </div>
  )
}

