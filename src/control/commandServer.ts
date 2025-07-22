import express, { Express, Request, Response } from 'express';
import logger from '../utils/logger.js';
import { TradingDecision } from '../types/index.js';

interface TradingAgentInterface {
  processExternalCommand(decision: TradingDecision): Promise<void>;
  getStatus(): Promise<any>;
  pauseTrading(): Promise<void>;
  resumeTrading(): Promise<void>;
  updateStrategyParams(newParams: any): Promise<void>;
  updateRiskParams(newParams: any): Promise<void>;
  toggleLLMStrategy(enable: boolean): Promise<void>;
  setLLMObjective(objective: 'maximize_profit' | 'maximize_loss'): Promise<void>;
}

export class CommandServer {
  private app: Express;
  private agent: TradingAgentInterface;
  private port: number;
  private server: any;

  constructor(agent: TradingAgentInterface, port: number) {
    this.agent = agent;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      logger.info(`Command server request: ${req.method} ${req.path}`, {
        body: req.body,
        ip: req.ip
      });
      next();
    });
  }

  private setupRoutes(): void {
    // POST /command - Execute a manual trading decision
    this.app.post('/command', async (req: Request, res: Response) => {
      try {
        const decision = req.body as TradingDecision;
        
        // Validate the trading decision
        const validation = this.validateTradingDecision(decision);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: validation.error
          });
        }

        // Process the external command
        await this.agent.processExternalCommand(decision);

        res.json({
          success: true,
          message: 'Trading decision executed successfully',
          decision
        });

      } catch (error) {
        logger.error('Error processing external command', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to process trading decision'
        });
      }
    });

    // GET /status - Get agent status
    this.app.get('/status', async (req: Request, res: Response) => {
      try {
        const status = await this.agent.getStatus();
        res.json({
          success: true,
          status
        });
      } catch (error) {
        logger.error('Error getting agent status', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to get agent status'
        });
      }
    });

    // POST /command/pause - Pause trading
    this.app.post('/command/pause', async (req: Request, res: Response) => {
      try {
        await this.agent.pauseTrading();
        res.json({
          success: true,
          message: 'Trading paused successfully'
        });
      } catch (error) {
        logger.error('Error pausing trading', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to pause trading'
        });
      }
    });

    // POST /command/resume - Resume trading
    this.app.post('/command/resume', async (req: Request, res: Response) => {
      try {
        await this.agent.resumeTrading();
        res.json({
          success: true,
          message: 'Trading resumed successfully'
        });
      } catch (error) {
        logger.error('Error resuming trading', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to resume trading'
        });
      }
    });

    // POST /command/update-strategy-params - Update strategy parameters
    this.app.post('/command/update-strategy-params', async (req: Request, res: Response) => {
      try {
        const newParams = req.body;
        await this.agent.updateStrategyParams(newParams);
        res.json({
          success: true,
          message: 'Strategy parameters updated successfully',
          params: newParams
        });
      } catch (error) {
        logger.error('Error updating strategy parameters', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to update strategy parameters'
        });
      }
    });

    // POST /command/update-risk-params - Update risk parameters
    this.app.post('/command/update-risk-params', async (req: Request, res: Response) => {
      try {
        const newParams = req.body;
        await this.agent.updateRiskParams(newParams);
        res.json({
          success: true,
          message: 'Risk parameters updated successfully',
          params: newParams
        });
      } catch (error) {
        logger.error('Error updating risk parameters', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to update risk parameters'
        });
      }
    });

    // POST /command/force-trade - Force an immediate trade (for testing)
    this.app.post('/command/force-trade', async (req: Request, res: Response) => {
      try {
        const { fromToken, toToken, amount, reason } = req.body;
        
        const forcedDecision = {
          action: 'buy' as const,
          fromToken: fromToken || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Default to USDC
          toToken: toToken || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Default to WETH
          amount: amount || 25, // Default $25
          reason: reason || 'Manual forced trade via command server',
          confidence: 0.1
        };

        await this.agent.processExternalCommand(forcedDecision);

        res.json({
          success: true,
          message: 'Forced trade executed successfully',
          decision: forcedDecision
        });

      } catch (error) {
        logger.error('Error executing forced trade', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to execute forced trade'
        });
      }
    });

    // 🔴 POST /command/toggle-loss-strategy - THE RED BUTTON! 🔴
    this.app.post('/command/toggle-loss-strategy', async (req: Request, res: Response) => {
      try {
        const { enable } = req.body;
        
        if (typeof enable !== 'boolean') {
          return res.status(400).json({
            success: false,
            error: 'enable parameter must be a boolean (true/false)'
          });
        }

        await this.agent.toggleLossStrategy(enable);

        const message = enable 
          ? '🔴 LOSS STRATEGY ACTIVATED - PREPARE TO LOSE ALL MONEY! 🔴'
          : '✅ Loss strategy deactivated - normal trading resumed';

        res.json({
          success: true,
          message,
          lossStrategyEnabled: enable
        });

      } catch (error) {
        logger.error('Error toggling loss strategy', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to toggle loss strategy'
        });
      }
    });

    // GET /command/loss-strategy-status - Check loss strategy status
    this.app.get('/command/loss-strategy-status', async (req: Request, res: Response) => {
      try {
        const status = await this.agent.getLossStrategyStatus();
        res.json({
          success: true,
          status
        });
      } catch (error) {
        logger.error('Error getting loss strategy status', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to get loss strategy status'
        });
      }
    });

    // POST /command/toggle-llm-strategy - Toggle LLM strategy
    this.app.post('/command/toggle-llm-strategy', async (req: Request, res: Response) => {
      try {
        const { enable } = req.body;
        if (typeof enable !== 'boolean') {
          return res.status(400).json({ success: false, error: 'enable must be a boolean' });
        }
        await this.agent.toggleLLMStrategy(enable);
        res.json({
          success: true,
          message: `LLM strategy ${enable ? 'enabled' : 'disabled'}`,
          llmEnabled: enable
        });
      } catch (error) {
        logger.error('Error toggling LLM strategy', { error });
        res.status(500).json({ success: false, error: 'Failed to toggle LLM strategy' });
      }
    });

    // POST /command/set-llm-objective - Set LLM objective
    this.app.post('/command/set-llm-objective', async (req: Request, res: Response) => {
      try {
        const { objective } = req.body;
        if (!['maximize_profit', 'maximize_loss'].includes(objective)) {
          return res.status(400).json({ success: false, error: 'objective must be "maximize_profit" or "maximize_loss"' });
        }
        await this.agent.setLLMObjective(objective);
        res.json({
          success: true,
          message: `LLM objective set to ${objective}`,
          llmObjective: objective
        });
      } catch (error) {
        logger.error('Error setting LLM objective', { error });
        res.status(500).json({ success: false, error: 'Failed to set LLM objective' });
      }
    });

    // GET /command/llm-status - Get LLM strategy status
    this.app.get('/command/llm-status', async (req: Request, res: Response) => {
      const params = this.agent.getStrategyParams(); // Assuming this method exists and returns all params
      res.json({ success: true, llmEnabled: params.llmEnabled, llmObjective: params.llmObjective });
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Command server is running',
        timestamp: new Date().toISOString()
      });
    });
  }

  private validateTradingDecision(decision: any): { isValid: boolean; error?: string } {
    if (!decision) {
      return { isValid: false, error: 'Trading decision is required' };
    }

    const requiredFields = ['action', 'fromToken', 'toToken', 'amount', 'reason'];
    for (const field of requiredFields) {
      if (!decision[field]) {
        return { isValid: false, error: `Missing required field: ${field}` };
      }
    }

    if (!['buy', 'sell', 'hold'].includes(decision.action)) {
      return { isValid: false, error: 'Invalid action. Must be buy, sell, or hold' };
    }

    if (typeof decision.amount !== 'number' || decision.amount <= 0) {
      return { isValid: false, error: 'Amount must be a positive number' };
    }

    if (decision.confidence !== undefined && (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1)) {
      return { isValid: false, error: 'Confidence must be a number between 0 and 1' };
    }

    return { isValid: true };
  }

  start(): void {
    this.server = this.app.listen(this.port, () => {
      logger.info(`Command server started on port ${this.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        logger.info('Command server stopped');
      });
    }
  }
}