import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function TacticsLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0d14' }}>
      <Sidebar email={user.email ?? ''} />
      <main style={{ marginLeft: '220px', flex: 1, minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  )
}
