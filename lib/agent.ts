import Anthropic from '@anthropic-ai/sdk'
import { generateEmbedding } from './openai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ════════════════════════════════════════════════════════
// CHART CONTEXT BUILDER
// Convierte datos OHLC en texto estructurado que el agente
// puede leer como si estuviera viendo el chart
// ════════════════════════════════════════════════════════

interface Candle {
  t: string
  o: number
  h: number
  l: number
  c: number
}

interface CandleGroup {
  color: 'GREEN' | 'RED'
  candles: Array<{ index: number; candle: Candle }>
  high: number
  low: number
  pivotHigh: number
  pivotLow: number
}

interface AnchorBreakResult {
  found: boolean
  direction: 'BUY' | 'SELL' | null
  anchorGroup: CandleGroup | null
  breakGroup: CandleGroup | null
  levelBreaks: number
  entryPrice: number | null
  stopPrice: number | null
  anchorStartIndex: number
  anchorEndIndex: number
  breakEndIndex: number
}

function candleColor(c: Candle): 'GREEN' | 'RED' {
  return c.c > c.o ? 'GREEN' : 'RED'
}

function colorEmoji(color: 'GREEN' | 'RED'): string {
  return color === 'GREEN' ? '🟢' : '🔴'
}

function toPips(value: number, pair: string): number {
  const pipSize = pair.includes('JPY') ? 0.01 : 0.0001
  return Math.round(Math.abs(value) / pipSize)
}

// Agrupa velas consecutivas del mismo color
function groupByColor(candles: Candle[]): CandleGroup[] {
  const groups: CandleGroup[] = []
  let i = 0
  while (i < candles.length) {
    const color = candleColor(candles[i])
    const group: CandleGroup = {
      color,
      candles: [],
      high: -Infinity,
      low: Infinity,
      pivotHigh: -Infinity,
      pivotLow: Infinity,
    }
    while (i < candles.length && candleColor(candles[i]) === color) {
      const c = candles[i]
      group.candles.push({ index: i, candle: c })
      group.high = Math.max(group.high, Math.max(c.o, c.c))
      group.low = Math.min(group.low, Math.min(c.o, c.c))
      group.pivotHigh = Math.max(group.pivotHigh, c.h)
      group.pivotLow = Math.min(group.pivotLow, c.l)
      i++
    }
    groups.push(group)
  }
  return groups
}

// Detecta Anchor Break — alcista Y bajista
function detectAnchorBreak(candles: Candle[], pair: string): AnchorBreakResult {
  const empty: AnchorBreakResult = {
    found: false, direction: null, anchorGroup: null, breakGroup: null,
    levelBreaks: 0, entryPrice: null, stopPrice: null,
    anchorStartIndex: -1, anchorEndIndex: -1, breakEndIndex: -1
  }

  if (candles.length < 4) return empty

  const groups = groupByColor(candles)
  if (groups.length < 2) return empty

  // Buscar el AB más reciente de derecha a izquierda
  for (let g = groups.length - 1; g >= 1; g--) {
    const breakGroup = groups[g]
    const anchorGroup = groups[g - 1]

    // AB ALCISTA: anchor=RED, break=GREEN
    if (anchorGroup.color === 'RED' && breakGroup.color === 'GREEN') {
      const breakClose = breakGroup.candles[breakGroup.candles.length - 1].candle.c
      const anchorHighs = anchorGroup.candles.map(({ candle: c }) => Math.max(c.o, c.c))
      // ⚠️ REGLA CRÍTICA: el close DEBE superar el body high MÁS ALTO del anchor
      // Solo el close cuenta — wicks NO cuentan para confirmar ruptura
      const anchorBodyHigh = Math.max(...anchorHighs)
      if (breakClose <= anchorBodyHigh) continue
      const levelBreaks = anchorHighs.filter(h => breakClose > h).length

      if (levelBreaks >= 2) {
        const buffer = pair.includes('JPY') ? 0.04 : 0.0004
        return {
          found: true,
          direction: 'BUY',
          anchorGroup,
          breakGroup,
          levelBreaks,
          entryPrice: breakClose,
          stopPrice: anchorGroup.pivotLow - buffer,
          anchorStartIndex: anchorGroup.candles[0].index,
          anchorEndIndex: anchorGroup.candles[anchorGroup.candles.length - 1].index,
          breakEndIndex: breakGroup.candles[breakGroup.candles.length - 1].index,
        }
      }
    }

    // AB BAJISTA: anchor=GREEN, break=RED
    if (anchorGroup.color === 'GREEN' && breakGroup.color === 'RED') {
      const breakClose = breakGroup.candles[breakGroup.candles.length - 1].candle.c
      const anchorLows = anchorGroup.candles.map(({ candle: c }) => Math.min(c.o, c.c))
      // ⚠️ REGLA CRÍTICA: el close DEBE cerrar por debajo del body low MÁS BAJO del anchor
      // Solo el close cuenta — wicks NO cuentan para confirmar ruptura
      const anchorBodyLow = Math.min(...anchorLows)
      if (breakClose >= anchorBodyLow) continue
      const levelBreaks = anchorLows.filter(l => breakClose < l).length

      if (levelBreaks >= 2) {
        const buffer = pair.includes('JPY') ? 0.04 : 0.0004
        return {
          found: true,
          direction: 'SELL',
          anchorGroup,
          breakGroup,
          levelBreaks,
          entryPrice: breakClose,
          stopPrice: anchorGroup.pivotHigh + buffer,
          anchorStartIndex: anchorGroup.candles[0].index,
          anchorEndIndex: anchorGroup.candles[anchorGroup.candles.length - 1].index,
          breakEndIndex: breakGroup.candles[breakGroup.candles.length - 1].index,
        }
      }
    }
  }

  return empty
}

// Detecta trend state usando los 7 pasos de Jody
function detectTrendState(candles: Candle[]): string {
  const groups = groupByColor(candles)
  if (groups.length < 3) return 'UNKNOWN'

  const action = groups[groups.length - 1]
  const anchor = groups[groups.length - 2]
  const prevMove = groups[groups.length - 3]

  // Paso 3: Sideways?
  const isSideways = prevMove.pivotHigh > anchor.pivotHigh && prevMove.pivotLow < anchor.pivotLow

  if (isSideways) {
    const lastActionCandle = action.candles[action.candles.length - 1].candle
    const brokeAnchorHigh = lastActionCandle.c > anchor.high
    const brokeAnchorLow = lastActionCandle.c < anchor.low
    if (brokeAnchorHigh) return 'SBUC'
    if (brokeAnchorLow) return 'SBDC'
    if (action.color === 'RED') return 'SBD'
    return 'SBU'
  }

  // Paso 4: Closest Open — determina UT o DT
  const isUptrend = anchor.color === 'RED'

  if (isUptrend) {
    const lastActionCandle = action.candles[action.candles.length - 1].candle
    const hasSetup = action.color === 'RED'
    const brokeAnchor = lastActionCandle.c > anchor.high
    if (brokeAnchor) return 'UTAB'
    if (hasSetup) return 'UTS'
    return 'UTNS'
  } else {
    const lastActionCandle = action.candles[action.candles.length - 1].candle
    const hasSetup = action.color === 'GREEN'
    const brokeAnchor = lastActionCandle.c < anchor.low
    if (brokeAnchor) return 'DTAB'
    if (hasSetup) return 'DTS'
    return 'DTNS'
  }
}

// Calcula ATR de las últimas N velas
function calcATR(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 0
  const slice = candles.slice(-period - 1)
  let trSum = 0
  let count = 0
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i]
    const prev = slice[i - 1]
    const tr = Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c))
    trSum += tr
    count++
  }
  return count > 0 ? trSum / count : 0
}

// Formatea una vela como línea de texto legible
function formatCandle(num: number, c: Candle, pair: string, label: string = ''): string {
  const color = candleColor(c)
  const emoji = colorEmoji(color)
  const bodyPips = toPips(Math.abs(c.c - c.o), pair)
  const sign = color === 'GREEN' ? '+' : '-'
  const wickDown = toPips(Math.min(c.o, c.c) - c.l, pair)
  const wickUp = toPips(c.h - Math.max(c.o, c.c), pair)
  const time = c.t.length > 10 ? c.t.substring(11, 16) : c.t
  const decimals = pair.includes('JPY') ? 3 : 5
  const labelStr = label ? ` ← ${label}` : ''
  return `#${String(num).padStart(2, '0')} [${time}] ${emoji} ${sign}${bodyPips}p | ${c.o.toFixed(decimals)}→${c.c.toFixed(decimals)} | ↓${wickDown}p ↑${wickUp}p${labelStr}`
}

// Función principal — traduce OHLC a texto estructurado
function buildChartContext(
  candles: Record<string, any[]>,
  isOvernightWindow: boolean,
  pair: string
): string {
  const lines: string[] = []

  if (!isOvernightWindow) {
    // ════════════════════════════════
    // ANCHOR BREAK — H3 / M30 / M5
    // ════════════════════════════════

    // H3: Trend State
    const H3: Candle[] = candles.H3 || []
    if (H3.length > 0) {
      lines.push('════════════════════════════════')
      lines.push('H3 — TREND STATE (HTF)')
      lines.push('════════════════════════════════')
      const trendState = detectTrendState(H3)
      const groups = groupByColor(H3)
      const last3 = groups.slice(-3)
      const labels = ['PREV MOVE', 'ANCHOR', 'ACTION']
      last3.forEach((g, i) => {
        const lbl = labels[i] || ''
        lines.push(`${lbl}: ${g.candles.length} velas ${colorEmoji(g.color)} | body_high:${g.high.toFixed(3)} body_low:${g.low.toFixed(3)} | wick_high:${g.pivotHigh.toFixed(3)} wick_low:${g.pivotLow.toFixed(3)}`)
      })
      lines.push(`>>> TREND STATE H3: ${trendState}`)
      lines.push('')
    }

    // M30: Anchor Break Detection
    const M30: Candle[] = candles.M30 || []
    if (M30.length > 0) {
      lines.push('════════════════════════════════')
      lines.push('M30 — ANCHOR BREAK DETECTION')
      lines.push('════════════════════════════════')

      const ab = detectAnchorBreak(M30, pair)
      const startIdx = Math.max(0, M30.length - 40)

      M30.slice(startIdx).forEach((c, i) => {
        const globalIdx = startIdx + i
        const num = i + 1
        let label = ''
        if (ab.found) {
          if (globalIdx === ab.anchorStartIndex) label = 'ANCHOR START'
          else if (globalIdx > ab.anchorStartIndex && globalIdx < ab.anchorEndIndex) label = 'ANCHOR'
          else if (globalIdx === ab.anchorEndIndex) {
            const pivot = ab.direction === 'BUY'
              ? ab.anchorGroup!.pivotLow.toFixed(3)
              : ab.anchorGroup!.pivotHigh.toFixed(3)
            label = `ANCHOR END | PIVOT: ${pivot}`
          }
          else if (globalIdx > ab.anchorEndIndex && globalIdx < ab.breakEndIndex) label = 'BREAK'
          else if (globalIdx === ab.breakEndIndex) label = `✅ AB ${ab.direction} CONFIRMED — ${ab.levelBreaks} level breaks`
        }
        lines.push(formatCandle(num, c, pair, label))
      })

      lines.push('')
      if (ab.found) {
        const velsDesdeAB = M30.length - 1 - ab.breakEndIndex
        const isFresh = velsDesdeAB <= 3
        lines.push(`════ AB ${ab.direction} DETECTADO ════`)
        lines.push(`Level breaks: ${ab.levelBreaks}`)
        lines.push(`Entry referencia M30: ${ab.entryPrice?.toFixed(pair.includes('JPY') ? 3 : 5)}`)
        lines.push(`Stop referencia M30: ${ab.stopPrice?.toFixed(pair.includes('JPY') ? 3 : 5)}`)
        lines.push(`Velas M30 desde AB hasta ahora: ${velsDesdeAB}`)
        lines.push(`FRESHNESS: ${isFresh ? '✅ VÁLIDO (≤3 velas)' : '❌ STALE — reportar WAIT'}`)
      } else {
        lines.push('════ SIN AB VÁLIDO EN M30 ════')
        lines.push('No se detectó anchor break con 2+ level breaks sin interrupción → WAIT')
      }
      lines.push('')
    }

    // M5: Entry y Stop precisos
    const M5: Candle[] = candles.M5 || []
    if (M5.length > 0) {
      lines.push('════════════════════════════════')
      lines.push('M5 — ENTRY ZONE (LTF)')
      lines.push('════════════════════════════════')

      const abM5 = detectAnchorBreak(M5, pair)

      M5.forEach((c, i) => {
        let label = ''
        if (abM5.found) {
          if (i === abM5.anchorStartIndex) label = 'ANCHOR M5 START'
          else if (i > abM5.anchorStartIndex && i < abM5.anchorEndIndex) label = 'ANCHOR M5'
          else if (i === abM5.anchorEndIndex) label = `ANCHOR M5 END | STOP: ${abM5.stopPrice?.toFixed(pair.includes('JPY') ? 3 : 5)}`
          else if (i > abM5.anchorEndIndex && i < abM5.breakEndIndex) label = 'BREAK M5'
          else if (i === abM5.breakEndIndex) label = `✅ ENTRY M5: ${abM5.entryPrice?.toFixed(pair.includes('JPY') ? 3 : 5)}`
        }
        lines.push(formatCandle(i + 1, c, pair, label))
      })

      lines.push('')
      if (abM5.found) {
        lines.push(`════ ENTRY M5 ${abM5.direction} ════`)
        lines.push(`Entry: ${abM5.entryPrice?.toFixed(pair.includes('JPY') ? 3 : 5)}`)
        lines.push(`Stop: ${abM5.stopPrice?.toFixed(pair.includes('JPY') ? 3 : 5)}`)
        lines.push(`Level breaks M5: ${abM5.levelBreaks}`)
      } else {
        lines.push('════ SIN AB EN M5 ════')
        lines.push('No hay AB claro en M5 — usar entry tipo pullback o CC en M1')
      }
      lines.push('')
    }

  } else {
    // ════════════════════════════════
    // OVERNIGHT TRADE — W / D / H4
    // ════════════════════════════════

    // Weekly: Curve y HTF
    const W: Candle[] = candles.W || []
    if (W.length > 0) {
      lines.push('════════════════════════════════')
      lines.push('WEEKLY — CURVE / HTF CONTEXT')
      lines.push('════════════════════════════════')
      const trendW = detectTrendState(W)
      const groupsW = groupByColor(W)
      const lastW = groupsW[groupsW.length - 1]
      lines.push(`>>> TREND STATE WEEKLY: ${trendW}`)
      lines.push(`Último grupo: ${lastW.candles.length} velas ${colorEmoji(lastW.color)} | high:${lastW.pivotHigh.toFixed(3)} low:${lastW.pivotLow.toFixed(3)}`)
      W.slice(-8).forEach((c, i) => lines.push(formatCandle(W.length - 8 + i + 1, c, pair)))
      lines.push('')
    }

    // Daily: Trend + Setup
    const D: Candle[] = candles.D || []
    if (D.length > 0) {
      lines.push('════════════════════════════════')
      lines.push('DAILY — TREND + SETUP')
      lines.push('════════════════════════════════')
      const trendD = detectTrendState(D)
      const groupsD = groupByColor(D)
      const last3D = groupsD.slice(-3)
      const labels = ['PREV MOVE', 'ANCHOR', 'ACTION']
      last3D.forEach((g, i) => {
        const lbl = labels[i] || ''
        lines.push(`${lbl}: ${g.candles.length} velas ${colorEmoji(g.color)} | body_high:${g.high.toFixed(3)} body_low:${g.low.toFixed(3)}`)
      })
      lines.push(`>>> TREND STATE DAILY: ${trendD}`)
      lines.push('')
      D.slice(-20).forEach((c, i) => lines.push(formatCandle(D.length - 20 + i + 1, c, pair)))
      lines.push('')
    }

    // H4: Entry Zone + ATR Box
    const H4: Candle[] = candles.H4 || []
    if (H4.length > 0) {
      lines.push('════════════════════════════════')
      lines.push('H4 — ENTRY ZONE + ATR BOX')
      lines.push('════════════════════════════════')
      const atr = calcATR(H4, 14)
      const atr120 = atr * 1.2
      lines.push(`ATR H4 (14 velas): ${atr.toFixed(pair.includes('JPY') ? 3 : 5)}`)
      lines.push(`ATR 120%: ${atr120.toFixed(pair.includes('JPY') ? 3 : 5)}`)
      lines.push('')

      const abH4 = detectAnchorBreak(H4, pair)
      const startH4 = Math.max(0, H4.length - 24)
      H4.slice(startH4).forEach((c, i) => {
        const globalIdx = startH4 + i
        let label = ''
        if (abH4.found) {
          if (globalIdx === abH4.anchorStartIndex) label = 'ZONA START'
          else if (globalIdx === abH4.anchorEndIndex) label = `ZONA END | PIVOT: ${abH4.direction === 'BUY' ? abH4.anchorGroup!.pivotLow.toFixed(3) : abH4.anchorGroup!.pivotHigh.toFixed(3)}`
          else if (globalIdx === abH4.breakEndIndex) label = `BIG MOVE OUT ${abH4.direction}`
        }
        lines.push(formatCandle(i + 1, c, pair, label))
      })

      lines.push('')
      if (abH4.found) {
        const entryRef = abH4.entryPrice || 0
        const boxTop = abH4.direction === 'BUY' ? entryRef : entryRef + atr120
        const boxBottom = abH4.direction === 'BUY' ? entryRef - atr120 : entryRef
        const dec = pair.includes('JPY') ? 3 : 5
        lines.push(`════ ZONA H4 ${abH4.direction} ════`)
        lines.push(`Box top: ${boxTop.toFixed(dec)} | Box bottom: ${boxBottom.toFixed(dec)}`)
        lines.push(`Entry (${abH4.direction === 'BUY' ? 'top' : 'bottom'} del box): ${(abH4.direction === 'BUY' ? boxTop : boxBottom).toFixed(dec)}`)
        lines.push(`Stop (${abH4.direction === 'BUY' ? 'bottom' : 'top'} del box): ${(abH4.direction === 'BUY' ? boxBottom : boxTop).toFixed(dec)}`)
      } else {
        lines.push('════ SIN ZONA CLARA EN H4 ════')
        lines.push('Revisar manualmente zona S/D con odds enhancers dentro del anchor Daily')
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

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

════════════════════════════════════════════════════════
PRE-ANÁLISIS — 3 KEYS (verificar ANTES de cualquier setup)
════════════════════════════════════════════════════════
Antes de evaluar cualquier par, verificar las 3 Keys de Jody:

KEY 1 — HEATMAP:
- ¿Las noticias del par tienen alto impacto hoy? → reducir confidence o SKIP
- Interest rate news → SKIP siempre

KEY 2 — DOLLAR (USDOLLAR/DXY):
- Si el par contiene USD: ¿el dólar va EN FAVOR o EN CONTRA del trade?
  * Trade BUY en EUR/USD = necesitas dólar débil (DXY bajando)
  * Trade SELL en EUR/USD = necesitas dólar fuerte (DXY subiendo)
  * Trade BUY en USD/CAD = necesitas dólar fuerte (DXY subiendo)
- Si el dólar va en contra del trade → reducir confidence, agregar nota en reasoning
- Para pares sin USD (EUR/JPY, AUD/JPY etc.) → ignorar este check

KEY 3 — RACETRACK (Impulse):
- ¿El precio está en zona de impulso fuerte sin pausas (Race Track)?
- Entrar INTO un Race Track → SKIP o reducir TP significativamente
- Race Track confirma la dirección pero NO es zona de entry válida

════════════════════════════════════════════════════════
CÓMO LEER EL CHART CONTEXT QUE RECIBES
════════════════════════════════════════════════════════
Los datos de velas vienen pre-procesados en este formato:
#01 [08:30] 🟢 +7p | 187.210→187.280 | ↓3p ↑5p ← ANCHOR START

Donde:
- #01 = número de vela (cronológico, #01 es la más antigua)
- [08:30] = hora de apertura
- 🟢/🔴 = color (verde=alcista c>o, roja=bajista c<o)
- +7p/-7p = movimiento del body en pips
- 187.210→187.280 = open→close
- ↓3p ↑5p = wick inferior y wick superior en pips
- ← LABEL = identificación estructural (ANCHOR, BREAK, PIVOT, etc.)

El pre-procesador ya identificó matemáticamente:
- ANCHOR START / ANCHOR END: las velas del anchor
- PIVOT: el wick más extremo del anchor (referencia del stop)
- BREAK: las velas de ruptura
- AB CONFIRMED: la vela donde se confirma el AB con N level breaks
- FRESHNESS: si el AB es válido (≤3 velas M30 desde el break)

Tu trabajo es CONFIRMAR y VALIDAR lo que el pre-procesador detectó,
aplicando los 7 pasos de Jody y las 3 Keys antes de dar una señal.

════════════════════════════════════════════════════════
DETERMINACIÓN DE TREND STATES — 7 PASOS DE JODY
(usar BODIES únicamente, ignorar wicks)
════════════════════════════════════════════════════════

PASO 1 — ID ACTION CANDLE:
- La vela donde está el precio actual + todas las velas del mismo color consecutivas
- IGNORAR para el análisis de trend — solo sirve para Setup (Paso 5)

PASO 2 — ID ANCHOR:
- El grupo de velas del mismo color directamente a la IZQUIERDA de la action candle (2do color)
- Marcar HIGH y LOW del anchor usando solo candle bodies
- Dibujar anchor lines en top y bottom del anchor

PASO 3 — SIDEWAYS?:
- ¿El previous move (3er color, a la izquierda del anchor) ENGULFA todo el anchor?
- Si SÍ → SIDEWAYS → continuar para determinar bias UP o DOWN
- Si NO → el anchor rompió fuera del previous move → sabrás si es UT o DT

PASO 4 — CLOSEST OPEN (determina UP vs DOWN):
- Buscar la vela cuyo OPEN está más cercano y FUERA de las anchor lines (a la izquierda)
- Si ese candle es ROJO (c < o) → DOWNTREND → saltar a paso 5
- Si ese candle es AZUL (c > o) → UPTREND → saltar a paso 5

PASO 5 — SETUP?:
- Si UPTREND: ¿la action candle es ROJA (c < o)? SÍ = Setup "S" activo | NO = Sin setup (UTNS)
- Si DOWNTREND: ¿la action candle es AZUL (c > o)? SÍ = Setup "S" activo | NO = Sin setup (DTNS)

PASO 6 — ANCHOR BREAK / CONFIRMATION?:
- ¿El precio de la action candle está FUERA de las anchor lines?
- Si SÍ → el trend state avanza:
  * UTS → UTAB | DTS → DTAB | SBU → SBUC | SBD → SBDC
- Si NO → ya tienes tu trend state: UTS, UT, SBU, DTS, DT, o SBD

PASO 7 — HTF CONFLUENCE:
⚠️ CRÍTICO — leer con cuidado, los estados son específicos:

UTS Confluence (HTF going UP → IMPULSE para LONG):
  HTF debe mostrar: UTAB, UT, UTS, SBU, o SBUC
  → Todos estos indican que el HTF está en tendencia o configuración ALCISTA
  → Si ITF también es UTS/UTAB = IMPULSE → buscar 2:1

DTS Confluence (HTF going DOWN → IMPULSE para SHORT):
  HTF debe mostrar: DTAB, DT, DTS, SBD, o SBDC
  → Todos estos indican que el HTF está en tendencia o configuración BAJISTA
  → Si ITF también es DTS/DTAB = IMPULSE → buscar 2:1

Sin confluencia (HTF va en dirección opuesta al ITF):
  → CORRECTIVE trade → máximo 1:1 o SKIP
  → Evaluar si cambiar HTF a ITF y re-evaluar con un TF superior

⚠️ Estar listo para reversals — asegurar que entry y stop no sean trading reversals

ESTADOS RESULTANTES:
UPTREND: UTS (setup activo) | UTNS (sin setup → SKIP) | UTAB (AB confirmado) | SBU (esperar 2+ velas) | SBUC (esperar 1 vela)
DOWNTREND: DTS (setup activo) | DTNS (sin setup → SKIP) | DTAB (AB confirmado) | SBD (esperar 2+ velas) | SBDC (esperar 1 vela)

SETUPS VÁLIDOS PARA ENTRY: UTS/UTAB/SBUC → LONG | DTS/DTAB/SBDC → SHORT
SKIP SI: UTNS o DTNS (sin setup activo)

════════════════════════════════
ANCHOR BREAK LONG (BUY)
════════════════════════════════
CONTEXTO:
- HTF uptrend (UTAB/UT/UTS/SBU/SBUC) → M30 corrective move bajista → fin corrección → AB arriba
- ASK price para BUY

FLUJO:
1. Verificar label "AB BUY CONFIRMED" en M30 con FRESHNESS ✅
2. Verificar trend state H3 — debe ser alcista
3. Bajar a M5 — usar label "ENTRY M5" y "STOP" del pre-procesador
4. Confirmar level breaks ≥ 2 en M5
5. Verificar whitespace hasta TP
6. TP = high más cercano ANTES del corrective move en M30

PIVOT LOW — DEFINICIÓN EXACTA:
⚠️ El pivot es el wick "l" más bajo de las velas del ANCHOR específicamente
— NO el low del corrective move completo

VELAS COMBINADAS — REGLA CRÍTICA:
⚠️ UNA SOLA vela del color opuesto = combinación ROTA = NO es AB = WAIT
El pre-procesador ya verifica esto — si no hay label "AB CONFIRMED" → WAIT

ENTRY (M5): breakout | pullback al nivel roto | CC en M1 (BRB)
STOP: beyond pivot del ANCHOR en M5 + buffer (USD: 0.0003-0.0005 | JPY: 0.03-0.05)
TP: high más cercano ANTES del corrective move en M30

════════════════════════════════
ANCHOR BREAK SHORT (SELL)
════════════════════════════════
CONTEXTO:
- HTF downtrend (DTAB/DT/DTS/SBD/SBDC) → M30 corrective move alcista → fin corrección → AB abajo
- BID price para SELL

FLUJO:
1. Verificar label "AB SELL CONFIRMED" en M30 con FRESHNESS ✅
2. Verificar trend state H3 — debe ser bajista
3. Bajar a M5 — usar label "ENTRY M5" y "STOP" del pre-procesador
4. Confirmar level breaks ≥ 2 en M5
5. Verificar whitespace hasta TP
6. TP = low más cercano ANTES del corrective move en M30

PIVOT HIGH — DEFINICIÓN EXACTA:
⚠️ El pivot es el wick "h" más alto de las velas del ANCHOR específicamente
— NO el high del corrective move completo

ENTRY (M5): breakout | pullback al nivel roto | CC en M1 (RBR)
STOP: beyond pivot del ANCHOR en M5 + buffer (USD: 0.0003-0.0005 | JPY: 0.03-0.05)
TP: low más cercano ANTES del corrective move en M30

════════════════════════════════
WHITESPACE Y WICKS
════════════════════════════════
WHITESPACE: espacio limpio sin price action previa entre entry y target
- Sin whitespace → SKIP

WICKS: ODD (impar) = establishing = órdenes sin llenar → TRADE | EVEN (par) = clearing → SKIP

RACE TRACK: zona de impulso fuerte sin pausas — NO entrar breaking INTO RT → reducir TP o SKIP

════════════════════════════════
6 PASOS DE JODY (ANCHOR BREAK)
════════════════════════════════
PASO 1: ¿Label "AB CONFIRMED" presente en M30 con FRESHNESS ✅? Si NO → WAIT
PASO 2: ¿Saliendo de HTF S/D (H3/H4)? Si NO → probable fake out → WAIT
PASO 3: Usar entry y stop del label M5. Wicks ODD = trade, EVEN = skip
PASO 4: ¿Level breaks M5 ≥ 2? Más breaks = mayor confidence
PASO 5: ¿Dirección AB = trend HTF? SÍ (Impulse) → 2:1 | NO → 1:1 o SKIP
PASO 6: ¿Whitespace suficiente? ¿Race Track? RT → reducir TP. Sin profit → WAIT

CRÍTICO — FRESCURA:
- El pre-procesador ya calculó "Velas M30 desde AB"
- Si dice FRESHNESS ❌ STALE → reportar WAIT obligatorio sin excepciones

SKIP SI: UTNS/DTNS en HTF, menos de 2 level breaks, no saliendo de HTF S/D,
breaking INTO RT, wicks EVEN, sin whitespace, sideways HTF, interest rate news,
FRESHNESS ❌ en M30

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
  "htf_state": "UTS" | "DTS" | "SBUC" | "SBDC" | "UTAB" | "DTAB" | "UTNS" | "DTNS" | "SBU" | "SBD",
  "leaving_sd_zone": true | false,
  "breaks_count": 2,
  "ratio": "2:1" | "1:1" | "none",
  "entry_type": "breakout" | "pullback" | "cc_smaller_tf",
  "race_track_risk": true | false,
  "whitespace_quality": "excellent" | "good" | "poor" | "none",
  "wick_count": "odd" | "even" | "none",
  "dollar_alignment": "favor" | "against" | "neutral" | "n/a",
  "reasoning": "3 oraciones máximo: setup, niveles clave, razón señal.",
  "skip_reason": "null o razón concisa",
  "send_alert": true | false
}`

// ════════════════════════════════════════════════════════
// OVERNIGHT TRADE SYSTEM PROMPT (7PM-8PM EST análisis)
// Timeframes: W → D → H4 → H1/M5
// ════════════════════════════════════════════════════════
const OVERNIGHT_TRADE_PROMPT = `Eres ForexAI, agente experto en el sistema Overnight Trade de Jody (Meat and Potatoes).

FILOSOFÍA: Achievable pips basado en PROBABILIDAD DE ÉXITO — NO en risk/reward.

TIMEFRAMES (múltiplo de 6):
- W (Weekly) = HTF — Curve, contexto macro, zonas S/D, Race Track
- D (Daily) = ITF — Trend, Anchor Line, UFOs, Shape S/D, Target S/D
- H4 (240min) = STF — Entry zone, UFOs, Box 120% ATR, Imbalance, Target S/D
- H1 (60min) = RTF — Color Change (trigger de entry), refining si zona existe en H4

VELAS (solo BODIES para dirección):
- Vela ALCISTA (bullish): close > open — Jody la llama AZUL, Oanda la muestra VERDE
- Vela BAJISTA (bearish): close < open — Jody la llama ROJA, Oanda la muestra ROJA
- IGNORAR wicks para determinar trend y dirección

════════════════════════════════════════════════════════
CÓMO LEER EL CHART CONTEXT QUE RECIBES
════════════════════════════════════════════════════════
Los datos vienen pre-procesados:
- TREND STATE WEEKLY / DAILY: estado ya calculado
- PREV MOVE / ANCHOR / ACTION: grupos de color identificados
- ATR H4 y ATR 120%: ya calculados matemáticamente
- ZONA START / ZONA END / BIG MOVE OUT: zona S/D en H4 identificada
- Box top / Box bottom: calculados con ATR 120%

Tu trabajo es VALIDAR con los odds enhancers (big move, basing candle,
freshness, authenticity, whitespace, profit potential) y confirmar la señal.

════════════════════════════════
PRIMERA PARTE — TREND Y SETUP (en Daily)
════════════════════════════════
PASO 1: ID ACTION CANDLE — precio actual + todas las velas del mismo color consecutivas → IGNORAR para trend
PASO 2: ID ANCHOR (2do color) — grupo de velas del mismo color a la izquierda → marcar HIGH y LOW con bodies
PASO 3: SIDEWAYS? — ¿previous move (3er color) engulfa el anchor completamente? Si SÍ = SIDEWAYS → SKIP
PASO 4: CLOSEST OPEN — vela con OPEN más cercano FUERA de anchor lines:
  - ROJO (c < o) → DOWNTREND | AZUL (c > o) → UPTREND
PASO 5: SETUP — UT + action ROJA = setup LONG | DT + action AZUL = setup SHORT
PASO 6: ¿Action rompió anchor lines? SÍ → UTAB/DTAB/SBUC/SBDC
PASO 7: HTF CONFLUENCE:
  - UTS Confluence: HTF en UTAB/UT/UTS/SBU/SBUC → IMPULSE LONG
  - DTS Confluence: HTF en DTAB/DT/DTS/SBD/SBDC → IMPULSE SHORT

ESTADOS ÓPTIMOS: DTS (SHORT) | UTS (LONG)
Progresión: SBD/SBU → SBDC/SBUC → DTS/UTS → DTAB/UTAB (missed)

════════════════════════════════
SEGUNDA PARTE — ENCONTRAR EL NIVEL (en H4)
════════════════════════════════
Odds enhancers — verificar cada uno (LOOK LEFT):
1. BIG MOVE IN/OUT: ¿vela grande entrando/saliendo de la zona? (ya marcado como "BIG MOVE OUT")
2. 50% BASING CANDLE: body ≤ 50% del tamaño TOTAL de la vela (body+wicks)
3. FRESHNESS 70%+: zona sin price action a la derecha
4. AUTHENTICITY: RBR/DBD = siempre auténtico | DBR/RBD = buscar wall
5. WHITESPACE ODD: contar wicks contra wall → ODD = TRADE | EVEN = SKIP
6. PROFIT POTENTIAL: espacio hasta siguiente barrier

════════════════════════════════
TERCERA PARTE — 120% ATR BOX Y ENTRY
════════════════════════════════
El ATR y box ya están calculados en el chart context.

Para LONG (Demand Zone):
- Entry = TOP del box | Stop = BOTTOM del box

Para SHORT (Supply Zone):
- Entry = BOTTOM del box | Stop = TOP del box

CONFIRMATION ENTRY H1:
- LONG: BRB (Blue-Red-Blue) dentro/fuera del box
- SHORT: RBR (Red-Blue-Red) dentro/fuera del box
- CC outside box = mayor probabilidad ← PREFERIDO

ONCE GREEN NEVER RED

════════════════════════════════
6 PASOS OVERNIGHT
════════════════════════════════
PASO 1: Check Weekly trend state y curve. ¿Race Track o HTF S/D? → SKIP o reduce confidence
PASO 2: Check noticias. Interest rate news → SKIP
PASO 3: Validar trend state Daily y setup (ya pre-calculado)
PASO 4: ¿Precio en Weekly curve? ¿HTF S/D podría detener antes del target?
PASO 5: Validar zona H4 con 6 odds enhancers. Confirmar box top/bottom del pre-procesador
PASO 6: Reportar entry, stop, TP con los valores del box calculado

SKIP SI: sideways, action candle rompió anchor, sin setup, interest rate news,
HTF S/D en contra, wicks EVEN, sin whitespace, basing candle body >50%, precio 2+ ATR lejos

PIPS: XXX/USD = 0.0001 | XXX/JPY = 0.01

RESPONDE en JSON puro sin markdown, reasoning máximo 3 oraciones:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "pair": "EUR_USD",
  "confidence": 75,
  "entry": 1.08500,
  "stop_loss": 1.08200,
  "take_profit": 1.09200,
  "timeframe": "H4",
  "strategy": "overnight_trade",
  "trend_daily": "UP" | "DOWN" | "SIDEWAYS",
  "trend_weekly": "UP" | "DOWN" | "SIDEWAYS",
  "impulse_or_corrective": "impulse" | "corrective",
  "market_state": "SBU" | "SBUC" | "UTS" | "UTAB" | "UT" | "SBD" | "SBDC" | "DTS" | "DTAB" | "DT" | "SIDEWAYS",
  "proximity_to_trade": "optimal" | "1_candle_away" | "2+_candles_away" | "missed_trade",
  "setup_valid": true | false,
  "anchor_range_high": 1.08800,
  "anchor_range_low": 1.08200,
  "atr_h4": 0.0045,
  "atr_120": 0.0054,
  "box_top": 1.08750,
  "box_bottom": 1.08210,
  "confirmation_entry": "set_entry_target" | "market_order" | "brb_long" | "rbr_short",
  "htf_interference": true | false,
  "interest_rate_news": true | false,
  "basing_candle_quality": "strong" | "weak" | "none",
  "whitespace_quality": "excellent" | "good" | "poor" | "none",
  "authenticity": "rbr" | "dbr_wall" | "dbr_no_wall" | "rbd_wall" | "rbd_no_wall" | "dbd",
  "reasoning": "3 oraciones: trend+setup Daily, zona H4 con odds enhancers, entry y stop calculados.",
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

  // ✅ Usar buildChartContext en lugar de JSON crudo
  const candleSection = buildChartContext(candles, isOvernightWindow, pair)

  const strategyInstruction = isOvernightWindow
    ? 'Aplica el sistema Overnight Trade. Valida el trend state y zona H4 ya pre-calculados. Confirma con odds enhancers y reporta entry/stop del box.'
    : 'Aplica el sistema Anchor Break. Verifica el label AB CONFIRMED y FRESHNESS en M30. Usa los niveles de entry y stop del M5 pre-calculados. Confirma con los 7 pasos de Jody.'

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
      t: c.time,
      o: parseFloat(c.mid.o),
      h: parseFloat(c.mid.h),
      l: parseFloat(c.mid.l),
      c: parseFloat(c.mid.c),
    }))
  } catch { return [] }
}

export async function fetchNews(currency: string): Promise<string> {
  try {
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'ForexAI/1.0' }
    })
    if (!res.ok) return ''

    const events = await res.json()
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

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

