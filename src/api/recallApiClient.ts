import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../utils/logger.js';
import { Portfolio, TokenPrice, TradeRequest, TradeResult } from '../types/index.js';

export class RecallApiClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // 1 second between requests

  constructor(apiKey: string, baseUrl: string = 'https://api.sandbox.competitions.recall.network') {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 30000 // 30 second timeout
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

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('API request failed', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );

    logger.info('Recall API client initialized', { baseUrl });
  }

  async getPortfolio(): Promise<Portfolio> {
    try {
      const response = await this.client.get('/api/agent/portfolio');
      logger.info('Portfolio fetched successfully', { 
        totalValue: response.data.totalValue,
        tokenCount: response.data.tokens?.length 
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch portfolio', { error });
      throw new Error(`Failed to fetch portfolio: ${error}`);
    }
  }

  async getTokenPrice(
    tokenAddress: string, 
    chain: string = 'evm', 
    specificChain: string = 'eth'
  ): Promise<TokenPrice> {
    try {
      const params = {
        token: tokenAddress,
        chain,
        specificChain
      };

      const response = await this.client.get('/api/price', { params });
      logger.debug('Token price fetched', { tokenAddress, price: response.data.price });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch token price', { error, tokenAddress });
      throw new Error(`Failed to fetch token price for ${tokenAddress}: ${error}`);
    }
  }

  async executeTrade(tradeRequest: TradeRequest): Promise<TradeResult> {
    try {
      logger.info('Executing trade', { 
        from: tradeRequest.fromToken,
        to: tradeRequest.toToken,
        amount: tradeRequest.amount,
        reason: tradeRequest.reason,
        fromChain: tradeRequest.fromChain,
        toChain: tradeRequest.toChain
      });

      const response = await this.client.post('/api/trade/execute', tradeRequest);
      
      if (response.data.success) {
        logger.info('Trade executed successfully', { 
          tradeId: response.data.transaction?.id,
          fromAmount: response.data.transaction?.fromAmount,
          toAmount: response.data.transaction?.toAmount,
          price: response.data.transaction?.price
        });
      } else {
        logger.warn('Trade execution failed', { 
          error: response.data.error,
          tradeRequest 
        });
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to execute trade', { error, tradeRequest });
      
      // Return a failed trade result instead of throwing
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          code: error instanceof AxiosError ? error.response?.status?.toString() : undefined
        }
      };
    }
  }

  async getTradeHistory(): Promise<any> {
    try {
      const response = await this.client.get('/api/agent/trades');
      logger.info('Trade history fetched', { tradeCount: response.data.trades?.length });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch trade history', { error });
      throw new Error(`Failed to fetch trade history: ${error}`);
    }
  }

  async getLeaderboard(): Promise<any> {
    try {
      const response = await this.client.get('/api/competitions/leaderboard');
      logger.info('Leaderboard fetched successfully');
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch leaderboard', { error });
      throw new Error(`Failed to fetch leaderboard: ${error}`);
    }
  }

  async getCompetitionStatus(): Promise<any> {
    try {
      const response = await this.client.get('/api/competitions/status');
      logger.info('Competition status fetched successfully');
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch competition status', { error });
      throw new Error(`Failed to fetch competition status: ${error}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/health');
      return response.status === 200;
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }
}

export default RecallApiClient;