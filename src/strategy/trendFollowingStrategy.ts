import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS } from '../types/index.js';
import { StrategyParamsManager } from './strategyParams.js';
import { MarketDataRepository } from '../database/marketDataRepository.js';

export class TrendFollowingStrategy {
  private paramsManager: StrategyParamsManager;
  private marketDataRepository: MarketDataRepository;

  constructor(paramsManager: StrategyParamsManager, marketDataRepository: MarketDataRepository) {
    this.paramsManager = paramsManager;
    this.marketDataRepository = marketDataRepository;
    logger.info('Trend Following Strategy initialized');
  }

  async checkTrendFollowing(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      const params = this.paramsManager.getParams();
      const { trendFollowingShortSmaPeriod, trendFollowingLongSmaPeriod } = params;

      // Relevant tokens to check for trend following
      const tokensToCheck = [TOKENS.WETH, TOKENS.WBTC];

      for (const tokenAddress of tokensToCheck) {
        // Fetch historical prices for this token
        const historicalPrices = this.marketDataRepository.getMarketDataByToken(
          tokenAddress, 
          trendFollowingLongSmaPeriod // Need at least long SMA period of data
        );

        // Need at least the long SMA period of data points
        if (historicalPrices.length < trendFollowingLongSmaPeriod) {
          logger.debug(`Insufficient historical data for trend following on token ${tokenAddress}`, {
            available: historicalPrices.length,
            required: trendFollowingLongSmaPeriod
          });
          continue;
        }

        // Calculate short-term and long-term SMAs
        const shortSMA = this.calculateSMA(historicalPrices.slice(-trendFollowingShortSmaPeriod));
        const longSMA = this.calculateSMA(historicalPrices.slice(-trendFollowingLongSmaPeriod));

        // Get previous SMAs to detect crossover
        const prevShortSMA = this.calculateSMA(
          historicalPrices.slice(-(trendFollowingShortSmaPeriod + 1), -1)
        );
        const prevLongSMA = this.calculateSMA(
          historicalPrices.slice(-(trendFollowingLongSmaPeriod + 1), -1)
        );

        // Get current price
        const currentPrice = marketData.prices[tokenAddress];
        if (!currentPrice) {
          logger.warn(`Current price not available for token ${tokenAddress}`);
          continue;
        }

        logger.debug(`Trend following analysis for ${this.getTokenSymbol(tokenAddress)}`, {
          currentPrice,
          shortSMA,
          longSMA,
          prevShortSMA,
          prevLongSMA
        });

        // Check for Golden Cross (short SMA crosses above long SMA) - BUY signal
        if (prevShortSMA <= prevLongSMA && shortSMA > longSMA) {
          const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);
          const minTradeAmount = params.minTradeAmount;
          
          if (usdcBalance >= minTradeAmount) {
            const buyAmount = Math.min(
              usdcBalance * 0.25, // Use 25% of USDC balance for trend following
              marketData.portfolio.totalValue * params.maxPositionSize
            );

            if (buyAmount >= minTradeAmount) {
              return {
                action: 'buy',
                fromToken: TOKENS.USDC,
                toToken: tokenAddress,
                amount: buyAmount,
                reason: `Trend Following: Golden Cross detected for ${this.getTokenSymbol(tokenAddress)} (Short SMA: ${shortSMA.toFixed(2)}, Long SMA: ${longSMA.toFixed(2)})`,
                confidence: 0.75
              };
            }
          }
        }
        // Check for Death Cross (short SMA crosses below long SMA) - SELL signal
        else if (prevShortSMA >= prevLongSMA && shortSMA < longSMA) {
          const tokenBalance = this.getTokenBalance(marketData, tokenAddress);
          const minTradeAmount = params.minTradeAmount;
          
          if (tokenBalance > 0) {
            const sellAmountUSD = tokenBalance * currentPrice;
            
            if (sellAmountUSD >= minTradeAmount) {
              const sellAmount = Math.min(
                tokenBalance * 0.4, // Sell 40% of holdings on death cross
                tokenBalance
              );

              return {
                action: 'sell',
                fromToken: tokenAddress,
                toToken: TOKENS.USDC,
                amount: sellAmount,
                reason: `Trend Following: Death Cross detected for ${this.getTokenSymbol(tokenAddress)} (Short SMA: ${shortSMA.toFixed(2)}, Long SMA: ${longSMA.toFixed(2)})`,
                confidence: 0.75
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error in trend following strategy', { error });
      return null;
    }
  }

  private calculateSMA(prices: { timestamp: string; price: number }[]): number {
    if (prices.length === 0) return 0;
    
    const sum = prices.reduce((acc, priceData) => acc + priceData.price, 0);
    return sum / prices.length;
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