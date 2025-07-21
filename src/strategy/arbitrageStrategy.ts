import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS } from '../types/index.js';
import { StrategyParamsManager } from './strategyParams.js';
import { MarketDataRepository } from '../database/marketDataRepository.js';

export class ArbitrageStrategy {
  private paramsManager: StrategyParamsManager;
  private marketDataRepository: MarketDataRepository;
  private lastTradeDirection: 'buy' | 'sell' = 'sell'; // Start with sell to buy WETH first
  private tradeCounter: number = 0;

  constructor(paramsManager: StrategyParamsManager, marketDataRepository: MarketDataRepository) {
    this.paramsManager = paramsManager;
    this.marketDataRepository = marketDataRepository;
    logger.info('Arbitrage Strategy initialized - GUARANTEED TRADE MODE');
  }

  async checkArbitrage(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      logger.info('Executing guaranteed arbitrage trade - no cycle goes without a trade!');

      const params = this.paramsManager.getParams();
      const { portfolio, prices } = marketData;

      // Alternate between buying and selling to create activity
      this.tradeCounter++;
      const shouldBuy = this.lastTradeDirection === 'sell';

      // Define small trade amounts ($10-$50)
      const minArbitrageAmount = 10;
      const maxArbitrageAmount = 50;
      const tradeAmount = minArbitrageAmount + (this.tradeCounter % 5) * 8; // Varies between $10-$50

      if (shouldBuy) {
        // BUY WETH with USDC
        const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);
        const wethPrice = prices[TOKENS.WETH];

        if (usdcBalance >= tradeAmount && wethPrice > 0) {
          this.lastTradeDirection = 'buy';
          
          return {
            action: 'buy',
            fromToken: TOKENS.USDC,
            toToken: TOKENS.WETH,
            amount: tradeAmount,
            reason: `Arbitrage Swap #${this.tradeCounter}: Guaranteed trade - buying $${tradeAmount} WETH to maintain activity`,
            confidence: 0.1 // Very low confidence since it's a forced trade
          };
        }
      } else {
        // SELL WETH for USDC
        const wethBalance = this.getTokenBalance(marketData, TOKENS.WETH);
        const wethPrice = prices[TOKENS.WETH];

        if (wethBalance > 0 && wethPrice > 0) {
          const wethValueUSD = wethBalance * wethPrice;
          
          if (wethValueUSD >= tradeAmount) {
            const sellAmount = tradeAmount / wethPrice; // Convert USD amount to WETH amount
            this.lastTradeDirection = 'sell';
            
            return {
              action: 'sell',
              fromToken: TOKENS.WETH,
              toToken: TOKENS.USDC,
              amount: sellAmount,
              reason: `Arbitrage Swap #${this.tradeCounter}: Guaranteed trade - selling $${tradeAmount} worth of WETH to maintain activity`,
              confidence: 0.1 // Very low confidence since it's a forced trade
            };
          }
        }
      }

      // Fallback: If primary tokens don't work, try WBTC
      const wbtcBalance = this.getTokenBalance(marketData, TOKENS.WBTC);
      const wbtcPrice = prices[TOKENS.WBTC];
      const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);

      if (shouldBuy && usdcBalance >= tradeAmount && wbtcPrice > 0) {
        this.lastTradeDirection = 'buy';
        
        return {
          action: 'buy',
          fromToken: TOKENS.USDC,
          toToken: TOKENS.WBTC,
          amount: tradeAmount,
          reason: `Arbitrage Swap #${this.tradeCounter}: Fallback guaranteed trade - buying $${tradeAmount} WBTC`,
          confidence: 0.1
        };
      } else if (!shouldBuy && wbtcBalance > 0 && wbtcPrice > 0) {
        const wbtcValueUSD = wbtcBalance * wbtcPrice;
        
        if (wbtcValueUSD >= tradeAmount) {
          const sellAmount = tradeAmount / wbtcPrice;
          this.lastTradeDirection = 'sell';
          
          return {
            action: 'sell',
            fromToken: TOKENS.WBTC,
            toToken: TOKENS.USDC,
            amount: sellAmount,
            reason: `Arbitrage Swap #${this.tradeCounter}: Fallback guaranteed trade - selling $${tradeAmount} worth of WBTC`,
            confidence: 0.1
          };
        }
      }

      // Last resort: Any available token swap
      const availableTokens = portfolio.tokens.filter(t => 
        t.amount > 0 && 
        t.value >= tradeAmount && 
        t.token !== TOKENS.USDC
      );

      if (availableTokens.length > 0) {
        const randomToken = availableTokens[this.tradeCounter % availableTokens.length];
        const tokenPrice = prices[randomToken.token];
        
        if (tokenPrice > 0) {
          const sellAmount = tradeAmount / tokenPrice;
          this.lastTradeDirection = 'sell';
          
          return {
            action: 'sell',
            fromToken: randomToken.token,
            toToken: TOKENS.USDC,
            amount: sellAmount,
            reason: `Arbitrage Swap #${this.tradeCounter}: Emergency guaranteed trade - selling $${tradeAmount} worth of ${randomToken.symbol}`,
            confidence: 0.05 // Even lower confidence for emergency trades
          };
        }
      }

      logger.warn('Could not generate guaranteed arbitrage trade - insufficient balances', {
        tradeAmount,
        portfolioValue: portfolio.totalValue,
        tokenCount: portfolio.tokens.length
      });

      return null;

    } catch (error) {
      logger.error('Error in arbitrage strategy', { error });
      return null;
    }
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

  // Method to reset the strategy state if needed
  resetState(): void {
    this.lastTradeDirection = 'sell';
    this.tradeCounter = 0;
    logger.info('Arbitrage strategy state reset');
  }

  // Get current strategy state for monitoring
  getState(): { lastTradeDirection: string; tradeCounter: number } {
    return {
      lastTradeDirection: this.lastTradeDirection,
      tradeCounter: this.tradeCounter
    };
  }
}