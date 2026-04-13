import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { alertId, outcome } = await req.json()
    if (!alertId || !outcome) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    if (!['won', 'lost', 'skipped', 'expired'].includes(outcome)) {
      return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 })
    }

    const { error } = await supabase
      .from('alerts')
      .update({
        outcome,
        outcome_set_by: 'manual',
        outcome_checked_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .eq('user_id', user.id) // security: solo el dueño puede actualizar

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
