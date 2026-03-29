'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `https://forexai-steel.vercel.app/auth/callback` }
        })
        if (error) throw error
        setSuccess('Revisa tu email para confirmar tu cuenta.')
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, #0d1f3a 0%, #0a0d14 60%)',
      padding: '20px'
    }}>
      <div style={{
        width: '100%', maxWidth: '420px',
        background: '#0f1420', border: '1px solid #1e2a40',
        borderRadius: '12px', padding: '40px',
        boxShadow: '0 0 60px rgba(0,212,160,0.06)'
      }}>
        {/* Logo */}
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#00d4a0', letterSpacing: '4px', marginBottom: '8px' }}>
          ▶ FOREXAI
        </div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '26px', fontWeight: 800, color: '#e8eaf0', marginBottom: '6px' }}>
          Trading Intelligence
        </div>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480', marginBottom: '32px' }}>
          {mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{
                width: '100%', background: '#070a10', border: '1px solid #1e2a40',
                borderRadius: '6px', padding: '11px 14px', color: '#e8eaf0',
                fontFamily: 'Space Mono, monospace', fontSize: '13px',
                transition: 'border-color .2s'
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Contraseña
            </label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%', background: '#070a10', border: '1px solid #1e2a40',
                borderRadius: '6px', padding: '11px 14px', color: '#e8eaf0',
                fontFamily: 'Space Mono, monospace', fontSize: '13px',
                transition: 'border-color .2s'
              }}
            />
          </div>

          {/* Error / Success */}
          {error && <div style={{ color: '#ff4d6a', fontFamily: 'Space Mono, monospace', fontSize: '11px', marginBottom: '12px' }}>{error}</div>}
          {success && <div style={{ color: '#00d4a0', fontFamily: 'Space Mono, monospace', fontSize: '11px', marginBottom: '12px' }}>{success}</div>}

          {/* Submit */}
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', background: '#00d4a0', color: '#000',
              border: 'none', borderRadius: '6px', padding: '13px',
              fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              letterSpacing: '1px', transition: 'opacity .2s'
            }}
          >
            {loading ? 'Cargando...' : mode === 'login' ? 'ENTRAR' : 'CREAR CUENTA'}
          </button>
        </form>

        {/* Toggle */}
        <div style={{ marginTop: '20px', textAlign: 'center', fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#5a6480' }}>
          {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}
            style={{ color: '#00d4a0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Mono, monospace', fontSize: '11px' }}
          >
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </div>
      </div>
    </div>
  )
}
