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
      rebalanceThreshold: 0.05, // 5% deviation triggers rebalancing
      targetAllocations: {
        [TOKENS.USDC]: 0.4,  // 40% USDC (stable base)
        [TOKENS.WETH]: 0.35, // 35% WETH (main crypto exposure)
        [TOKENS.WBTC]: 0.25  // 25% WBTC (diversification)
      },
      meanReversionLookbackPeriod: 20,
      meanReversionDeviationThreshold: 0.02,
      trendFollowingShortSmaPeriod: 10,
      trendFollowingLongSmaPeriod: 50,
      // Breakout Strategy Defaults
      breakoutLookbackPeriod: 50,
      breakoutVolatilityThreshold: 0.01, // 1% volatility threshold for consolidation
      breakoutConfirmationFactor: 0.005, // 0.5% price movement to confirm breakout
      // Time-Based Strategy Defaults
      peakLiquidityHours: [
        { start: 13, end: 21 }, // 1 PM to 9 PM UTC (US/EU overlap)
        { start: 0, end: 2 }    // 12 AM to 2 AM UTC (Asia open)
      ],
      peakTradeIntervalMultiplier: 0.6,    // More frequent trades during peak hours
      offPeakTradeIntervalMultiplier: 1.5, // Less frequent trades during off-peak
      peakPositionSizeMultiplier: 1.2,     // Slightly larger positions during peak
      offPeakPositionSizeMultiplier: 0.8   // Smaller positions during off-peak
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