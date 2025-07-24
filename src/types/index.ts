export interface Portfolio {
  success: boolean;
  agentId: string;
  totalValue: number;
  tokens: Token[];
  snapshotTime: string;
  source: string;
}

export interface Token {
  token: string;
  amount: number;
  price: number;
  value: number;
  chain: string;
  symbol: string;
}

export interface TokenPrice {
  success: boolean;
  price: number;
  chain: string;
  specificChain: string;
}

export interface TradeRequest {
  fromToken: string;
  toToken: string;
  amount: string;
  reason: string;
  fromChain?: string;
  toChain?: string;
}

export interface TradeResult {
  success: boolean;
  transaction?: {
    id: string;
    timestamp: string;
    fromToken: string;
    toToken: string;
    fromAmount: number;
    toAmount: number;
    price: number;
    success: boolean;
    teamId: string;
    competitionId: string;
    fromChain: string;
    toChain: string;
    fromSpecificChain: string;
    toSpecificChain: string;
  };
  error?: {
    message: string;
    code?: string;
  };
}

export interface TradingDecision {
  action: 'buy' | 'sell' | 'hold';
  fromToken: string;
  toToken: string;
  amount: number;
  // @ts-ignore
  reason: string;
  confidence: number;
  isGuaranteedMemeTrade?: boolean;
}

export interface AgentState {
  id: number;
  totalTrades: number;
  totalPnL: number;
  dailyPnL: number;
  lastTradeTime: string;
  riskLevel: 'low' | 'medium' | 'high';
  isActive: boolean;
  strategyParams: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface MarketData {
  portfolio: Portfolio;
  prices: Record<string, number>;
  externalMarketData?: {
    coinGecko?: {
      lastUpdated: string;
      available: boolean;
    };
  };
  timestamp: string;
}

// Common token addresses for easy reference
export const TOKENS = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
} as const;

export const CHAINS = {
  EVM: 'evm',
  ETHEREUM: 'eth',
  ARBITRUM: 'arbitrum',
  OPTIMISM: 'optimism',
  BASE: 'base',
  SOLANA: 'svm',
  SVM: 'svm'
} as const;