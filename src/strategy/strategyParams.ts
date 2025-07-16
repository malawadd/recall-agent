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
      trendFollowingLongSmaPeriod: 50
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