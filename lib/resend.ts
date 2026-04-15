import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendAlertEmail({
  to,
  analysis,
}: {
  to: string
  analysis: any
}) {
  const signalColor = analysis.signal === 'BUY' ? '#00d4a0' : '#ff4d6a'
  const pairFormatted = analysis.pair?.replace('_', '/') || '—'
  const now = new Date().toLocaleString('es-PA', {
    timeZone: 'America/New_York',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  const strategyLabel = analysis.strategy === 'overnight_trade' ? 'OVERNIGHT TRADE' : 'ANCHOR BREAK'
  const strategyColor = analysis.strategy === 'overnight_trade' ? '#7c6af7' : '#00d4a0'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0d14;font-family:'Courier New',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0d14;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0f1420;border:1px solid #1e2a40;border-radius:12px;overflow:hidden;">
        
        <!-- Header -->
        <tr><td style="padding:28px 32px;border-bottom:1px solid #1e2a40;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0;font-size:11px;color:#00d4a0;letter-spacing:4px;">▶ FOREXAI</p>
                <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#e8eaf0;">Alerta de Trading</p>
                <p style="margin:4px 0 0;font-size:11px;color:#5a6480;">${now}</p>
              </td>
              <td align="right" valign="top">
                <span style="display:inline-block;padding:6px 14px;background:${strategyColor}18;border:1px solid ${strategyColor};border-radius:6px;font-size:10px;font-weight:700;color:${strategyColor};letter-spacing:2px;">${strategyLabel}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Signal badge -->
        <tr><td style="padding:28px 32px;border-bottom:1px solid #1e2a40;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;letter-spacing:2px;">SEÑAL</p>
                <p style="margin:0;font-size:32px;font-weight:700;color:${signalColor};">${analysis.signal}</p>
              </td>
              <td align="center">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;letter-spacing:2px;">PAR</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#e8eaf0;">${pairFormatted}</p>
              </td>
              <td align="right">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;letter-spacing:2px;">CONFIANZA</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#f0b429;">${analysis.confidence}%</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Trade details -->
        <tr><td style="padding:28px 32px;border-bottom:1px solid #1e2a40;">
          <p style="margin:0 0 16px;font-size:10px;color:#00d4a0;letter-spacing:3px;">DETALLES DEL TRADE</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33%" style="padding-bottom:16px;">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">ENTRADA</p>
                <p style="margin:0;font-size:16px;font-weight:700;color:#e8eaf0;">${analysis.entry?.toFixed(5) || '—'}</p>
              </td>
              <td width="33%" style="padding-bottom:16px;">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">STOP LOSS</p>
                <p style="margin:0;font-size:16px;font-weight:700;color:#ff4d6a;">${analysis.stop_loss?.toFixed(5) || '—'}</p>
              </td>
              <td width="33%" style="padding-bottom:16px;">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">TAKE PROFIT</p>
                <p style="margin:0;font-size:16px;font-weight:700;color:#00d4a0;">${analysis.take_profit?.toFixed(5) || '—'}</p>
              </td>
            </tr>
            <tr>
              <td>
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">TIMEFRAME</p>
                <p style="margin:0;font-size:14px;color:#e8eaf0;">${analysis.timeframe || '—'}</p>
              </td>
              <td>
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">TENDENCIA</p>
                <p style="margin:0;font-size:14px;color:#e8eaf0;">${analysis.trend_htf || analysis.trend_daily || '—'}</p>
              </td>
              <td>
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">WHITESPACE</p>
                <p style="margin:0;font-size:14px;color:#e8eaf0;">${analysis.whitespace_quality || '—'}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- ATR Box (solo Overnight Trade) -->
        ${analysis.strategy === 'overnight_trade' && analysis.box_top ? `
        <tr><td style="padding:0 32px 28px;border-bottom:1px solid #1e2a40;">
          <p style="margin:0 0 12px;font-size:10px;color:#7c6af7;letter-spacing:3px;">120% ATR BOX</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33%">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">ATR H4</p>
                <p style="margin:0;font-size:14px;color:#e8eaf0;">${analysis.atr_h4?.toFixed(5) || '—'}</p>
              </td>
              <td width="33%">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">BOX TOP</p>
                <p style="margin:0;font-size:14px;color:#e8eaf0;">${analysis.box_top?.toFixed(5) || '—'}</p>
              </td>
              <td width="33%">
                <p style="margin:0 0 4px;font-size:10px;color:#5a6480;">BOX BOTTOM</p>
                <p style="margin:0;font-size:14px;color:#e8eaf0;">${analysis.box_bottom?.toFixed(5) || '—'}</p>
              </td>
            </tr>
          </table>
        </td></tr>` : ''}

        <!-- Reasoning -->
        <tr><td style="padding:28px 32px;border-bottom:1px solid #1e2a40;">
          <p style="margin:0 0 12px;font-size:10px;color:#00d4a0;letter-spacing:3px;">ANÁLISIS DEL AGENTE</p>
          <p style="margin:0;font-size:13px;color:#5a6480;line-height:1.7;">${analysis.reasoning || '—'}</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;">
          <p style="margin:0;font-size:10px;color:#2a3a54;text-align:center;">
            ForexAI · Esta alerta fue generada automáticamente · No es asesoría financiera · Siempre usa tu propio criterio y gestión de riesgo
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'ForexAI <alerts@forexai.app>',
    to,
    subject: `🎯 ${analysis.signal} ${pairFormatted} — ${strategyLabel} — ${analysis.confidence}% | ForexAI`,
    html,
  })
}
