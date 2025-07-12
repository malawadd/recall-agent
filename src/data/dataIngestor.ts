import logger from '../utils/logger.js';
import RecallApiClient from '../api/recallApiClient.js';
import { Portfolio, MarketData, TOKENS } from '../types/index.js';

export class DataIngestor {
  private apiClient: RecallApiClient;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private cacheTimeout: number = 60000; // 1 minute cache

  constructor(apiClient: RecallApiClient) {
    this.apiClient = apiClient;
  }

  async getMarketData(): Promise<MarketData> {
    try {
      logger.info('Fetching market data...');

      // Fetch portfolio
      const portfolio = await this.apiClient.getPortfolio();

      // Fetch prices for major tokens
      const prices: Record<string, number> = {};
      const tokenAddresses = Object.values(TOKENS);

      for (const tokenAddress of tokenAddresses) {
        try {
          const cachedPrice = this.getCachedPrice(tokenAddress);
          if (cachedPrice) {
            prices[tokenAddress] = cachedPrice;
          } else {
            const priceData = await this.apiClient.getTokenPrice(tokenAddress);
            prices[tokenAddress] = priceData.price;
            this.setCachedPrice(tokenAddress, priceData.price);
          }
        } catch (error) {
          logger.warn(`Failed to fetch price for token ${tokenAddress}`, { error });
          // Use last known price or default to 0
          const cachedPrice = this.priceCache.get(tokenAddress);
          prices[tokenAddress] = cachedPrice?.price || 0;
        }
      }

      // Also get prices for tokens in portfolio that aren't in our standard list
      for (const token of portfolio.tokens) {
        if (!prices[token.token]) {
          try {
            const cachedPrice = this.getCachedPrice(token.token);
            if (cachedPrice) {
              prices[token.token] = cachedPrice;
            } else {
              const priceData = await this.apiClient.getTokenPrice(token.token);
              prices[token.token] = priceData.price;
              this.setCachedPrice(token.token, priceData.price);
            }
          } catch (error) {
            logger.warn(`Failed to fetch price for portfolio token ${token.token}`, { error });
            prices[token.token] = token.price; // Use the price from portfolio
          }
        }
      }

      const marketData: MarketData = {
        portfolio,
        prices,
        timestamp: new Date().toISOString()
      };

      logger.info('Market data fetched successfully', {
        portfolioValue: portfolio.totalValue,
        tokenCount: portfolio.tokens.length,
        priceCount: Object.keys(prices).length
      });

      return marketData;
    } catch (error) {
      logger.error('Failed to fetch market data', { error });
      throw new Error(`Failed to fetch market data: ${error}`);
    }
  }

  private getCachedPrice(tokenAddress: string): number | null {
    const cached = this.priceCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.price;
    }
    return null;
  }

  private setCachedPrice(tokenAddress: string, price: number): void {
    this.priceCache.set(tokenAddress, {
      price,
      timestamp: Date.now()
    });
  }

  async getTokenBalance(tokenAddress: string): Promise<number> {
    try {
      const portfolio = await this.apiClient.getPortfolio();
      const token = portfolio.tokens.find(t => t.token.toLowerCase() === tokenAddress.toLowerCase());
      return token?.amount || 0;
    } catch (error) {
      logger.error('Failed to get token balance', { error, tokenAddress });
      return 0;
    }
  }

  async getCurrentPrice(tokenAddress: string): Promise<number> {
    try {
      const cachedPrice = this.getCachedPrice(tokenAddress);
      if (cachedPrice) {
        return cachedPrice;
      }

      const priceData = await this.apiClient.getTokenPrice(tokenAddress);
      this.setCachedPrice(tokenAddress, priceData.price);
      return priceData.price;
    } catch (error) {
      logger.error('Failed to get current price', { error, tokenAddress });
      throw error;
    }
  }

  clearCache(): void {
    this.priceCache.clear();
    logger.info('Price cache cleared');
  }

  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.priceCache.size,
      entries: Array.from(this.priceCache.keys())
    };
  }
}

export default DataIngestor;