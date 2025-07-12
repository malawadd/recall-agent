import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS } from '../types/index.js';

export class TradingStrategy {
  private strategyParams: {
    maxPositionSize: number;
    minTradeAmount: number;
    riskLevel: 'low' | 'medium' | 'high';
    rebalanceThreshold: number;
    targetAllocations: Record<string, number>;
  };

  constructor() {
    this.strategyParams = {
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_PERCENT || '20') / 100,
      minTradeAmount: parseFloat(process.env.MIN_TRADE_AMOUNT_USDC || '10'),
      riskLevel: (process.env.RISK_LEVEL as 'low' | 'medium' | 'high') || 'medium',
      rebalanceThreshold: 0.05, // 5% deviation triggers rebalancing
      targetAllocations: {
        [TOKENS.USDC]: 0.4,  // 40% USDC (stable base)
        [TOKENS.WETH]: 0.35, // 35% WETH (main crypto exposure)
        [TOKENS.WBTC]: 0.25  // 25% WBTC (diversification)
      }
    };

    logger.info('Trading strategy initialized', { strategyParams: this.strategyParams });
  }

  async makeDecision(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      logger.info('Analyzing market data for trading decision...');

      const { portfolio, prices } = marketData;

      // Calculate current allocations
      const currentAllocations = this.calculateCurrentAllocations(portfolio);
      
      // Check if rebalancing is needed
      const rebalanceDecision = this.checkRebalancing(currentAllocations, prices, portfolio.totalValue);
      
      if (rebalanceDecision) {
        logger.info('Rebalancing decision made', { decision: rebalanceDecision });
        return rebalanceDecision;
      }

      // Simple momentum strategy as fallback
      const momentumDecision = this.checkMomentumStrategy(marketData);
      
      if (momentumDecision) {
        logger.info('Momentum strategy decision made', { decision: momentumDecision });
        return momentumDecision;
      }

      logger.info('No trading decision made - holding current positions');
      return null;

    } catch (error) {
      logger.error('Error making trading decision', { error });
      return null;
    }
  }

  private calculateCurrentAllocations(portfolio: any): Record<string, number> {
    const allocations: Record<string, number> = {};
    
    for (const token of portfolio.tokens) {
      allocations[token.token] = token.value / portfolio.totalValue;
    }

    return allocations;
  }

  private checkRebalancing(
    currentAllocations: Record<string, number>,
    prices: Record<string, number>,
    totalValue: number
  ): TradingDecision | null {
    
    for (const [tokenAddress, targetAllocation] of Object.entries(this.strategyParams.targetAllocations)) {
      const currentAllocation = currentAllocations[tokenAddress] || 0;
      const deviation = Math.abs(currentAllocation - targetAllocation);

      if (deviation > this.strategyParams.rebalanceThreshold) {
        const isOverweight = currentAllocation > targetAllocation;
        
        if (isOverweight) {
          // Sell overweight position to USDC
          const excessValue = (currentAllocation - targetAllocation) * totalValue;
          const sellAmount = excessValue / prices[tokenAddress];

          if (sellAmount * prices[tokenAddress] >= this.strategyParams.minTradeAmount) {
            return {
              action: 'sell',
              fromToken: tokenAddress,
              toToken: TOKENS.USDC,
              amount: sellAmount,
              reason: `Rebalancing: ${this.getTokenSymbol(tokenAddress)} overweight by ${(deviation * 100).toFixed(2)}%`,
              confidence: 0.8
            };
          }
        } else {
          // Buy underweight position with USDC
          const deficitValue = (targetAllocation - currentAllocation) * totalValue;
          const usdcBalance = currentAllocations[TOKENS.USDC] * totalValue;

          if (deficitValue >= this.strategyParams.minTradeAmount && usdcBalance >= deficitValue) {
            return {
              action: 'buy',
              fromToken: TOKENS.USDC,
              toToken: tokenAddress,
              amount: deficitValue, // Amount in USDC
              reason: `Rebalancing: ${this.getTokenSymbol(tokenAddress)} underweight by ${(deviation * 100).toFixed(2)}%`,
              confidence: 0.8
            };
          }
        }
      }
    }

    return null;
  }

  private checkMomentumStrategy(marketData: MarketData): TradingDecision | null {
    // Simple momentum strategy: if we have excess USDC and WETH is trending up, buy WETH
    const { portfolio, prices } = marketData;
    
    const usdcToken = portfolio.tokens.find(t => t.token === TOKENS.USDC);
    const wethPrice = prices[TOKENS.WETH];
    
    if (!usdcToken || !wethPrice) return null;

    const usdcBalance = usdcToken.amount;
    const usdcAllocation = usdcToken.value / portfolio.totalValue;

    // If we have more than 50% in USDC, consider buying WETH
    if (usdcAllocation > 0.5 && usdcBalance > this.strategyParams.minTradeAmount) {
      const buyAmount = Math.min(
        usdcBalance * 0.1, // Buy 10% of USDC balance
        portfolio.totalValue * this.strategyParams.maxPositionSize // Don't exceed max position size
      );

      if (buyAmount >= this.strategyParams.minTradeAmount) {
        return {
          action: 'buy',
          fromToken: TOKENS.USDC,
          toToken: TOKENS.WETH,
          amount: buyAmount,
          reason: `Momentum strategy: High USDC allocation (${(usdcAllocation * 100).toFixed(1)}%), buying WETH`,
          confidence: 0.6
        };
      }
    }

    return null;
  }

  private getTokenSymbol(tokenAddress: string): string {
    const tokenMap: Record<string, string> = {
      [TOKENS.USDC]: 'USDC',
      [TOKENS.WETH]: 'WETH',
      [TOKENS.WBTC]: 'WBTC',
      [TOKENS.DAI]: 'DAI',
      [TOKENS.USDT]: 'USDT'
    };

    return tokenMap[tokenAddress] || tokenAddress.slice(0, 8) + '...';
  }

  updateStrategyParams(newParams: Partial<typeof this.strategyParams>): void {
    this.strategyParams = { ...this.strategyParams, ...newParams };
    logger.info('Strategy parameters updated', { newParams });
  }

  getStrategyParams(): typeof this.strategyParams {
    return { ...this.strategyParams };
  }

  // Advanced strategy placeholder - can be expanded later
  async analyzeTechnicalIndicators(marketData: MarketData): Promise<any> {
    // Placeholder for technical analysis
    // Could implement RSI, MACD, Bollinger Bands, etc.
    return {
      rsi: 50,
      macd: 0,
      signal: 'neutral'
    };
  }
}

export default TradingStrategy;