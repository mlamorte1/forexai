'use client'
import { useState, useEffect, useRef } from 'react'

const PAIRS = ['EUR_USD', 'USD_JPY', 'GBP_USD', 'AUD_USD', 'USD_CAD', 'EUR_JPY', 'GBP_JPY', 'XAU_USD']

const QUICK_PROMPTS = [
  '¿Hay algún setup de Overnight Trade en EUR/USD ahora?',
  '¿Cómo determino la tendencia en el Daily?',
  'Explícame qué es un establishing wick',
  '¿Cuándo debo skipear un trade por whitespace?',
  'Analiza USD/JPY con mi sistema',
  '¿Qué es el anchor candle y cómo lo identifico?',
]

type Message = { role: 'user' | 'assistant'; content: string }

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pair, setPair] = useState('EUR_USD')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const mono = { fontFamily: 'Space Mono, monospace' }
  const sans = { fontFamily: 'Syne, sans-serif' }

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch('/api/agent/chat')
        const data = await res.json()
        if (data.messages?.length > 0) setMessages(data.messages)
      } catch {}
      finally { setLoadingHistory(false) }
    }
    loadHistory()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text?: string) {
    const content = text || input.trim()
    if (!content || loading) return

    const userMsg: Message = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, pair })
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  async function clearChat() {
    setMessages([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid #1e2a40', background: '#0f1420', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ ...mono, fontSize: '10px', color: '#5a6480', letterSpacing: '3px', marginBottom: '4px' }}>AGENTE AI</div>
          <h1 style={{ ...sans, fontSize: '20px', fontWeight: 800, color: '#e8eaf0', margin: 0 }}>Chat con ForexAI</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select value={pair} onChange={e => setPair(e.target.value)}
            style={{ background: '#070a10', border: '1px solid #1e2a40', borderRadius: '6px', padding: '6px 10px', color: '#e8eaf0', ...mono, fontSize: '11px' }}>
            {PAIRS.map(p => <option key={p} value={p}>{p.replace('_', '/')}</option>)}
          </select>
          {messages.length > 0 && (
            <button onClick={clearChat} style={{ background: 'transparent', border: '1px solid #1e2a40', color: '#5a6480', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', ...mono, fontSize: '10px' }}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        {loadingHistory ? (
          <div style={{ textAlign: 'center', ...mono, fontSize: '11px', color: '#5a6480', marginTop: '40px' }}>Cargando historial...</div>
        ) : messages.length === 0 ? (
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            {/* Welcome */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ ...mono, fontSize: '28px', color: '#00d4a0', marginBottom: '12px' }}>◎</div>
              <div style={{ ...sans, fontSize: '18px', fontWeight: 700, color: '#e8eaf0', marginBottom: '8px' }}>ForexAI está listo</div>
              <div style={{ ...mono, fontSize: '12px', color: '#5a6480', lineHeight: '1.6' }}>
                Pregúntame sobre el mercado, tus tácticas, o pídeme que analice un par específico usando tu sistema de trading.
              </div>
            </div>

            {/* Quick prompts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {QUICK_PROMPTS.map(prompt => (
                <button key={prompt} onClick={() => sendMessage(prompt)} style={{
                  background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '8px',
                  padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                  ...mono, fontSize: '11px', color: '#5a6480', lineHeight: '1.5',
                  transition: 'all .15s'
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#00d4a0'; (e.currentTarget as HTMLElement).style.color = '#e8eaf0' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1e2a40'; (e.currentTarget as HTMLElement).style.color = '#5a6480' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: '20px',
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                {msg.role === 'assistant' && (
                  <div style={{ ...mono, fontSize: '14px', color: '#00d4a0', marginRight: '10px', marginTop: '2px', flexShrink: 0 }}>◎</div>
                )}
                <div style={{
                  maxWidth: '80%',
                  padding: msg.role === 'user' ? '12px 16px' : '16px 18px',
                  borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
                  background: msg.role === 'user' ? 'rgba(0,212,160,0.1)' : '#0f1420',
                  border: msg.role === 'user' ? '1px solid rgba(0,212,160,0.2)' : '1px solid #1e2a40',
                  ...mono, fontSize: '13px',
                  color: msg.role === 'user' ? '#00d4a0' : '#e8eaf0',
                  lineHeight: '1.7',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{ ...mono, fontSize: '14px', color: '#00d4a0' }}>◎</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: '6px', height: '6px', borderRadius: '50%', background: '#00d4a0',
                      animation: 'bounce .8s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`
                    }} />
                  ))}
                </div>
                <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #1e2a40', background: '#0f1420', flexShrink: 0 }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregúntame sobre el mercado o tus tácticas... (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            style={{
              flex: 1, background: '#070a10', border: '1px solid #1e2a40',
              borderRadius: '8px', padding: '12px 14px', color: '#e8eaf0',
              ...mono, fontSize: '13px', resize: 'none', lineHeight: '1.5',
              transition: 'border-color .2s'
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              padding: '12px 20px', background: loading || !input.trim() ? '#1e2a40' : '#00d4a0',
              color: loading || !input.trim() ? '#5a6480' : '#000',
              border: 'none', borderRadius: '8px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              ...sans, fontSize: '13px', fontWeight: 700, transition: 'all .15s', flexShrink: 0
            }}
          >
            {loading ? '...' : '→'}
          </button>
        </div>
        <div style={{ maxWidth: '760px', margin: '8px auto 0', ...mono, fontSize: '10px', color: '#2a3a54' }}>
          Par activo: {pair.replace('_', '/')} · El agente usa tus tácticas guardadas como contexto
        </div>
      </div>
    </div>
  )
}
