import logger from '../utils/logger.js';
import { TOKENS } from '../types/index.js';

export interface StrategyParams {
  maxPositionSize: number;
  minTradeAmount: number;
  riskLevel: 'low' | 'medium' | 'high';
  rebalanceThreshold: number;
  targetAllocations: Record<string, number>;
  meanReversionLookbackPeriod: number;
  meanReversionDeviationThreshold: number;
  trendFollowingShortSmaPeriod: number;
  trendFollowingLongSmaPeriod: number;
  // Breakout Strategy Parameters
  breakoutLookbackPeriod: number;
  breakoutVolatilityThreshold: number;
  breakoutConfirmationFactor: number;
  // Time-Based Strategy Parameters
  peakLiquidityHours: { start: number; end: number; }[];
  peakTradeIntervalMultiplier: number;
  offPeakTradeIntervalMultiplier: number;
  peakPositionSizeMultiplier: number;
  offPeakPositionSizeMultiplier: number;
  // Loss Strategy Parameters (RED BUTTON!)
  lossStrategyEnabled: boolean;
  lossStrategyTargetAllocation: number;
  lossStrategyMinMarketCapUSD: number;
  lossStrategySelectionMethod: 'most_negative_change' | 'highest_volatility';
  // LLM Strategy Parameters
  llmEnabled: boolean;
  llmModel: string;
  llmTemperature: number;
  llmObjective: 'maximize_profit' | 'maximize_loss';
  // Guaranteed Meme Token Strategy Parameters
  guaranteedMemeTradeEnabled: boolean;
  guaranteedMemeTradeAmountUSD: number;
  guaranteedMemeTokenSelectionMethod: 'random_top_solana_meme' | 'most_negative_solana_change' | 'specific_solana_token';
  guaranteedMemeSpecificTokenAddress: string;
}

export class StrategyParamsManager {
  private params: StrategyParams;

  constructor(initialParams?: Partial<StrategyParams>) {
    this.params = {
      ...this.getDefaultParams(),
      ...initialParams
    };
    logger.info('Strategy parameters manager initialized', { params: this.params });
  }

  private getDefaultParams(): StrategyParams {
    return {
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_PERCENT || '20') / 100,
      minTradeAmount: parseFloat(process.env.MIN_TRADE_AMOUNT_USDC || '10'),
      riskLevel: (process.env.RISK_LEVEL as 'low' | 'medium' | 'high') || 'medium',
      rebalanceThreshold: 0.01, // 1% deviation triggers rebalancing (SUPER RISKY)
      targetAllocations: {
        [TOKENS.USDC]: 0.4,  // 40% USDC (stable base)
        [TOKENS.WETH]: 0.35, // 35% WETH (main crypto exposure)
        [TOKENS.WBTC]: 0.25  // 25% WBTC (diversification)
      },
      meanReversionLookbackPeriod: 20,
      meanReversionDeviationThreshold: 0.01, // 1% deviation (SUPER RISKY)
      trendFollowingShortSmaPeriod: 10,
      trendFollowingLongSmaPeriod: 50,
      // Breakout Strategy Defaults
      breakoutLookbackPeriod: 50,
      breakoutVolatilityThreshold: 0.02, // 2% volatility threshold (easier to trigger)
      breakoutConfirmationFactor: 0.002, // 0.2% price movement (SUPER SENSITIVE)
      // Time-Based Strategy Defaults
      peakLiquidityHours: [
        { start: 13, end: 21 }, // 1 PM to 9 PM UTC (US/EU overlap)
        { start: 0, end: 2 }    // 12 AM to 2 AM UTC (Asia open)
      ],
      peakTradeIntervalMultiplier: 0.4,    // MUCH more frequent trades during peak hours
      offPeakTradeIntervalMultiplier: 1.0, // More frequent trades during off-peak
      peakPositionSizeMultiplier: 1.2,     // Slightly larger positions during peak
      offPeakPositionSizeMultiplier: 0.8,  // Smaller positions during off-peak
      // Loss Strategy Defaults (RED BUTTON!)
      lossStrategyEnabled: false,           // DISABLED by default - toggle via command center
      lossStrategyTargetAllocation: 0.95,   // Hold 95% of portfolio in losing token
      lossStrategyMinMarketCapUSD: 100_000_000, // $100M minimum market cap for liquidity
      lossStrategySelectionMethod: 'most_negative_change' // Pick the token losing the most
      // LLM Strategy Defaults
      llmEnabled: false,
      llmModel: 'gpt-4o', // Default to GPT-4o
      llmTemperature: 0.7,
      llmObjective: 'maximize_profit', // Default objective
      // Guaranteed Meme Token Strategy Defaults
      guaranteedMemeTradeEnabled: false,           // DISABLED by default - toggle via command center
      guaranteedMemeTradeAmountUSD: 10,            // Small $10 trades for meme accumulation
      guaranteedMemeTokenSelectionMethod: 'random_top_solana_meme', // Random selection from top meme tokens
      guaranteedMemeSpecificTokenAddress: '',      // Empty by default
    };
  }

  getParams(): StrategyParams {
    return { ...this.params };
  }

  updateParams(newParams: Partial<StrategyParams>): void {
    this.params = { ...this.params, ...newParams };
    logger.info('Strategy parameters updated', { newParams });
  }

  getParam<K extends keyof StrategyParams>(key: K): StrategyParams[K] {
    return this.params[key];
  }

  setParam<K extends keyof StrategyParams>(key: K, value: StrategyParams[K]): void {
    this.params[key] = value;
    logger.info(`Strategy parameter ${key} updated`, { value });
  }
}