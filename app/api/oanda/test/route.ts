import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { apiKey, accountId, environment } = await req.json()

    if (!apiKey || !accountId) {
      return NextResponse.json({ ok: false, error: 'Faltan credenciales' })
    }

    const base = environment === 'live'
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com'

    const res = await fetch(`${base}/v3/accounts/${accountId}/summary`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) {
      if (res.status === 401) return NextResponse.json({ ok: false, error: 'API Key inválida o expirada' })
      if (res.status === 404) return NextResponse.json({ ok: false, error: 'Account ID no encontrado' })
      return NextResponse.json({ ok: false, error: `Error ${res.status}` })
    }

    const data = await res.json()
    const account = data.account

    return NextResponse.json({
      ok: true,
      currency: account.currency,
      balance: parseFloat(account.balance).toFixed(2),
      nav: parseFloat(account.NAV).toFixed(2),
      openTrades: account.openTradeCount ?? 0
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Error inesperado' })
  }
}
