import logger from '../utils/logger.js';
import RecallApiClient from '../api/recallApiClient.js';
import CoinGeckoClient from '../api/coinGeckoClient.js';
import { Portfolio, MarketData, TOKENS } from '../types/index.js';
import { MarketDataRepository } from '../database/marketDataRepository.js';

export class DataIngestor {
  private apiClient: RecallApiClient;
  private coinGeckoClient: CoinGeckoClient;
  private marketDataRepository: MarketDataRepository;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private cacheTimeout: number = 60000; // 1 minute cache

  constructor(apiClient: RecallApiClient, marketDataRepository: MarketDataRepository) {
    this.apiClient = apiClient;
    this.coinGeckoClient = new CoinGeckoClient();
    this.marketDataRepository = marketDataRepository;
  }

  async getMarketData(): Promise<MarketData> {
    try {
      logger.info('Fetching market data...');

      // Fetch portfolio
      const portfolio = await this.apiClient.getPortfolio();

      // Fetch prices for major tokens and portfolio tokens concurrently
      const prices: Record<string, number> = {};
      const tokenAddresses = new Set([
        ...Object.values(TOKENS),
        ...portfolio.tokens.map(t => t.token)
      ]);

      // Prepare fetches for tokens that are not cached
      const fetchPromises: Promise<void>[] = [];
      for (const tokenAddress of tokenAddresses) {
        const cachedPrice = this.getCachedPrice(tokenAddress);
        if (cachedPrice) {
          prices[tokenAddress] = cachedPrice;
        } else {
          fetchPromises.push(
            this.apiClient.getTokenPrice(tokenAddress)
              .then(priceData => {
                prices[tokenAddress] = priceData.price;
                this.setCachedPrice(tokenAddress, priceData.price);
              })
              .catch(error => {
                logger.warn(`Failed to fetch price for token ${tokenAddress}`, { error });
                // Use last known price or default to 0
                const cached = this.priceCache.get(tokenAddress);
                prices[tokenAddress] = cached?.price || 0;
              })
          );
        }
      }
      await Promise.all(fetchPromises);

      // For portfolio tokens, if price is still missing, use the price from portfolio
      for (const token of portfolio.tokens) {
        if (!prices[token.token]) {
          prices[token.token] = token.price;
        }
      }

      const marketData: MarketData = {
        portfolio,
        prices,
        externalMarketData: {
          coinGecko: {
            lastUpdated: new Date().toISOString(),
            // External data will be fetched on-demand by strategies
            available: true
          }
        },
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