import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS } from '../types/index.js';
import { StrategyParamsManager } from './strategyParams.js';
import { MarketDataRepository } from '../database/marketDataRepository.js';

export class BreakoutStrategy {
  private paramsManager: StrategyParamsManager;
  private marketDataRepository: MarketDataRepository;

  constructor(paramsManager: StrategyParamsManager, marketDataRepository: MarketDataRepository) {
    this.paramsManager = paramsManager;
    this.marketDataRepository = marketDataRepository;
    logger.info('Breakout Strategy initialized');
  }

  async checkBreakout(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      const params = this.paramsManager.getParams();
      const { breakoutLookbackPeriod, breakoutVolatilityThreshold, breakoutConfirmationFactor } = params;

      // Tokens to check for breakout opportunities
      const tokensToCheck = [TOKENS.WETH, TOKENS.WBTC];

      for (const tokenAddress of tokensToCheck) {
        // Fetch historical prices for this token
        const historicalPrices = this.marketDataRepository.getMarketDataByToken(
          tokenAddress, 
          breakoutLookbackPeriod
        );

        // Need at least the lookback period of data points
        if (historicalPrices.length < breakoutLookbackPeriod) {
          logger.debug(`Insufficient historical data for breakout analysis on token ${tokenAddress}`, {
            available: historicalPrices.length,
            required: breakoutLookbackPeriod
          });
          continue;
        }

        // Get current price
        const currentPrice = marketData.prices[tokenAddress];
        if (!currentPrice) {
          logger.warn(`Current price not available for token ${tokenAddress}`);
          continue;
        }

        // Calculate volatility (using coefficient of variation)
        const volatility = this.calculateVolatility(historicalPrices);
        
        // Check if market is in consolidation (low volatility)
        const isConsolidating = volatility < breakoutVolatilityThreshold;

        if (!isConsolidating) {
          logger.debug(`Token ${this.getTokenSymbol(tokenAddress)} not consolidating`, {
            volatility: volatility * 100,
            threshold: breakoutVolatilityThreshold * 100
          });
          continue;
        }

        // Find recent high and low to define consolidation range
        const recentPrices = historicalPrices.slice(-Math.min(20, historicalPrices.length)); // Last 20 periods or available
        const recentHigh = Math.max(...recentPrices.map(p => p.price));
        const recentLow = Math.min(...recentPrices.map(p => p.price));
        const rangeSize = recentHigh - recentLow;

        // Calculate breakout levels
        const upBreakoutLevel = recentHigh + (recentHigh * breakoutConfirmationFactor);
        const downBreakoutLevel = recentLow - (recentLow * breakoutConfirmationFactor);

        logger.debug(`Breakout analysis for ${this.getTokenSymbol(tokenAddress)}`, {
          currentPrice,
          recentHigh,
          recentLow,
          rangeSize,
          upBreakoutLevel,
          downBreakoutLevel,
          volatility: volatility * 100,
          isConsolidating
        });

        // Check for upside breakout (BUY signal)
        if (currentPrice > upBreakoutLevel) {
          const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);
          const minTradeAmount = params.minTradeAmount;
          
          if (usdcBalance >= minTradeAmount) {
            const buyAmount = Math.min(
              usdcBalance * 0.3, // Use 30% of USDC balance for breakout trades
              marketData.portfolio.totalValue * params.maxPositionSize
            );

            if (buyAmount >= minTradeAmount) {
              const breakoutStrength = (currentPrice - upBreakoutLevel) / rangeSize;
              const confidence = Math.min(0.9, 0.7 + breakoutStrength * 2); // Higher confidence for stronger breakouts

              return {
                action: 'buy',
                fromToken: TOKENS.USDC,
                toToken: tokenAddress,
                amount: buyAmount,
                reason: `Breakout: ${this.getTokenSymbol(tokenAddress)} broke above ${upBreakoutLevel.toFixed(4)} (range: ${recentLow.toFixed(4)}-${recentHigh.toFixed(4)}, volatility: ${(volatility * 100).toFixed(2)}%)`,
                confidence
              };
            }
          }
        }
        // Check for downside breakout (SELL signal)
        else if (currentPrice < downBreakoutLevel) {
          const tokenBalance = this.getTokenBalance(marketData, tokenAddress);
          const minTradeAmount = params.minTradeAmount;
          
          if (tokenBalance > 0) {
            const sellAmountUSD = tokenBalance * currentPrice;
            
            if (sellAmountUSD >= minTradeAmount) {
              const sellAmount = Math.min(
                tokenBalance * 0.5, // Sell 50% of holdings on downside breakout
                tokenBalance
              );

              const breakoutStrength = (downBreakoutLevel - currentPrice) / rangeSize;
              const confidence = Math.min(0.9, 0.7 + breakoutStrength * 2);

              return {
                action: 'sell',
                fromToken: tokenAddress,
                toToken: TOKENS.USDC,
                amount: sellAmount,
                reason: `Breakout: ${this.getTokenSymbol(tokenAddress)} broke below ${downBreakoutLevel.toFixed(4)} (range: ${recentLow.toFixed(4)}-${recentHigh.toFixed(4)}, volatility: ${(volatility * 100).toFixed(2)}%)`,
                confidence
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error in breakout strategy', { error });
      return null;
    }
  }

  private calculateVolatility(prices: { timestamp: string; price: number }[]): number {
    if (prices.length < 2) return 0;

    // Calculate coefficient of variation (standard deviation / mean)
    const priceValues = prices.map(p => p.price);
    const mean = priceValues.reduce((sum, price) => sum + price, 0) / priceValues.length;
    
    const variance = priceValues.reduce((sum, price) => {
      const diff = price - mean;
      return sum + (diff * diff);
    }, 0) / priceValues.length;
    
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / mean;
    
    return coefficientOfVariation;
  }

  private getTokenBalance(marketData: MarketData, tokenAddress: string): number {
    const token = marketData.portfolio.tokens.find(t => t.token === tokenAddress);
    return token?.amount || 0;
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
}