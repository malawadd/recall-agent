import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger.js';

export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number;
  price_change_percentage_1h: number;
  total_volume: number;
  platforms: {
    ethereum?: string;
    [key: string]: string | undefined;
  };
}

export interface TokenCandidate {
  contractAddress: string;
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  priceChange24h: number;
  priceChange1h: number;
  volume: number;
}

export class CoinGeckoClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1100; // 1.1 seconds to respect rate limits
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout: number = 300000; // 5 minutes cache

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'x-cg-demo-api-key': 'CG-4yxcC5uYeMzupnWtbw9RsiUC',
        'User-Agent': 'RecallTradingAgent/1.0'
      }
    });

    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minRequestInterval) {
        const delay = this.minRequestInterval - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      this.lastRequestTime = Date.now();
      return config;
    });

    logger.info('CoinGecko client initialized');
  }

  async getTopLosingTokens(
    minMarketCapUSD: number = 100_000_000,
    limit: number = 100
  ): Promise<TokenCandidate[]> {
    try {
      const cacheKey = `top_losing_${minMarketCapUSD}_${limit}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        logger.debug('Using cached CoinGecko data for top losing tokens');
        return cached;
      }

      logger.info('Fetching top losing tokens from CoinGecko...', { minMarketCapUSD, limit });

      const response = await this.client.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          order: 'price_change_percentage_24h_asc', // Ascending = most negative first
          per_page: limit,
          page: 1,
          sparkline: false,
          price_change_percentage: '1h,24h',
          include_platform: true
        }
      });

      const marketData: CoinGeckoMarketData[] = response.data;

      // Filter and transform the data
      const tokenCandidates: TokenCandidate[] = marketData
        .filter(coin => {
          // Must have Ethereum contract address
          if (!coin.platforms?.ethereum) return false;
          
          // Must meet minimum market cap
          if (coin.market_cap < minMarketCapUSD) return false;
          
          // Must have negative 24h change (losing money)
          if (coin.price_change_percentage_24h >= 0) return false;
          
          // Must have reasonable volume (liquidity)
          if (coin.total_volume < 1_000_000) return false;
          
          return true;
        })
        .map(coin => ({
          contractAddress: coin.platforms.ethereum!,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          currentPrice: coin.current_price,
          marketCap: coin.market_cap,
          priceChange24h: coin.price_change_percentage_24h,
          priceChange1h: coin.price_change_percentage_1h || 0,
          volume: coin.total_volume
        }))
        .sort((a, b) => a.priceChange24h - b.priceChange24h); // Most negative first

      this.setCachedData(cacheKey, tokenCandidates);

      logger.info('Top losing tokens fetched successfully', {
        totalFound: tokenCandidates.length,
        topLoser: tokenCandidates[0] ? {
          symbol: tokenCandidates[0].symbol,
          change24h: tokenCandidates[0].priceChange24h.toFixed(2) + '%'
        } : null
      });

      return tokenCandidates;

    } catch (error) {
      logger.error('Failed to fetch top losing tokens from CoinGecko', { error });
      return [];
    }
  }

  async getSpecificTokenData(contractAddresses: string[]): Promise<TokenCandidate[]> {
    try {
      const cacheKey = `specific_tokens_${contractAddresses.join(',')}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        logger.debug('Using cached CoinGecko data for specific tokens');
        return cached;
      }

      logger.info('Fetching specific token data from CoinGecko...', { 
        tokenCount: contractAddresses.length 
      });

      // CoinGecko allows querying by contract address
      const addressList = contractAddresses.join(',');
      
      const response = await this.client.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: addressList,
          order: 'price_change_percentage_24h_asc',
          per_page: contractAddresses.length,
          page: 1,
          sparkline: false,
          price_change_percentage: '1h,24h',
          include_platform: true
        }
      });

      const marketData: CoinGeckoMarketData[] = response.data;

      const tokenCandidates: TokenCandidate[] = marketData
        .filter(coin => coin.platforms?.ethereum)
        .map(coin => ({
          contractAddress: coin.platforms.ethereum!,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          currentPrice: coin.current_price,
          marketCap: coin.market_cap,
          priceChange24h: coin.price_change_percentage_24h,
          priceChange1h: coin.price_change_percentage_1h || 0,
          volume: coin.total_volume
        }));

      this.setCachedData(cacheKey, tokenCandidates);

      logger.info('Specific token data fetched successfully', {
        tokensFound: tokenCandidates.length
      });

      return tokenCandidates;

    } catch (error) {
      logger.error('Failed to fetch specific token data from CoinGecko', { error });
      return [];
    }
  }

  async findBestLosingToken(
    minMarketCapUSD: number = 100_000_000,
    selectionMethod: 'most_negative_change' | 'highest_volatility' = 'most_negative_change'
  ): Promise<TokenCandidate | null> {
    try {
      const losingTokens = await this.getTopLosingTokens(minMarketCapUSD, 50);
      
      if (losingTokens.length === 0) {
        logger.warn('No losing tokens found matching criteria');
        return null;
      }

      let bestToken: TokenCandidate;

      if (selectionMethod === 'most_negative_change') {
        // Already sorted by most negative change
        bestToken = losingTokens[0];
      } else {
        // Calculate volatility as combination of 1h and 24h changes
        bestToken = losingTokens.reduce((best, current) => {
          const currentVolatility = Math.abs(current.priceChange1h) + Math.abs(current.priceChange24h);
          const bestVolatility = Math.abs(best.priceChange1h) + Math.abs(best.priceChange24h);
          return currentVolatility > bestVolatility ? current : best;
        });
      }

      logger.info('Best losing token identified', {
        symbol: bestToken.symbol,
        contractAddress: bestToken.contractAddress,
        priceChange24h: bestToken.priceChange24h.toFixed(2) + '%',
        priceChange1h: bestToken.priceChange1h.toFixed(2) + '%',
        marketCap: (bestToken.marketCap / 1_000_000).toFixed(0) + 'M',
        selectionMethod
      });

      return bestToken;

    } catch (error) {
      logger.error('Error finding best losing token', { error });
      return null;
    }
  }

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('CoinGecko cache cleared');
  }


async getTopSolanaMemeTokens(limit: number = 50): Promise<TokenCandidate[]> {
  try {
    const cacheKey = `top_solana_meme_${limit}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.debug('Using cached CoinGecko data for top Solana meme tokens');
      return cached;
    }

    logger.info('Fetching top Solana meme tokens from CoinGecko...', { limit });

    const response = await this.client.get('/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'volume_desc', // Order by volume to get actively traded tokens
        per_page: limit * 3, // Get more to filter down
        page: 1,
        sparkline: false,
        price_change_percentage: '1h,24h',
        include_platform: true
      }
    });

    const marketData: CoinGeckoMarketData[] = response.data;

    // Major Solana ecosystem tokens to exclude (not meme tokens)
    const excludedTokens = new Set([
      'solana', 'serum', 'raydium', 'orca', 'marinade', 'jito-governance-token',
      'jupiter-exchange-solana', 'pyth-network', 'render-token', 'helium',
      'bonk', 'dogwifcoin' // These are already established meme tokens
    ]);

    // Filter and transform the data for Solana meme tokens
    const tokenCandidates: TokenCandidate[] = marketData
      .filter(coin => {
        // Must have Solana contract address
        if (!coin.platforms?.solana) return false;
        
        // Exclude major ecosystem tokens
        if (excludedTokens.has(coin.id)) return false;
        
        // Meme token characteristics: market cap between $1M - $1B
        if (coin.market_cap < 1_000_000 || coin.market_cap > 1_000_000_000) return false;
        
        // Must have reasonable volume (liquidity for trading)
        if (coin.total_volume < 100_000) return false;
        
        // High volatility indicator (combined 1h + 24h changes > 5%)
        const totalVolatility = Math.abs(coin.price_change_percentage_1h || 0) + 
                               Math.abs(coin.price_change_percentage_24h || 0);
        if (totalVolatility < 5) return false;
        
        return true;
      })
      .map(coin => ({
        contractAddress: coin.platforms.solana!,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        currentPrice: coin.current_price,
        marketCap: coin.market_cap,
        priceChange24h: coin.price_change_percentage_24h,
        priceChange1h: coin.price_change_percentage_1h || 0,
        volume: coin.total_volume
      }))
      .sort((a, b) => b.volume - a.volume) // Sort by volume (most liquid first)
      .slice(0, limit); // Take only the requested limit

    this.setCachedData(cacheKey, tokenCandidates);

    logger.info('Top Solana meme tokens fetched successfully', {
      totalFound: tokenCandidates.length,
      topToken: tokenCandidates[0] ? {
        symbol: tokenCandidates[0].symbol,
        marketCap: (tokenCandidates[0].marketCap / 1_000_000).toFixed(1) + 'M',
        volume: (tokenCandidates[0].volume / 1_000_000).toFixed(1) + 'M'
      } : null
    });

    return tokenCandidates;

  } catch (error) {
    logger.error('Failed to fetch top Solana meme tokens from CoinGecko', { error });
    return [];
  }
}

async findBestSolanaMemeToken(
  selectionMethod: 'random_top_solana_meme' | 'most_negative_solana_change' | 'specific_solana_token',
  specificTokenAddress?: string
): Promise<TokenCandidate | null> {
  try {
    if (selectionMethod === 'specific_solana_token' && specificTokenAddress) {
      // Try to get data for the specific token
      const specificTokens = await this.getSpecificTokenData([specificTokenAddress]);
      if (specificTokens.length > 0) {
        return specificTokens[0];
      }
      logger.warn('Specific Solana token not found, falling back to random selection');
    }

    if (selectionMethod === 'most_negative_solana_change') {
      // Get losing tokens and filter for Solana
      const losingTokens = await this.getTopLosingTokens(50_000_000, 100);
      const solanaLosingTokens = losingTokens.filter(token => 
        token.contractAddress && token.contractAddress.length < 50 // Solana addresses are shorter
      );
      
      if (solanaLosingTokens.length > 0) {
        return solanaLosingTokens[0]; // Most negative change
      }
    }

    // Default: random_top_solana_meme or fallback
    const memeTokens = await this.getTopSolanaMemeTokens(20);
    if (memeTokens.length === 0) {
      logger.warn('No Solana meme tokens found');
      return null;
    }

    // Select a random token from the top candidates
    const randomIndex = Math.floor(Math.random() * memeTokens.length);
    const selectedToken = memeTokens[randomIndex];

    logger.info('Best Solana meme token selected', {
      symbol: selectedToken.symbol,
      contractAddress: selectedToken.contractAddress,
      marketCap: (selectedToken.marketCap / 1_000_000).toFixed(1) + 'M',
      volume: (selectedToken.volume / 1_000_000).toFixed(1) + 'M',
      selectionMethod
    });

    return selectedToken;

  } catch (error) {
    logger.error('Error finding best Solana meme token', { error });
    return null;
  }
}
}
export default CoinGeckoClient;