import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/openai'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf'

    // Build message content based on file type
    let messageContent: any[]

    if (mimeType === 'application/pdf') {
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 }
        },
        {
          type: 'text',
          text: `Analiza este documento de trading y extrae toda la información relevante sobre la estrategia/táctica de trading que contiene. 
          
          Incluye:
          - Nombre y objetivo de la estrategia
          - Timeframes utilizados
          - Condiciones de entrada (setup)
          - Condiciones de NO entrada (filtros)
          - Gestión de stop loss
          - Gestión de take profit / target
          - Gestión de la posición
          - Conceptos clave (whitespace, anchor, wicks, etc.)
          - Reglas importantes
          
          Sé específico y detallado. Mantén toda la terminología original.`
        }
      ]
    } else {
      // Image
      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64 }
        },
        {
          type: 'text',
          text: `Analiza esta imagen de trading/gráfica y extrae toda la información relevante sobre la estrategia o concepto que muestra.

          Si es una gráfica de precio incluye:
          - Qué par y timeframe se muestra
          - Qué patrón o setup se está ilustrando
          - Dónde está la entrada, stop loss y target si se muestran
          - Qué concepto clave está demostrando (whitespace, anchor, wick patterns, etc.)
          - Cualquier anotación o texto visible en la imagen
          
          Si es un diagrama o esquema incluye:
          - El concepto que explica
          - Las reglas o condiciones que muestra
          - Los ejemplos visuales y qué representan
          
          Sé específico y detallado. Mantén toda la terminología original.`
        }
      ]
    }

    // Call Claude Vision
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: messageContent }]
    })

    const extractedContent = response.content[0].type === 'text' ? response.content[0].text : ''

    // Auto-generate title if not provided
    const tacticTitle = title || `Táctica desde ${file.name}`

    // Generate embedding
    const embedding = await generateEmbedding(`${tacticTitle}\n\n${extractedContent}`)

    // Save to Supabase
    const { data, error } = await supabase
      .from('tactics')
      .insert({
        user_id: user.id,
        title: tacticTitle,
        content: extractedContent,
        embedding,
      })
      .select('id, title, content, created_at')
      .single()

    if (error) throw error
    return NextResponse.json({ tactic: data, extracted: extractedContent })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
