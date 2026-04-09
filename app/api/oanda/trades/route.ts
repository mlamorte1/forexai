import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: cfg } = await supabase
      .from('oanda_configs')
      .select('api_key, account_id, environment')
      .eq('user_id', user.id)
      .single()

    if (!cfg) return NextResponse.json({ error: 'No Oanda config found' }, { status: 404 })

    const base = cfg.environment === 'live'
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com'

    const res = await fetch(
      `${base}/v3/accounts/${cfg.account_id}/trades?state=CLOSED&count=20`,
      { headers: { Authorization: `Bearer ${cfg.api_key}` } }
    )

    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
