export type OandaEnvironment = 'practice' | 'live'

export interface OandaConfig {
  id: string
  user_id: string
  api_key: string
  account_id: string
  environment: OandaEnvironment
  created_at: string
  updated_at: string
}

export interface WatchedPair {
  id: string
  user_id: string
  pair: string
  active: boolean
  created_at: string
}

export interface Alert {
  id: string
  user_id: string
  pair: string
  signal: 'BUY' | 'SELL' | 'WAIT'
  confidence: number
  entry: number
  stop_loss: number
  take_profit: number
  timeframe: string
  reasoning: string
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  created_at: string
}
