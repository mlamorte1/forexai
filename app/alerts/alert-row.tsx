'use client'
import { useState } from 'react'

const signalColor = (s: string) =>
  s === 'BUY' ? '#00d4a0' : s === 'SELL' ? '#ff4d6a' : '#f0b429'

export default function AlertRow({ alert }: { alert: any }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        display: 'grid', gridTemplateColumns: '80px 110px 70px 80px 80px 80px 1fr 100px',
        padding: '12px 20px', borderBottom: '1px solid rgba(30,42,64,0.5)',
        alignItems: 'start', cursor: 'pointer',
        background: expanded ? 'rgba(0,212,160,0.03)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
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
        lineHeight: '1.6', paddingRight: '16px',
        whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
        overflow: expanded ? 'visible' : 'hidden',
        textOverflow: expanded ? 'unset' : 'ellipsis',
        gridColumn: expanded ? '1 / -1' : 'auto',
        marginTop: expanded ? '8px' : '0',
      }}>
        {alert.reasoning || '—'}
      </span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>
          {new Date(alert.created_at).toLocaleDateString('es-PA', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
        </div>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480' }}>
          {new Date(alert.created_at).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
        </div>
        {alert.email_sent && (
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', color: '#00d4a0', marginTop: '2px' }}>✓ email</div>
        )}
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', color: '#5a6480', marginTop: '4px' }}>
          {expanded ? '▲ cerrar' : '▼ ver más'}
        </div>
      </div>
    </div>
  )
}
