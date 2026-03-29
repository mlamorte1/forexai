import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ForexAI — Trading Intelligence',
  description: 'AI-powered Forex trading agent with real-time market analysis',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
