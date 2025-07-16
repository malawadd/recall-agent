import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS } from '../types/index.js';
import { StrategyParamsManager } from './strategyParams.js';
import { MarketDataRepository } from '../database/marketDataRepository.js';

export class MeanReversionStrategy {
  private paramsManager: StrategyParamsManager;
  private marketDataRepository: MarketDataRepository;

  constructor(paramsManager: StrategyParamsManager, marketDataRepository: MarketDataRepository) {
    this.paramsManager = paramsManager;
    this.marketDataRepository = marketDataRepository;
    logger.info('Mean Reversion Strategy initialized');
  }

  async checkMeanReversion(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      const params = this.paramsManager.getParams();
      const { meanReversionLookbackPeriod, meanReversionDeviationThreshold } = params;

      // Predefined list of tokens to check for mean reversion
      const tokensToCheck = [TOKENS.WETH, TOKENS.WBTC];

      for (const tokenAddress of tokensToCheck) {
        // Fetch historical prices for this token
        const historicalPrices = this.marketDataRepository.getMarketDataByToken(
          tokenAddress, 
          meanReversionLookbackPeriod
        );

        // Need at least the lookback period of data points
        if (historicalPrices.length < meanReversionLookbackPeriod) {
          logger.debug(`Insufficient historical data for token ${tokenAddress}`, {
            available: historicalPrices.length,
            required: meanReversionLookbackPeriod
          });
          continue;
        }

        // Calculate Simple Moving Average (SMA)
        const sma = this.calculateSMA(historicalPrices);
        
        // Get current price from market data
        const currentPrice = marketData.prices[tokenAddress];
        if (!currentPrice) {
          logger.warn(`Current price not available for token ${tokenAddress}`);
          continue;
        }

        // Calculate deviation from SMA
        const deviation = (currentPrice - sma) / sma;
        const absDeviation = Math.abs(deviation);

        logger.debug(`Mean reversion analysis for ${this.getTokenSymbol(tokenAddress)}`, {
          currentPrice,
          sma,
          deviation: deviation * 100,
          threshold: meanReversionDeviationThreshold * 100
        });

        // Check if deviation exceeds threshold
        if (absDeviation > meanReversionDeviationThreshold) {
          // Price is significantly below SMA - BUY signal
          if (deviation < -meanReversionDeviationThreshold) {
            const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);
            const minTradeAmount = params.minTradeAmount;
            
            if (usdcBalance >= minTradeAmount) {
              const buyAmount = Math.min(
                usdcBalance * 0.2, // Use 20% of USDC balance
                marketData.portfolio.totalValue * params.maxPositionSize
              );

              if (buyAmount >= minTradeAmount) {
                return {
                  action: 'buy',
                  fromToken: TOKENS.USDC,
                  toToken: tokenAddress,
                  amount: buyAmount,
                  reason: `Mean Reversion: ${this.getTokenSymbol(tokenAddress)} is ${(Math.abs(deviation) * 100).toFixed(2)}% below SMA(${meanReversionLookbackPeriod})`,
                  confidence: Math.min(0.9, 0.5 + absDeviation * 2) // Higher confidence for larger deviations
                };
              }
            }
          }
          // Price is significantly above SMA - SELL signal
          else if (deviation > meanReversionDeviationThreshold) {
            const tokenBalance = this.getTokenBalance(marketData, tokenAddress);
            const minTradeAmount = params.minTradeAmount;
            
            if (tokenBalance > 0) {
              const sellAmountUSD = tokenBalance * currentPrice;
              
              if (sellAmountUSD >= minTradeAmount) {
                const sellAmount = Math.min(
                  tokenBalance * 0.3, // Sell 30% of holdings
                  tokenBalance
                );

                return {
                  action: 'sell',
                  fromToken: tokenAddress,
                  toToken: TOKENS.USDC,
                  amount: sellAmount,
                  reason: `Mean Reversion: ${this.getTokenSymbol(tokenAddress)} is ${(deviation * 100).toFixed(2)}% above SMA(${meanReversionLookbackPeriod})`,
                  confidence: Math.min(0.9, 0.5 + absDeviation * 2)
                };
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error in mean reversion strategy', { error });
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