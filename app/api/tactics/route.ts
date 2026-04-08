import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/openai'

// GET — fetch all tactics for user
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('tactics')
      .select('id, title, content, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ tactics: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — create new tactic + generate embedding
export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, content } = await req.json()
    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content required' }, { status: 400 })
    }

    // Generate embedding
    const embeddingText = `${title}\n\n${content}`
    const embedding = await generateEmbedding(embeddingText)

    const { data, error } = await supabase
      .from('tactics')
      .insert({
        user_id: user.id,
        title,
        content,
        embedding,
      })
      .select('id, title, content, created_at')
      .single()

    if (error) throw error
    return NextResponse.json({ tactic: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — update tactic
export async function PATCH(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, title, content } = await req.json()
    if (!id || !title || !content) {
      return NextResponse.json({ error: 'id, title and content required' }, { status: 400 })
    }

    // Regenerate embedding
    const embeddingText = `${title}\n\n${content}`
    const embedding = await generateEmbedding(embeddingText)

    const { data, error } = await supabase
      .from('tactics')
      .update({ title, content, embedding, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, title, content, updated_at')
      .single()

    if (error) throw error
    return NextResponse.json({ tactic: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
