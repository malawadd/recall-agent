import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS } from '../types/index.js';
import { StrategyParamsManager } from './strategyParams.js';
import { MeanReversionStrategy } from './meanReversionStrategy.js';
import { TrendFollowingStrategy } from './trendFollowingStrategy.js';
import { MarketDataRepository } from '../database/marketDataRepository.js';

export class StrategyOrchestrator {
  private paramsManager: StrategyParamsManager;
  private meanReversionStrategy: MeanReversionStrategy;
  private trendFollowingStrategy: TrendFollowingStrategy;
  private marketDataRepository: MarketDataRepository;

  constructor(paramsManager: StrategyParamsManager, marketDataRepository: MarketDataRepository) {
    this.paramsManager = paramsManager;
    this.marketDataRepository = marketDataRepository;
    this.meanReversionStrategy = new MeanReversionStrategy(paramsManager, marketDataRepository);
    this.trendFollowingStrategy = new TrendFollowingStrategy(paramsManager, marketDataRepository);

    logger.info('Strategy orchestrator initialized');
  }

  async makeDecision(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      logger.info('Analyzing market data for trading decision...');

      // Save current market data for historical analysis
      this.saveCurrentMarketData(marketData);

      // Strategy priority order:
      // 1. Rebalancing (highest priority - maintain target allocations)
      // 2. Trend Following (medium-high priority - catch strong trends)
      // 3. Mean Reversion (medium priority - profit from price corrections)
      // 4. Momentum (lowest priority - fallback strategy)

      // Check rebalancing strategy first
      const rebalanceDecision = this.checkRebalancing(marketData);
      if (rebalanceDecision) {
        logger.info('Rebalancing decision made', { decision: rebalanceDecision });
        return rebalanceDecision;
      }

      // Check trend following strategy
      const trendDecision = await this.trendFollowingStrategy.checkTrendFollowing(marketData);
      if (trendDecision) {
        logger.info('Trend following decision made', { decision: trendDecision });
        return trendDecision;
      }

      // Check mean reversion strategy
      const meanReversionDecision = await this.meanReversionStrategy.checkMeanReversion(marketData);
      if (meanReversionDecision) {
        logger.info('Mean reversion decision made', { decision: meanReversionDecision });
        return meanReversionDecision;
      }

      // Fallback to momentum strategy
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

  private saveCurrentMarketData(marketData: MarketData): void {
    try {
      const timestamp = marketData.timestamp;
      const portfolioValue = marketData.portfolio.totalValue;

      // Save prices for all tokens in the portfolio and our standard tokens
      const allTokens = new Set([
        ...Object.values(TOKENS),
        ...marketData.portfolio.tokens.map(t => t.token)
      ]);

      for (const tokenAddress of allTokens) {
        const price = marketData.prices[tokenAddress];
        if (price) {
          this.marketDataRepository.saveMarketData(timestamp, tokenAddress, price, portfolioValue);
        }
      }
    } catch (error) {
      logger.error('Error saving market data', { error });
    }
  }

  private checkRebalancing(marketData: MarketData): TradingDecision | null {
    const params = this.paramsManager.getParams();
    const { portfolio, prices } = marketData;

    // Calculate current allocations
    const currentAllocations = this.calculateCurrentAllocations(portfolio);
    
    for (const [tokenAddress, targetAllocation] of Object.entries(params.targetAllocations)) {
      const currentAllocation = currentAllocations[tokenAddress] || 0;
      const deviation = Math.abs(currentAllocation - targetAllocation);

      if (deviation > params.rebalanceThreshold) {
        const isOverweight = currentAllocation > targetAllocation;
        
        if (isOverweight) {
          // Sell overweight position to USDC
          const excessValue = (currentAllocation - targetAllocation) * portfolio.totalValue;
          const sellAmount = excessValue / prices[tokenAddress];

          if (sellAmount * prices[tokenAddress] >= params.minTradeAmount) {
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
          const deficitValue = (targetAllocation - currentAllocation) * portfolio.totalValue;
          const usdcBalance = currentAllocations[TOKENS.USDC] * portfolio.totalValue;

          if (deficitValue >= params.minTradeAmount && usdcBalance >= deficitValue) {
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
    const params = this.paramsManager.getParams();
    const { portfolio, prices } = marketData;
    
    const usdcToken = portfolio.tokens.find(t => t.token === TOKENS.USDC);
    const wethPrice = prices[TOKENS.WETH];
    
    if (!usdcToken || !wethPrice) return null;

    const usdcBalance = usdcToken.amount;
    const usdcAllocation = usdcToken.value / portfolio.totalValue;

    // If we have more than 50% in USDC, consider buying WETH
    if (usdcAllocation > 0.5 && usdcBalance > params.minTradeAmount) {
      const buyAmount = Math.min(
        usdcBalance * 0.1, // Buy 10% of USDC balance
        portfolio.totalValue * params.maxPositionSize // Don't exceed max position size
      );

      if (buyAmount >= params.minTradeAmount) {
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

  private calculateCurrentAllocations(portfolio: any): Record<string, number> {
    const allocations: Record<string, number> = {};
    
    for (const token of portfolio.tokens) {
      allocations[token.token] = token.value / portfolio.totalValue;
    }

    return allocations;
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

  updateStrategyParams(newParams: Partial<any>): void {
    this.paramsManager.updateParams(newParams);
  }

  getStrategyParams(): any {
    return this.paramsManager.getParams();
  }
}

export default StrategyOrchestrator;