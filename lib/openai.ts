export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // max tokens safety
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embedding error: ${err}`)
  }

  const data = await res.json()
  return data.data[0].embedding
}
