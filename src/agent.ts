import dotenv from 'dotenv';
import logger from './utils/logger.js';
import RecallApiClient from './api/recallApiClient.js';
import DataIngestor from './data/dataIngestor.js';
import StrategyOrchestrator from './strategy/strategyOrchestrator.js';
import { StrategyParamsManager } from './strategy/strategyParams.js';
import RiskManager from './risk/riskManager.js';
import TradingDatabase from './database/database.js';
import { CommandServer } from './control/commandServer.js';
import { AgentState, TradingDecision, TradeRequest } from './types/index.js';

// Load environment variables
dotenv.config();

export class TradingAgent {
  private apiClient: RecallApiClient;
  private dataIngestor: DataIngestor;
  private strategyOrchestrator: StrategyOrchestrator;
  private strategyParamsManager: StrategyParamsManager;
  private riskManager: RiskManager;
  private database: TradingDatabase;
  private commandServer: CommandServer;
  private agentState: AgentState;
  private isRunning: boolean = false;
  private tradeInterval: number;

  constructor() {
    // Validate required environment variables
    this.validateEnvironment();

    // Initialize components
    this.apiClient = new RecallApiClient(
      process.env.RECALL_API_KEY!,
      process.env.RECALL_API_URL
    );
    
    this.database = new TradingDatabase();
    this.dataIngestor = new DataIngestor(this.apiClient, this.database.marketData);
    this.strategyParamsManager = new StrategyParamsManager();
    this.strategyOrchestrator = new StrategyOrchestrator(this.strategyParamsManager, this.database.marketData);
    this.riskManager = new RiskManager();
    
    // Initialize command server
    const commandServerPort = parseInt(process.env.COMMAND_SERVER_PORT || '3001');
    this.commandServer = new CommandServer(this, commandServerPort);

    // Load agent state
    this.agentState = this.loadAgentState();
    
    // Set trade interval (default: 5 minutes)
    this.tradeInterval = parseInt(process.env.TRADE_INTERVAL_MS || '300000');

    logger.info('Trading agent initialized successfully', {
      agentId: this.agentState.id,
      totalTrades: this.agentState.totalTrades,
      totalPnL: this.agentState.totalPnL,
      isActive: this.agentState.isActive
    });
  }

  private validateEnvironment(): void {
    const requiredVars = ['RECALL_API_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  private loadAgentState(): AgentState {
    const state = this.database.loadAgentState();
    
    if (state) {
      logger.info('Agent state loaded from database', { stateId: state.id });
      return state;
    }

    // Create default state if none exists
    const defaultState: AgentState = {
      id: 1,
      totalTrades: 0,
      totalPnL: 0,
      dailyPnL: 0,
      lastTradeTime: new Date().toISOString(),
      riskLevel: 'medium',
      isActive: true,
      strategyParams: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.database.saveAgentState(defaultState);
    logger.info('Default agent state created');
    return defaultState;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent is already running');
      return;
    }

    logger.info('Starting trading agent...');
    this.isRunning = true;

    // Perform initial health check
    const isHealthy = await this.performHealthCheck();
    if (!isHealthy) {
      logger.error('Health check failed, stopping agent');
      this.stop();
      return;
    }

    // Start main trading loop
    this.runTradingLoop();

    // Start command server
    this.commandServer.start();
  }

  stop(): void {
    logger.info('Stopping trading agent...');
    this.isRunning = false;
    this.agentState.isActive = false;
    this.database.saveAgentState(this.agentState);
    this.commandServer.stop();
    this.database.close();
  }

  private async performHealthCheck(): Promise<boolean> {
    try {
      logger.info('Performing health check...');

      // Check API connectivity
      const isApiHealthy = await this.apiClient.healthCheck();
      if (!isApiHealthy) {
        logger.error('API health check failed');
        return false;
      }

      // Check portfolio access
      const portfolio = await this.apiClient.getPortfolio();
      if (!portfolio || !portfolio.success) {
        logger.error('Portfolio access failed');
        return false;
      }

      // Check competition status
      try {
        const competitionStatus = await this.apiClient.getCompetitionStatus();
        logger.info('Competition status', { status: competitionStatus });
      } catch (error) {
        logger.warn('Could not fetch competition status', { error });
      }

      logger.info('Health check passed', { 
        portfolioValue: portfolio.totalValue,
        tokenCount: portfolio.tokens.length 
      });
      return true;

    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  private async runTradingLoop(): Promise<void> {
    logger.info('Starting trading loop', { interval: this.tradeInterval });

    while (this.isRunning) {
      try {
        await this.executeTradingCycle();
        
        // Wait for next cycle
        await this.sleep(this.tradeInterval);
        
      } catch (error) {
        logger.error('Error in trading loop', { error });
        
        // Wait a bit before retrying to avoid rapid error loops
        await this.sleep(30000); // 30 seconds
      }
    }

    logger.info('Trading loop stopped');
  }

  private async executeTradingCycle(): Promise<void> {
    try {
      logger.info('Starting trading cycle...');

      // Check if we should stop trading due to risk conditions
      const marketData = await this.dataIngestor.getMarketData();
      
      if (this.riskManager.shouldStopTrading(this.agentState, marketData)) {
        logger.warn('Risk manager recommends stopping trading');
        this.agentState.isActive = false;
        this.database.saveAgentState(this.agentState);
        return;
      }

      // Get trading decision from strategy
      const decision = await this.strategyOrchestrator.makeDecision(marketData);
      
      if (!decision) {
        logger.info('No trading decision made this cycle');
        return;
      }

      // Validate trade with risk manager
      const validation = this.riskManager.validateTrade(decision, marketData, this.agentState);
      
      if (!validation.isValid) {
        logger.warn('Trade rejected by risk manager', { reason: validation.reason });
        return;
      }

      // Execute the trade
      await this.executeTrade(decision);

      // Update agent state
      this.agentState.totalTrades += 1;
      this.agentState.lastTradeTime = new Date().toISOString();
      this.agentState.updatedAt = new Date().toISOString();
      this.database.saveAgentState(this.agentState);

      // Record trade for frequency tracking
      this.riskManager.recordTrade(decision.amount);

      logger.info('Trading cycle completed successfully');

    } catch (error) {
      logger.error('Error in trading cycle', { error });
    }
  }

  // Method for processing external commands from the command server
  async processExternalCommand(decision: TradingDecision): Promise<void> {
    try {
      logger.info('Processing external command', { decision });

      // Get current market data for validation
      const marketData = await this.dataIngestor.getMarketData();
      
      // Validate the external command with risk manager
      const validation = this.riskManager.validateTrade(decision, marketData, this.agentState);
      
      if (!validation.isValid) {
        logger.warn('External command rejected by risk manager', { reason: validation.reason });
        throw new Error(`Trade rejected: ${validation.reason}`);
      }

      // Execute the trade
      await this.executeTrade(decision);

      // Update agent state
      this.agentState.totalTrades += 1;
      this.agentState.lastTradeTime = new Date().toISOString();
      this.agentState.updatedAt = new Date().toISOString();
      this.database.saveAgentState(this.agentState);

      // Record trade for frequency tracking
      this.riskManager.recordTrade(decision.amount);

      logger.info('External command executed successfully', { decision });

    } catch (error) {
      logger.error('Error processing external command', { error, decision });
      throw error;
    }
  }

  private async executeTrade(decision: TradingDecision): Promise<void> {
    try {
      logger.info('Executing trade', { decision });

      const tradeRequest: TradeRequest = {
        fromToken: decision.fromToken,
        toToken: decision.toToken,
        amount: decision.amount.toString(),
        reason: decision.reason
      };

      const result = await this.apiClient.executeTrade(tradeRequest);

      // Log trade to database
      this.database.logTrade(tradeRequest, result);

      if (result.success && result.transaction) {
        logger.info('Trade executed successfully', {
          tradeId: result.transaction.id,
          fromAmount: result.transaction.fromAmount,
          toAmount: result.transaction.toAmount,
          price: result.transaction.price
        });

        // Update PnL (simplified calculation)
        // In a real implementation, you'd want more sophisticated PnL tracking
        const tradeValue = result.transaction.fromAmount * result.transaction.price;
        this.agentState.totalPnL += tradeValue * 0.001; // Assume 0.1% profit for now
        this.agentState.dailyPnL += tradeValue * 0.001;

      } else {
        logger.error('Trade execution failed', { 
          error: result.error,
          tradeRequest 
        });
      }

    } catch (error) {
      logger.error('Error executing trade', { error, decision });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public methods for monitoring and control
  async getStatus(): Promise<any> {
    try {
      const marketData = await this.dataIngestor.getMarketData();
      const riskMetrics = this.riskManager.getRiskMetrics(this.agentState, marketData);
      const performanceMetrics = this.database.getPerformanceMetrics();

      return {
        agent: {
          isRunning: this.isRunning,
          state: this.agentState
        },
        portfolio: marketData.portfolio,
        risk: riskMetrics,
        performance: performanceMetrics,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting agent status', { error });
      return { error: 'Failed to get status' };
    }
  }

  async pauseTrading(): Promise<void> {
    logger.info('Pausing trading...');
    this.agentState.isActive = false;
    this.database.saveAgentState(this.agentState);
  }

  async resumeTrading(): Promise<void> {
    logger.info('Resuming trading...');
    this.agentState.isActive = true;
    this.database.saveAgentState(this.agentState);
  }

  getTradeHistory(limit: number = 50): any[] {
    return this.database.getTradeHistory(limit);
  }
}

// Main execution
async function main() {
  const agent = new TradingAgent();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    agent.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    agent.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    agent.stop();
    process.exit(1);
  });

  try {
    await agent.start();
  } catch (error) {
    logger.error('Failed to start agent', { error });
    process.exit(1);
  }
}

// Run the agent if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Fatal error in main', { error });
    process.exit(1);
  });
}

export default TradingAgent;