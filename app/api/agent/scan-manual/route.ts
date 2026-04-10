import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/agent/scan`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  })

  return NextResponse.json({ ok: res.ok })
}
