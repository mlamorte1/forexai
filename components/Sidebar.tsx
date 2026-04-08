'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '◈', sprint: 1 },
  { href: '/market', label: 'Mercado', icon: '◐', sprint: 1 },
  { href: '/tactics', label: 'Mis Tácticas', icon: '◉', sprint: 1 },
  { href: '/chat', label: 'Chat Agente', icon: '◎', sprint: 1 },
  { href: '/settings', label: 'Configuración', icon: '⚙', sprint: 1 },
  { href: '/alerts', label: 'Alertas', icon: '◆', sprint: 5 },
]

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside style={{
      width: '220px', minHeight: '100vh', background: '#0f1420',
      borderRight: '1px solid #1e2a40', display: 'flex',
      flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 20
    }}>
      <div style={{ padding: '24px 20px 20px' }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#00d4a0', letterSpacing: '3px' }}>▶ FOREXAI</div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '13px', fontWeight: 600, color: '#e8eaf0', marginTop: '4px' }}>Trading Intelligence</div>
      </div>

      <div style={{ height: '1px', background: '#1e2a40', margin: '0 16px' }} />

      <nav style={{ padding: '16px 12px', flex: 1 }}>
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const available = item.sprint === 1
          return (
            <div key={item.href} style={{ marginBottom: '4px' }}>
              {available ? (
                <Link href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px',
                  background: active ? 'rgba(0,212,160,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(0,212,160,0.2)' : '1px solid transparent',
                  color: active ? '#00d4a0' : '#e8eaf0',
                  textDecoration: 'none', fontFamily: 'Syne, sans-serif',
                  fontSize: '13px', fontWeight: active ? 600 : 400,
                  transition: 'all .15s'
                }}>
                  <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px' }}>{item.icon}</span>
                  {item.label}
                </Link>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px', opacity: 0.3, cursor: 'not-allowed',
                  fontFamily: 'Syne, sans-serif', fontSize: '13px', color: '#5a6480'
                }}>
                  <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px' }}>{item.icon}</span>
                  {item.label}
                  <span style={{ marginLeft: 'auto', fontFamily: 'Space Mono, monospace', fontSize: '9px' }}>S{item.sprint}</span>
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div style={{ padding: '16px', borderTop: '1px solid #1e2a40' }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#5a6480', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email}
        </div>
        <button onClick={handleLogout} style={{
          width: '100%', background: 'transparent', border: '1px solid #1e2a40',
          borderRadius: '6px', padding: '7px 12px', color: '#5a6480',
          fontFamily: 'Space Mono, monospace', fontSize: '10px',
          cursor: 'pointer', transition: 'all .2s', textAlign: 'left'
        }}
          onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#ff4d6a'; (e.target as HTMLElement).style.color = '#ff4d6a' }}
          onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#1e2a40'; (e.target as HTMLElement).style.color = '#5a6480' }}
        >
          ↩ Cerrar sesión
        </button>
      </div>
    </aside>
  )
}


