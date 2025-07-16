import Database from 'better-sqlite3';
import logger from '../utils/logger.js';

export interface MarketDataPoint {
  timestamp: string;
  price: number;
}

export class MarketDataRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeMarketDataTable();
    logger.info('Market data repository initialized');
  }

  private initializeMarketDataTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        token_address TEXT NOT NULL,
        price REAL NOT NULL,
        portfolio_value REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(timestamp, token_address)
      )
    `);

    // Create index for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_market_data_token_timestamp 
      ON market_data(token_address, timestamp DESC)
    `);
  }

  saveMarketData(timestamp: string, tokenAddress: string, price: number, portfolioValue?: number): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO market_data (timestamp, token_address, price, portfolio_value)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(timestamp, tokenAddress, price, portfolioValue);
      
      logger.debug('Market data saved', { 
        timestamp, 
        tokenAddress: tokenAddress.slice(0, 8) + '...', 
        price 
      });
    } catch (error) {
      logger.error('Error saving market data', { error, tokenAddress, price });
    }
  }

  getMarketDataByToken(tokenAddress: string, limit: number): MarketDataPoint[] {
    try {
      const stmt = this.db.prepare(`
        SELECT timestamp, price 
        FROM market_data 
        WHERE token_address = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `);
      
      const rows = stmt.all(tokenAddress, limit) as { timestamp: string; price: number }[];
      
      // Return in chronological order (oldest first) for SMA calculations
      return rows.reverse();
    } catch (error) {
      logger.error('Error fetching market data', { error, tokenAddress, limit });
      return [];
    }
  }

  getLatestPrice(tokenAddress: string): number | null {
    try {
      const stmt = this.db.prepare(`
        SELECT price 
        FROM market_data 
        WHERE token_address = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);
      
      const row = stmt.get(tokenAddress) as { price: number } | undefined;
      return row?.price || null;
    } catch (error) {
      logger.error('Error fetching latest price', { error, tokenAddress });
      return null;
    }
  }

  cleanOldData(daysToKeep: number = 30): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const stmt = this.db.prepare(`
        DELETE FROM market_data 
        WHERE created_at < ?
      `);
      
      const result = stmt.run(cutoffDate.toISOString());
      logger.info('Old market data cleaned', { deletedRows: result.changes });
    } catch (error) {
      logger.error('Error cleaning old market data', { error });
    }
  }
}