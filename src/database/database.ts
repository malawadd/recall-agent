import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { TradeResult, AgentState } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TradingDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(__dirname, '../../trading_agent.db');
    this.db = new Database(dbPath || process.env.DATABASE_PATH || defaultPath);
    this.initializeTables();
    logger.info('Database initialized successfully');
  }

  private initializeTables(): void {
    // Create trades table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT UNIQUE,
        timestamp TEXT NOT NULL,
        from_token TEXT NOT NULL,
        to_token TEXT NOT NULL,
        from_amount REAL NOT NULL,
        to_amount REAL NOT NULL,
        price REAL NOT NULL,
        success BOOLEAN NOT NULL,
        reason TEXT,
        team_id TEXT,
        competition_id TEXT,
        from_chain TEXT,
        to_chain TEXT,
        pnl REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create agent_state table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_trades INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        daily_pnl REAL DEFAULT 0,
        last_trade_time TEXT,
        risk_level TEXT DEFAULT 'medium',
        is_active BOOLEAN DEFAULT 1,
        strategy_params TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create market_data table for historical tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        token_address TEXT NOT NULL,
        price REAL NOT NULL,
        portfolio_value REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create performance_metrics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        total_value REAL NOT NULL,
        daily_return REAL DEFAULT 0,
        total_return REAL DEFAULT 0,
        trades_count INTEGER DEFAULT 0,
        win_rate REAL DEFAULT 0,
        sharpe_ratio REAL DEFAULT 0,
        max_drawdown REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize agent state if it doesn't exist
    const existingState = this.db.prepare('SELECT COUNT(*) as count FROM agent_state').get() as { count: number };
    if (existingState.count === 0) {
      this.db.prepare(`
        INSERT INTO agent_state (total_trades, total_pnl, daily_pnl, risk_level, is_active, strategy_params)
        VALUES (0, 0, 0, 'medium', 1, '{}')
      `).run();
      logger.info('Initial agent state created');
    }
  }

  logTrade(tradeDetails: any, result: TradeResult): void {
    try {
      if (result.success && result.transaction) {
        const stmt = this.db.prepare(`
          INSERT INTO trades (
            trade_id, timestamp, from_token, to_token, from_amount, to_amount,
            price, success, reason, team_id, competition_id, from_chain, to_chain
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          result.transaction.id,
          result.transaction.timestamp,
          result.transaction.fromToken,
          result.transaction.toToken,
          result.transaction.fromAmount,
          result.transaction.toAmount,
          result.transaction.price,
          result.transaction.success ? 1 : 0,
          tradeDetails.reason,
          result.transaction.teamId,
          result.transaction.competitionId,
          result.transaction.fromChain,
          result.transaction.toChain
        );

        logger.info('Trade logged successfully', { tradeId: result.transaction.id });
      } else {
        logger.error('Failed to log trade - no transaction data', { result });
      }
    } catch (error) {
      logger.error('Error logging trade to database', { error, tradeDetails, result });
    }
  }

  saveAgentState(state: Partial<AgentState>): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE agent_state 
        SET total_trades = ?, total_pnl = ?, daily_pnl = ?, last_trade_time = ?,
            risk_level = ?, is_active = ?, strategy_params = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);

      stmt.run(
        state.totalTrades || 0,
        state.totalPnL || 0,
        state.dailyPnL || 0,
        state.lastTradeTime || new Date().toISOString(),
        state.riskLevel || 'medium',
        state.isActive ? 1 : 0,
        JSON.stringify(state.strategyParams || {})
      );

      logger.info('Agent state saved successfully');
    } catch (error) {
      logger.error('Error saving agent state', { error, state });
    }
  }

  loadAgentState(): AgentState | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM agent_state WHERE id = 1');
      const row = stmt.get() as any;

      if (row) {
        return {
          id: row.id,
          totalTrades: row.total_trades,
          totalPnL: row.total_pnl,
          dailyPnL: row.daily_pnl,
          lastTradeTime: row.last_trade_time,
          riskLevel: row.risk_level,
          isActive: Boolean(row.is_active),
          strategyParams: JSON.parse(row.strategy_params || '{}'),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }
      return null;
    } catch (error) {
      logger.error('Error loading agent state', { error });
      return null;
    }
  }

  saveMarketData(timestamp: string, tokenAddress: string, price: number, portfolioValue?: number): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO market_data (timestamp, token_address, price, portfolio_value)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(timestamp, tokenAddress, price, portfolioValue);
    } catch (error) {
      logger.error('Error saving market data', { error });
    }
  }

  getTradeHistory(limit: number = 100): any[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?');
      return stmt.all(limit);
    } catch (error) {
      logger.error('Error fetching trade history', { error });
      return [];
    }
  }

  getPerformanceMetrics(): any {
    try {
      const totalTrades = this.db.prepare('SELECT COUNT(*) as count FROM trades WHERE success = 1').get() as { count: number };
      const totalPnL = this.db.prepare('SELECT SUM(pnl) as total FROM trades WHERE success = 1').get() as { total: number };
      const winRate = this.db.prepare(`
        SELECT 
          (COUNT(CASE WHEN pnl > 0 THEN 1 END) * 100.0 / COUNT(*)) as win_rate 
        FROM trades 
        WHERE success = 1 AND pnl IS NOT NULL
      `).get() as { win_rate: number };

      return {
        totalTrades: totalTrades.count,
        totalPnL: totalPnL.total || 0,
        winRate: winRate.win_rate || 0
      };
    } catch (error) {
      logger.error('Error calculating performance metrics', { error });
      return { totalTrades: 0, totalPnL: 0, winRate: 0 };
    }
  }

  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }
}

export default TradingDatabase;