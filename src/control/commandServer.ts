import express, { Express, Request, Response } from 'express';
import logger from '../utils/logger.js';
import { TradingDecision } from '../types/index.js';

interface TradingAgentInterface {
  processExternalCommand(decision: TradingDecision): Promise<void>;
  getStatus(): Promise<any>;
  pauseTrading(): Promise<void>;
  resumeTrading(): Promise<void>;
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