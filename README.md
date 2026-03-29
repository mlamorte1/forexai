# ForexAI — Trading Intelligence

AI-powered Forex trading agent with real-time market analysis, RAG-based tactics, and email alerts.

## Stack
- **Next.js 14** App Router
- **Supabase** — Auth, DB, pgvector (RAG)
- **Vercel** — Deploy + Cron Jobs
- **Anthropic API** — Claude agent
- **Resend** — Email alerts
- **Oanda REST API** — Live market data

## Setup

### 1. Supabase
1. Create a new Supabase project at supabase.com
2. Go to SQL Editor → run `supabase/schema.sql`
3. Copy your project URL and keys

### 2. Environment Variables
Copy `.env.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
```

### 3. Vercel Deploy
1. Push repo to GitHub (mlamorte1/forexai)
2. Import in vercel.com
3. Add all env vars in Vercel dashboard
4. Deploy — cron jobs activate automatically

### 4. Oanda Connection
1. Go to Settings → Oanda
2. Enter your API Key and Account ID
3. Click "Probar conexión" to verify
4. Save

## Sprints

| Sprint | Status | Description |
|--------|--------|-------------|
| 1 | ✅ Done | Auth + Dashboard + Oanda config |
| 2 | 🔜 Next | Oanda market data + charts |
| 2.5 | 🔜 | Mis Tácticas + RAG embeddings |
| 3 | 🔜 | AI Agent core + chat |
| 4 | 🔜 | Cron scanner + opportunity detection |
| 5 | 🔜 | Resend email alerts |
| 6 | 🔜 | Polish + production |
