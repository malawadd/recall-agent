import logger from '../utils/logger.js';
import { MarketData, TradingDecision, TOKENS, CHAINS } from '../types/index.js';
import { StrategyParamsManager } from './strategyParams.js';
import CoinGeckoClient, { TokenCandidate } from '../api/coinGeckoClient.js';

export class GuaranteedMemeStrategy {
  private paramsManager: StrategyParamsManager;
  private coinGeckoClient: CoinGeckoClient;
  private lastSelectedToken: TokenCandidate | null = null;
  private lastSelectionTime: number = 0;
  private selectionCacheTimeout: number = 300000; // 5 minutes cache for token selection

  constructor(paramsManager: StrategyParamsManager) {
    this.paramsManager = paramsManager;
    this.coinGeckoClient = new CoinGeckoClient();
    logger.info('🚀 GUARANTEED MEME STRATEGY INITIALIZED - MEME ACCUMULATION MODE READY! 🚀');
  }

  async makeGuaranteedMemeDecision(marketData: MarketData): Promise<TradingDecision | null> {
    try {
      const params = this.paramsManager.getParams();
      
      // Check if guaranteed meme trading is enabled
      if (!params.guaranteedMemeTradeEnabled) {
        return null;
      }

      logger.info('🚀 GUARANTEED MEME STRATEGY ACTIVE - ACCUMULATING MEME TOKENS! 🚀');

      const { portfolio } = marketData;
      const usdcBalance = this.getTokenBalance(marketData, TOKENS.USDC);
      const tradeAmountUSD = params.guaranteedMemeTradeAmountUSD;

      // Find the best meme token to buy (cache for 5 minutes to avoid excessive API calls)
      const bestMemeToken = await this.findBestSolanaMemeToken();
      
      if (!bestMemeToken) {
        logger.warn('🚀 No suitable Solana meme token found - skipping guaranteed meme trade');
        return null;
      }

      logger.info('🚀 GUARANTEED MEME TRADE ANALYSIS', {
        targetToken: bestMemeToken.symbol,
        contractAddress: bestMemeToken.contractAddress,
        priceChange24h: bestMemeToken.priceChange24h.toFixed(2) + '%',
        priceChange1h: bestMemeToken.priceChange1h.toFixed(2) + '%',
        marketCap: (bestMemeToken.marketCap / 1_000_000).toFixed(1) + 'M',
        volume: (bestMemeToken.volume / 1_000_000).toFixed(1) + 'M',
        tradeAmountUSD,
        usdcBalance
      });

      // Check if we have enough USDC for the trade
      if (usdcBalance >= tradeAmountUSD) {
        return {
          action: 'buy',
          fromToken: TOKENS.USDC,
          toToken: bestMemeToken.contractAddress,
          amount: tradeAmountUSD,
          reason: `🚀 GUARANTEED MEME: Accumulating $${tradeAmountUSD} of ${bestMemeToken.symbol} (${bestMemeToken.priceChange24h.toFixed(2)}% 24h) - MEME ACCUMULATION MODE! 🚀`,
          confidence: 0.01, // Very low confidence since it's a forced trade
          isGuaranteedMemeTrade: true // 🔥 BYPASS ALL RISK CHECKS! 🔥
        };
      }

      // If insufficient USDC, try to sell some other holdings to fund the meme purchase
      const availableTokens = portfolio.tokens.filter(t => 
        t.amount > 0 && 
        t.value >= tradeAmountUSD && 
        t.token !== TOKENS.USDC &&
        !t.token.includes('Sol11111111111111111111111111111111111111112') // Don't sell SOL if we have it
      );

      if (availableTokens.length > 0) {
        // Sell the token with the highest value to fund meme purchase
        const tokenToSell = availableTokens.reduce((max, token) => 
          token.value > max.value ? token : max
        );
        
        const sellAmountUSD = Math.min(tradeAmountUSD * 1.1, tokenToSell.value * 0.1); // Sell 10% or enough for trade + buffer
        const sellAmount = sellAmountUSD / tokenToSell.price;

        return {
          action: 'sell',
          fromToken: tokenToSell.token,
          toToken: TOKENS.USDC,
          amount: sellAmount,
          reason: `🚀 GUARANTEED MEME PREP: Selling $${sellAmountUSD.toFixed(0)} of ${tokenToSell.symbol} to fund meme token purchase - MEME ACCUMULATION MODE! 🚀`,
          confidence: 0.01,
          isGuaranteedMemeTrade: true // 🔥 BYPASS ALL RISK CHECKS! 🔥
        };
      }

      logger.warn('🚀 Insufficient funds for guaranteed meme trade', {
        tradeAmountUSD,
        usdcBalance,
        portfolioValue: portfolio.totalValue
      });

      return null;

    } catch (error) {
      logger.error('🚀 Error in guaranteed meme strategy', { error });
      return null;
    }
  }

  private async findBestSolanaMemeToken(): Promise<TokenCandidate | null> {
    try {
      // Use cache to avoid excessive API calls
      const now = Date.now();
      if (this.lastSelectedToken && (now - this.lastSelectionTime) < this.selectionCacheTimeout) {
        logger.debug('Using cached Solana meme token selection');
        return this.lastSelectedToken;
      }

      const params = this.paramsManager.getParams();
      const bestToken = await this.coinGeckoClient.findBestSolanaMemeToken(
        params.guaranteedMemeTokenSelectionMethod,
        params.guaranteedMemeSpecificTokenAddress
      );

      if (bestToken) {
        this.lastSelectedToken = bestToken;
        this.lastSelectionTime = now;
      }

      return bestToken;

    } catch (error) {
      logger.error('Error finding best Solana meme token', { error });
      return null;
    }
  }

  private getTokenBalance(marketData: MarketData, tokenAddress: string): number {
    const token = marketData.portfolio.tokens.find(t => t.token === tokenAddress);
    return token?.amount || 0;
  }

  // Method to get current strategy state for monitoring
  getState(): { 
    enabled: boolean; 
    lastSelectedToken: TokenCandidate | null; 
    lastSelectionTime: number;
    tradeAmountUSD: number;
    selectionMethod: string;
  } {
    const params = this.paramsManager.getParams();
    return {
      enabled: params.guaranteedMemeTradeEnabled,
      lastSelectedToken: this.lastSelectedToken,
      lastSelectionTime: this.lastSelectionTime,
      tradeAmountUSD: params.guaranteedMemeTradeAmountUSD,
      selectionMethod: params.guaranteedMemeTokenSelectionMethod
    };
  }

  // Method to reset strategy state
  resetState(): void {
    this.lastSelectedToken = null;
    this.lastSelectionTime = 0;
    this.coinGeckoClient.clearCache();
    logger.info('🚀 Guaranteed meme strategy state reset');
  }
}