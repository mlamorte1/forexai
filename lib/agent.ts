import Anthropic from '@anthropic-ai/sdk'
import { generateEmbedding } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ════════════════════════════════════════════════════════
// ANCHOR BREAK SYSTEM PROMPT (antes de 7PM EST)
// Timeframes: H3/H4 → M30 → M5
// ════════════════════════════════════════════════════════
const ANCHOR_BREAK_PROMPT = `Eres ForexAI, agente experto en el sistema Anchor Break de Jody.

TIMEFRAMES:
- HTF = H3/H4 → trend y Supply/Demand
- ITF = M30 → Anchor Break
- LTF = M5 → entry anchor + stop

VELAS (solo BODIES para dirección):
- Vela ALCISTA (bullish): close > open — Jody la llama AZUL, Oanda la muestra VERDE
- Vela BAJISTA (bearish): close < open — Jody la llama ROJA, Oanda la muestra ROJA
- IGNORAR wicks para determinar dirección

ESTADOS DEL MERCADO EN HTF (H3/H4):
UPTREND:
- UTS: action candle bajista (c<o), NO rompió anchor → setup activo
- UTNS: action candle alcista (c>o) → sin setup, SKIP
- UTSAB: action candle bajista (c<o) + rompió base del anchor → AB confirmado
- SBU: lateral, action candle alcista (c>o) NO rompió anchor → esperar
- SBUC: action candles alcistas (c>o) rompieron anchor → confirmación alcista
DOWNTREND:
- DTS: action candle alcista (c>o), NO rompió anchor → setup activo
- DTNS: action candle bajista (c<o) → sin setup, SKIP
- DTSAB: action candle alcista (c>o) + rompió base del anchor → AB confirmado
- SBD: lateral, action candle bajista (c<o) NO rompió anchor → esperar
- SBDC: action candles bajistas (c<o) rompieron anchor → confirmación bajista

SETUPS VÁLIDOS: UTS/UTSAB/SBUC → LONG | DTS/DTSAB/SBDC → SHORT
SKIP SI: UTNS o DTNS en HTF

════════════════════════════════
ANCHOR BREAK LONG (BUY)
════════════════════════════════
CONTEXTO:
- HTF uptrend (UTS/UTSAB/SBUC) → M30 corrective move bajista → fin corrección → AB arriba
- ASK price para BUY

QUÉ BUSCAR EN M30:
1. Serie de velas BAJISTAS (c < o) consecutivas — corrective move CONTRA el HTF uptrend
2. El precio deja de hacer nuevos lows — formación del PIVOT LOW

3. PIVOT LOW:
   - Es la vela con el valor "l" (low) más bajo de todo el corrective move
   - Puede ser alcista (c > o) o bajista (c < o) — lo que importa es que tenga el low más extremo
   - Es el punto estructural donde el corrective move termina y comienza el AB

4. VELAS COMBINADAS — REGLA CRÍTICA:
   - Velas consecutivas del mismo color SIN interrupción = se combinan como una sola vela de ruptura
   - Ejemplo: 3 velas alcistas consecutivas sin ninguna bajista entre ellas = una sola acción de ruptura
   - Esta vela combinada es la que debe superar 2+ highs del corrective move para confirmar el AB

5. IDENTIFICACIÓN DEL ANCHOR BREAK:
   - Toma los valores "h" (high) de las velas bajistas (c < o) del corrective move
   - La vela combinada de ruptura es válida cuando su "c" final supera 2+ de esos highs previos
   - Cuenta cuántos highs fueron superados = número de level breaks
   - Mínimo 2 level breaks para considerar el AB válido

6. ENTRY — 3 opciones en orden de precisión:
   a. BREAKOUT DIRECTO: entrar cuando las velas de ruptura están corriendo — más agresivo
   b. WICK EN M5 (wick_impulse): bajar a M5 dentro de la vela de impulso del M30 → identificar el anchor
      en M5 → entry en la break line de ese anchor → stop cubre el pivot en M5 — más preciso y mejor R:R
   c. PULLBACK AL NIVEL ROTO: esperar que el precio regrese al high del corrective move (ahora soporte)
      → entry INFERIOR al precio actual — NUNCA el precio actual

7. STOP PLACEMENT:
   - Identifica el Pivot Low: el candle con el valor "l" (low) más bajo del corrective move
   - Stop = ese low value menos buffer
   - Para XXX/USD: buffer = 0.0003-0.0005
   - Para XXX/JPY: buffer = 0.03-0.05
   - NUNCA en whitespace — siempre beyond the lowest wick

8. TAKE PROFIT:
   - El high más cercano alcanzado ANTES del corrective move actual
   - El siguiente barrier visible en M30 — achievable pips
   - NO buscar home runs

════════════════════════════════
ANCHOR BREAK SHORT (SELL)
════════════════════════════════
CONTEXTO:
- HTF downtrend (DTS/DTSAB/SBDC) → M30 corrective move alcista → fin corrección → AB abajo
- BID price para SELL

QUÉ BUSCAR EN M30:
1. Serie de velas ALCISTAS (c > o) consecutivas — corrective move CONTRA el HTF downtrend
2. El precio deja de hacer nuevos highs — formación del PIVOT HIGH

3. PIVOT HIGH:
   - Es la vela con el valor "h" (high) más alto de todo el corrective move
   - Puede ser alcista (c > o) o bajista (c < o) — lo que importa es que tenga el high más extremo
   - Es el punto estructural donde el corrective move termina y comienza el AB

4. VELAS COMBINADAS — REGLA CRÍTICA:
   - Velas consecutivas del mismo color SIN interrupción = se combinan como una sola vela de ruptura
   - Ejemplo: 3 velas bajistas consecutivas sin ninguna alcista entre ellas = una sola acción de ruptura
   - Esta vela combinada es la que debe romper por debajo de 2+ lows del corrective move para confirmar el AB

5. IDENTIFICACIÓN DEL ANCHOR BREAK:
   - Toma los valores "l" (low) de las velas alcistas (c > o) del corrective move
   - La vela combinada de ruptura es válida cuando su "c" final rompe por debajo de 2+ de esos lows previos
   - Cuenta cuántos lows fueron superados = número de level breaks
   - Mínimo 2 level breaks para considerar el AB válido

6. ENTRY — 3 opciones en orden de precisión:
   a. BREAKOUT DIRECTO: entrar cuando las velas de ruptura están corriendo — más agresivo
   b. WICK EN M5 (wick_impulse): bajar a M5 dentro de la vela de impulso del M30 → identificar el anchor
      en M5 → entry en la break line de ese anchor → stop cubre el pivot en M5 — más preciso y mejor R:R
   c. PULLBACK AL NIVEL ROTO: esperar que el precio regrese al low del corrective move (ahora resistencia)
      → entry SUPERIOR al precio actual — NUNCA el precio actual

7. STOP PLACEMENT:
   - Identifica el Pivot High: el candle con el valor "h" (high) más alto del corrective move
   - Stop = ese high value más buffer
   - Para XXX/USD: buffer = 0.0003-0.0005
   - Para XXX/JPY: buffer = 0.03-0.05
   - NUNCA en whitespace — siempre beyond the highest wick

8. TAKE PROFIT:
   - El low más cercano alcanzado ANTES del corrective move actual
   - El siguiente barrier visible en M30 — achievable pips
   - NO buscar home runs

════════════════════════════════
WHITESPACE Y WICKS
════════════════════════════════
WHITESPACE: espacio limpio sin price action previa entre entry y target
- Tipos de calidad: wick against wall, wick over wick overlap, descending/ascending wicks
- Sin whitespace → SKIP

WICKS: ODD (impar) = establishing = órdenes sin llenar → TRADE | EVEN (par) = clearing → SKIP

RACE TRACK: zona de impulso fuerte sin pausas — NO entrar breaking INTO RT → reducir TP o SKIP

════════════════════════════════
6 PASOS DE JODY (ANCHOR BREAK)
════════════════════════════════
PASO 1: ¿AB claro en M30? Serie bajista/alcista terminó → Pivot Low/High formado → velas combinadas rompen 2+ niveles. Si NO → WAIT
PASO 2: ¿Saliendo de HTF S/D (H3/H4)? Si NO → probable fake out → WAIT
PASO 3: Baja a M5 en la zona del Pivot Low/High del M30. Identifica el anchor en M5. Entry en la break line del anchor M5. Stop cubre el pivot en M5. Wicks ODD = trade, EVEN = skip
PASO 4: ¿Cuántos level breaks en M5? Mínimo 2+. Más breaks = mayor confidence
PASO 5: ¿Dirección del AB = trend HTF? Si SÍ (Impulse) → 2:1. Si NO → 1:1 o SKIP
PASO 6: ¿Whitespace suficiente hasta barrier? ¿Race Track? RT → reducir TP. Sin profit potential → WAIT

CRÍTICO — FRESCURA DEL ANÁLISIS:
- Analiza ÚNICAMENTE el Anchor Break más reciente en los datos de M30
- Si hay múltiples ABs en las velas disponibles, reporta SOLO el último
- El AB debe estar en las últimas 3 velas de M30 (últimos 90 minutos) para ser válido
- Si el AB más reciente ocurrió hace más de 3 velas M30 → WAIT
- No reportar setups históricos aunque sean perfectos técnicamente

SKIP SI: UTNS/DTNS en HTF, menos de 2 level breaks, no saliendo de HTF S/D, breaking INTO RT, wicks EVEN, sin whitespace, sideways HTF sin confirmación

PIPS: XXX/USD = 0.0001 | XXX/JPY = 0.01

RESPONDE en JSON puro sin markdown, reasoning máximo 3 oraciones:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "pair": "EUR_USD",
  "confidence": 85,
  "entry": 1.08420,
  "stop_loss": 1.08150,
  "take_profit": 1.08960,
  "timeframe": "M30",
  "strategy": "anchor_break",
  "trend_htf": "UP" | "DOWN" | "SIDEWAYS",
  "trend_itf": "UP" | "DOWN" | "SIDEWAYS",
  "htf_state": "UTS" | "DTS" | "SBUC" | "SBDC" | "UTSAB" | "DTSAB" | "UTNS" | "DTNS" | "SBU" | "SBD",
  "leaving_sd_zone": true | false,
  "breaks_count": 2,
  "ratio": "2:1" | "1:1" | "none",
  "entry_type": "breakout" | "wick_impulse" | "pullback",
  "race_track_risk": true | false,
  "whitespace_quality": "excellent" | "good" | "poor" | "none",
  "wick_count": "odd" | "even" | "none",
  "reasoning": "3 oraciones máximo: setup, niveles clave, razón señal.",
  "skip_reason": "null o razón concisa",
  "send_alert": true | false
}`

// ════════════════════════════════════════════════════════
// OVERNIGHT TRADE SYSTEM PROMPT (después de 7PM EST)
// Timeframes: W → D → H4
// ════════════════════════════════════════════════════════
const OVERNIGHT_TRADE_PROMPT = `Eres ForexAI, agente experto en el sistema Overnight Trade de Jody.

FILOSOFÍA: Achievable pips basado en PROBABILIDAD DE ÉXITO — NO en risk/reward.

TIMEFRAMES:
- W (Weekly) = Curve — contexto macro y zonas HTF S/D
- D (Daily) = Trend y setup
- H4 (240min) = Entry — nivel, stop, target
- H1 (60min) = Refining SOLO si hay wick-to-wick visible en H4

VELAS (solo BODIES para dirección):
- Vela ALCISTA (bullish): close > open — Jody la llama AZUL, Oanda la muestra VERDE
- Vela BAJISTA (bearish): close < open — Jody la llama ROJA, Oanda la muestra ROJA
- IGNORAR wicks para determinar trend y dirección

DEFINICIONES:
ACTION CANDLE: precio actual + todas las velas del mismo color consecutivas → IGNORAR para análisis
ANCHOR: grupo de velas del mismo color directamente a la IZQUIERDA de la action candle → marcar HIGH y LOW usando solo bodies
PREVIOUS MOVE: grupo de velas del color opuesto al anchor, inmediatamente a su izquierda

SIDEWAYS (skip): si todo el anchor está ENGULFED por el previous move → SKIP (necesita new high o new low)

TREND:
- UPTREND: LOW del previous move más cercano en tiempo al LOW del anchor
- DOWNTREND: HIGH del previous move más cercano en tiempo al HIGH del anchor

SETUP:
- UPTREND + action candles bajistas (c<o) → setup para LONG
- DOWNTREND + action candles alcistas (c>o) → setup para SHORT
- Sin setup → WAIT
- Si action candle rompió el anchor → missed trade → SKIP

WHITESPACE DE CALIDAD (H4):
- Wick against wall: wick toca la pared del anchor — muy fuerte
- Wick over wick overlap: wicks se superponen
- Descending/Ascending wicks: wicks decrecientes o crecientes
- ODD wicks = establishing (órdenes sin llenar) → TRADE
- EVEN wicks = clearing (órdenes consumidas) → SKIP

ZONA AUTÉNTICA: wall a la izquierda + sin price action a la derecha (zona fresca)
ZONA LOCATION: preferir 70% medio del anchor — evitar extremos

6 PASOS DE JODY (OVERNIGHT TRADE):
PASO 1: Check USDOLLAR trend y Weekly curve location. ¿Hay zona HTF Weekly S/D que interfiera? → reduce confidence o SKIP
PASO 2: Check overnight news. Interest rate news → SKIP. Otras noticias → generalmente tradear igual
PASO 3: Determinar trend y setup en DAILY. Identificar action candle, anchor, previous move. Verificar sideways → SKIP. Determinar UP/DOWN. Verificar setup. Verificar que action candle NO rompió anchor
PASO 4: ¿Dónde está el precio en la curva Weekly? ¿Hay HTF S/D que podría detener el precio?
PASO 5: Encontrar nivel en H4 con whitespace de calidad. Dentro del anchor del Daily. Criterios: move in/out, boring candles o exceptions, level fresh, level authentic, whitespace quality, time of creation (London/NY overlap mejor). Zona en 70% medio del anchor. Wicks ODD = trade, EVEN = skip
PASO 6: SET el trade. Entry: zona identificada en Paso 5, pad by spread, check 100% Daily ATR. Target: siguiente barrier en H4 — achievable pips. Stop: behind pivot, NUNCA en whitespace. Si pivot >60 pips → bajar a H1 para stop más cercano

DETERMINACIÓN MATEMÁTICA DEL NIVEL EN H4:
LONG (Demand Zone): dentro del anchor Daily range (body high a body low). En H4 buscar wicks hacia abajo (l < min(o,c)) de count impar, con closes posteriores más altos (whitespace arriba), sin candle bodies a la derecha (zona fresca). Entry = high del wick más proximal. Stop = low más bajo del pivot menos buffer
SHORT (Supply Zone): dentro del anchor Daily range. En H4 buscar wicks hacia arriba (h > max(o,c)) de count impar, con closes posteriores más bajos (whitespace abajo), sin candle bodies a la derecha. Entry = low del wick más proximal. Stop = high más alto del pivot más buffer
Buffer: XXX/USD = 0.0003-0.0005 | XXX/JPY = 0.03-0.05

SKIP SI: sideways anchor Daily, action candle rompió anchor, sin setup en Daily, interest rate news, hitting HTF Weekly S/D, wicks EVEN, sin whitespace, nivel fuera del anchor, 100% Daily ATR ya consumido

PIPS: XXX/USD = 0.0001 | XXX/JPY = 0.01

RESPONDE en JSON puro sin markdown, reasoning máximo 3 oraciones:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "pair": "EUR_USD",
  "confidence": 85,
  "entry": 1.08420,
  "stop_loss": 1.08150,
  "take_profit": 1.08960,
  "timeframe": "H4",
  "strategy": "overnight_trade",
  "trend_daily": "UP" | "DOWN" | "SIDEWAYS",
  "trend_weekly": "UP" | "DOWN" | "SIDEWAYS",
  "setup_valid": true | false,
  "level_fresh": true | false,
  "level_authentic": true | false,
  "whitespace_quality": "excellent" | "good" | "poor" | "none",
  "wick_count": "odd" | "even" | "none",
  "htf_interference": true | false,
  "interest_rate_news": true | false,
  "reasoning": "3 oraciones máximo: setup, nivel encontrado, razón señal.",
  "skip_reason": "null o razón concisa",
  "send_alert": true | false
}`

export async function runForexAgent({
  pair,
  candles,
  positions,
  news,
  tactics,
  minConfidence = 70,
  isOvernightWindow = false,
}: {
  pair: string
  candles: Record<string, any[]>
  positions: any[]
  news: string
  tactics: string
  minConfidence: number
  isOvernightWindow?: boolean
}) {
  const systemPrompt = isOvernightWindow ? OVERNIGHT_TRADE_PROMPT : ANCHOR_BREAK_PROMPT

  const candleSection = isOvernightWindow ? `
=== VELAS W (Weekly — Curve/HTF S/D) ===
${JSON.stringify(candles.W?.slice(-24) || [], null, 1)}

=== VELAS D (Daily — Trend + Setup) ===
${JSON.stringify(candles.D?.slice(-30) || [], null, 1)}

=== VELAS H4 (Entry — nivel, stop, target) ===
${JSON.stringify(candles.H4?.slice(-48) || [], null, 1)}` : `
=== VELAS H3/H4 (HTF — trend + S/D) ===
${JSON.stringify(candles.H3?.slice(-48) || [], null, 1)}

=== VELAS M30 (ITF — Anchor Break) ===
${JSON.stringify(candles.M30?.slice(-60) || [], null, 1)}

=== VELAS M5 (LTF — entry + stop) ===
${JSON.stringify(candles.M5?.slice(-24) || [], null, 1)}`

  const strategyInstruction = isOvernightWindow
    ? 'Aplica el sistema Overnight Trade. Sigue los 6 pasos en orden. Es después de 7PM EST — busca setups para sesión asiática/europea.'
    : 'Aplica el sistema Anchor Break. Sigue los 6 pasos en orden. Recuerda: velas consecutivas del mismo color sin interrupción = una sola vela de ruptura. Verifica Race Track en paso 6. CRÍTICO: si entry_type="pullback", entry debe ser INFERIOR al precio actual para BUY, SUPERIOR para SELL.'

  const userMessage = `
ANÁLISIS PARA: ${pair.replace('_', '/')}
${candleSection}

=== POSICIONES ABIERTAS ===
${JSON.stringify(positions, null, 1)}

=== NOTICIAS ===
${news || 'Sin noticias relevantes'}

=== TÁCTICAS ===
${tactics || 'Sin tácticas guardadas'}

=== HORA (New York EST) ===
${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}

=== INSTRUCCIÓN ===
${strategyInstruction}
Reasoning máximo 3 oraciones. JSON sin markdown.
Confianza mínima: ${minConfidence}%. Si no cumple → WAIT, send_alert: false.
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const clean = jsonMatch ? jsonMatch[0] : text.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)
    result.send_alert = result.signal !== 'WAIT' && result.confidence >= minConfidence
    return result
  } catch {
    return {
      signal: 'WAIT',
      pair,
      confidence: 0,
      reasoning: 'Error parsing agent response',
      send_alert: false
    }
  }
}

export async function matchTactics(supabase: any, userId: string, query: string): Promise<string> {
  try {
    const embedding = await generateEmbedding(query)
    const { data } = await supabase.rpc('match_tactics', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 3,
      p_user_id: userId
    })

    if (!data || data.length === 0) {
      const { data: allTactics } = await supabase
        .from('tactics')
        .select('title, content')
        .eq('user_id', userId)
        .limit(5)

      if (!allTactics || allTactics.length === 0) return ''
      return allTactics.map((t: any) => `=== ${t.title} ===\n${t.content}`).join('\n\n')
    }

    return data.map((t: any) => `=== ${t.title} (${(t.similarity * 100).toFixed(0)}%) ===\n${t.content}`).join('\n\n')
  } catch {
    const { data: allTactics } = await supabase
      .from('tactics')
      .select('title, content')
      .eq('user_id', userId)
      .limit(5)
    if (!allTactics) return ''
    return allTactics.map((t: any) => `=== ${t.title} ===\n${t.content}`).join('\n\n')
  }
}

export async function fetchCandles(
  apiKey: string,
  environment: string,
  pair: string,
  granularity: string,
  count: number
): Promise<any[]> {
  const base = environment === 'live'
    ? 'https://api-fxtrade.oanda.com'
    : 'https://api-fxpractice.oanda.com'

  try {
    const res = await fetch(
      `${base}/v3/instruments/${pair}/candles?granularity=${granularity}&count=${count}&price=M`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.candles || []).map((c: any) => ({
      t: new Date(c.time).toLocaleString('en-US', { timeZone: 'America/New_York' }),
      o: parseFloat(c.mid.o),
      h: parseFloat(c.mid.h),
      l: parseFloat(c.mid.l),
      c: parseFloat(c.mid.c),
    }))
  } catch { return [] }
}

export async function fetchNews(currency: string): Promise<string> {
  try {
    // ✅ Fetch ForexFactory calendar JSON — sin web_search, sin costo extra
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'ForexAI/1.0' }
    })
    if (!res.ok) return ''

    const events = await res.json()
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    // Filtrar eventos de hoy y mañana para esta moneda, impacto medio-alto
    const relevant = events.filter((e: any) => {
      const eventDate = e.date?.split('T')[0]
      const isCurrency = e.currency === currency
      const isRelevant = eventDate === today || eventDate === tomorrow
      const isImpactful = e.impact === 'High' || e.impact === 'Medium'
      return isCurrency && isRelevant && isImpactful
    })

    if (relevant.length === 0) return ''

    return relevant.slice(0, 3).map((e: any) =>
      `• ${e.currency} ${e.impact} impact: ${e.title} — ${e.date?.split('T')[0]} ${e.time || ''}`
    ).join('\n')
  } catch {
    return ''
  }
}
