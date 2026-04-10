'use client'
import { useState } from 'react'

export default function RunScanButton() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')

  const run = async () => {
    setStatus('running')
    try {
      const res = await fetch('/api/agent/scan-manual', { method: 'POST' })
      if (res.ok) setStatus('done')
      else setStatus('error')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 4000)
  }

  const label = {
    idle: '▶ Run scan now',
    running: '⟳ Escaneando...',
    done: '✓ Completado',
    error: '✗ Error',
  }[status]

  const color = {
    idle: '#00d4a0',
    running: '#f0b429',
    done: '#00d4a0',
    error: '#ff4d6a',
  }[status]

  return (
    <button
      onClick={run}
      disabled={status === 'running'}
      style={{
        marginLeft: 'auto',
        fontFamily: 'Space Mono, monospace',
        fontSize: '10px',
        color,
        background: color + '18',
        border: `1px solid ${color}40`,
        borderRadius: '6px',
        padding: '6px 14px',
        cursor: status === 'running' ? 'not-allowed' : 'pointer',
        letterSpacing: '1px',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  )
}
