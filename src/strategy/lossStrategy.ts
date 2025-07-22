import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS } from '../types/index.js';
import { StrategyParamsManager } from './strategyParams.js';
import CoinGeckoClient, { TokenCandidate } from '../api/coinGeckoClient.js';

export class LossStrategy {
  private paramsManager: StrategyParamsManager;
  private coinGeckoClient: CoinGeckoClient;
  private lastSelectedToken: string | null = null;
  private lastSelectionTime: number = 0;
  private selectionCacheTimeout: number = 600000; // 10 minutes

  constructor(paramsManager: StrategyParamsManager) {
    this.paramsManager = paramsManager;
    this.coinGeckoClient = new CoinGeckoClient();
    logger.info('🔴 LOSS STRATEGY INITIALIZED - RED BUTTON READY! 🔴');
  }

  async checkLossStrategy(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      const params = this.paramsManager.getParams();
      
      // Check if loss strategy is enabled
      if (!params.lossStrategyEnabled) {
        return null;
      }

      logger.info('🔴 LOSS STRATEGY ACTIVE - ATTEMPTING TO LOSE MONEY! 🔴');

      const { portfolio } = marketData;
      const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);

      // Find the best losing token (cache for 10 minutes to avoid excessive API calls)
      const bestLosingToken = await this.findBestLosingToken();
      
      if (!bestLosingToken) {
        logger.warn('🔴 No suitable losing token found - falling back to WETH');
        // Fallback to WETH if no external token found
        return this.createLossDecision(TOKENS.WETH, 'WETH', marketData);
      }

      // Check current allocation to the losing token
      const currentAllocation = this.getCurrentAllocation(marketData, bestLosingToken.contractAddress);
      const targetAllocation = params.lossStrategyTargetAllocation;

      logger.info('🔴 LOSS STRATEGY ANALYSIS', {
        targetToken: bestLosingToken.symbol,
        contractAddress: bestLosingToken.contractAddress,
        priceChange24h: bestLosingToken.priceChange24h.toFixed(2) + '%',
        priceChange1h: bestLosingToken.priceChange1h.toFixed(2) + '%',
        currentAllocation: (currentAllocation * 100).toFixed(1) + '%',
        targetAllocation: (targetAllocation * 100).toFixed(1) + '%',
        marketCap: (bestLosingToken.marketCap / 1_000_000).toFixed(0) + 'M'
      });

      // If we're not allocated enough to the losing token, buy more
      if (currentAllocation < targetAllocation) {
        const deficitAllocation = targetAllocation - currentAllocation;
        const deficitValue = deficitAllocation * portfolio.totalValue;

        // Use most of our USDC to buy the losing token
        const buyAmount = Math.min(deficitValue, usdcBalance * 0.9); // Use 90% of USDC

        if (buyAmount >= 10 && usdcBalance >= buyAmount) { // Minimum $10 trade
          return {
            action: 'buy',
            fromToken: TOKENS.USDC,
            toToken: bestLosingToken.contractAddress,
            amount: buyAmount,
            reason: `🔴 LOSS STRATEGY: Converting $${buyAmount.toFixed(0)} to ${bestLosingToken.symbol} (${bestLosingToken.priceChange24h.toFixed(2)}% down today) - TARGET: LOSE ALL MONEY! 🔴`,
            confidence: 0.95 // High confidence in losing money!
          };
        }
      }

      // If we're already heavily invested in the losing token, hold and let it tank
      logger.info('🔴 LOSS STRATEGY: Already heavily invested in losing token - HOLDING FOR MAXIMUM LOSS! 🔴', {
        token: bestLosingToken.symbol,
        allocation: (currentAllocation * 100).toFixed(1) + '%'
      });

      return null; // Let other strategies run to maintain activity

    } catch (error) {
      logger.error('🔴 Error in loss strategy', { error });
      
      // Fallback to WETH if external API fails
      logger.warn('🔴 Falling back to WETH for loss strategy');
      return this.createLossDecision(TOKENS.WETH, 'WETH', marketData);
    }
  }

  private async findBestLosingToken(): Promise<TokenCandidate | null> {
    try {
      // Use cache to avoid excessive API calls
      const now = Date.now();
      if (this.lastSelectedToken && (now - this.lastSelectionTime) < this.selectionCacheTimeout) {
        logger.debug('Using cached losing token selection');
        return {
          contractAddress: this.lastSelectedToken,
          symbol: 'CACHED',
          name: 'Cached Token',
          currentPrice: 0,
          marketCap: 0,
          priceChange24h: 0,
          priceChange1h: 0,
          volume: 0
        };
      }

      const params = this.paramsManager.getParams();
      const bestToken = await this.coinGeckoClient.findBestLosingToken(
        params.lossStrategyMinMarketCapUSD,
        params.lossStrategySelectionMethod
      );

      if (bestToken) {
        this.lastSelectedToken = bestToken.contractAddress;
        this.lastSelectionTime = now;
      }

      return bestToken;

    } catch (error) {
      logger.error('Error finding best losing token', { error });
      return null;
    }
  }

  private createLossDecision(tokenAddress: string, symbol: string, marketData: MarketData): TradingDecision | null {
    const params = this.paramsManager.getParams();
    const { portfolio } = marketData;
    const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);
    
    const currentAllocation = this.getCurrentAllocation(marketData, tokenAddress);
    const targetAllocation = params.lossStrategyTargetAllocation;

    if (currentAllocation < targetAllocation) {
      const deficitAllocation = targetAllocation - currentAllocation;
      const deficitValue = deficitAllocation * portfolio.totalValue;
      const buyAmount = Math.min(deficitValue, usdcBalance * 0.9);

      if (buyAmount >= 10 && usdcBalance >= buyAmount) {
        return {
          action: 'buy',
          fromToken: TOKENS.USDC,
          toToken: tokenAddress,
          amount: buyAmount,
          reason: `🔴 LOSS STRATEGY FALLBACK: Converting $${buyAmount.toFixed(0)} to ${symbol} - TARGET: LOSE ALL MONEY! 🔴`,
          confidence: 0.9
        };
      }
    }

    return null;
  }

  private getCurrentAllocation(marketData: MarketData, tokenAddress: string): number {
    const token = marketData.portfolio.tokens.find(t => 
      t.token.toLowerCase() === tokenAddress.toLowerCase()
    );
    
    if (!token) return 0;
    return token.value / marketData.portfolio.totalValue;
  }

  private getTokenBalance(marketData: MarketData, tokenAddress: string): number {
    const token = marketData.portfolio.tokens.find(t => t.token === tokenAddress);
    return token?.amount || 0;
  }

  // Method to get current strategy state for monitoring
  getState(): { 
    enabled: boolean; 
    lastSelectedToken: string | null; 
    lastSelectionTime: number;
  } {
    const params = this.paramsManager.getParams();
    return {
      enabled: params.lossStrategyEnabled,
      lastSelectedToken: this.lastSelectedToken,
      lastSelectionTime: this.lastSelectionTime
    };
  }

  // Method to reset strategy state
  resetState(): void {
    this.lastSelectedToken = null;
    this.lastSelectionTime = 0;
    this.coinGeckoClient.clearCache();
    logger.info('🔴 Loss strategy state reset');
  }
}