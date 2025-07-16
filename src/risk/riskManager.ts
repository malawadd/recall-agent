import logger from '../utils/logger.js';
import { TradingDecision, MarketData, AgentState } from '../types/index.js';

export class RiskManager {
  private riskParams: {
    maxDailyLoss: number;
    maxPositionSize: number;
    minTradeAmount: number;
    maxTradesPerHour: number;
    stopLossThreshold: number;
    maxDrawdown: number;
  };

  private tradeHistory: Array<{ timestamp: number; amount: number }> = [];

  constructor() {
    this.riskParams = {
      maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS_PERCENT || '5') / 100,
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_PERCENT || '20') / 100,
      minTradeAmount: parseFloat(process.env.MIN_TRADE_AMOUNT_USDC || '10'),
      maxTradesPerHour: 10,
      stopLossThreshold: 0.02, // 2% stop loss
      maxDrawdown: 0.15 // 15% max drawdown
    };

    logger.info('Risk manager initialized', { riskParams: this.riskParams });
  }

  validateTrade(
    decision: TradingDecision,
    marketData: MarketData,
    agentState: AgentState
  ): { isValid: boolean; reason?: string } {
    
    // Check if agent is active
    if (!agentState.isActive) {
      return { isValid: false, reason: 'Agent is not active' };
    }

    // Check daily loss limit
    if (this.isDailyLossExceeded(agentState)) {
      return { isValid: false, reason: 'Daily loss limit exceeded' };
    }

    // Check minimum trade amount
    if (!this.isTradeAmountValid(decision, marketData)) {
      return { isValid: false, reason: 'Trade amount below minimum threshold' };
    }

    // Check position size limits
    if (!this.isPositionSizeValid(decision, marketData)) {
      return { isValid: false, reason: 'Trade would exceed maximum position size' };
    }

    // Check sufficient balance
    if (!this.hasSufficientBalance(decision, marketData)) {
      return { isValid: false, reason: 'Insufficient balance for trade' };
    }

    // Check trade frequency
    if (!this.isTradeFrequencyValid()) {
      return { isValid: false, reason: 'Trade frequency limit exceeded' };
    }

    // Check maximum drawdown
    if (this.isMaxDrawdownExceeded(agentState, marketData)) {
      return { isValid: false, reason: 'Maximum drawdown threshold reached' };
    }

    logger.info('Trade validation passed', { 
      action: decision.action,
      amount: decision.amount,
      confidence: decision.confidence
    });

    return { isValid: true };
  }

  private isDailyLossExceeded(agentState: AgentState): boolean {
    const dailyLossThreshold = this.riskParams.maxDailyLoss;
    const currentDailyLoss = Math.abs(agentState.dailyPnL) / 100; // Assuming dailyPnL is in percentage

    if (agentState.dailyPnL < 0 && currentDailyLoss > dailyLossThreshold) {
      logger.warn('Daily loss limit exceeded', {
        currentLoss: currentDailyLoss,
        maxLoss: dailyLossThreshold
      });
      return true;
    }

    return false;
  }

  private isTradeAmountValid(decision: TradingDecision, marketData: MarketData): boolean {
    const { amount } = decision;
    const { prices } = marketData;

    let tradeValueUSD: number;

    if (decision.action === 'buy') {
      // For buy orders, amount is typically in the 'from' token (usually USDC)
      tradeValueUSD = amount;
    } else {
      // For sell orders, amount is in the 'from' token, convert to USD
      const tokenPrice = prices[decision.fromToken];
      tradeValueUSD = amount * tokenPrice;
    }

    const isValid = tradeValueUSD >= this.riskParams.minTradeAmount;
    
    if (!isValid) {
      logger.warn('Trade amount below minimum', {
        tradeValue: tradeValueUSD,
        minAmount: this.riskParams.minTradeAmount
      });
    }

    return isValid;
  }

  private isPositionSizeValid(decision: TradingDecision, marketData: MarketData): boolean {
    const { portfolio, prices } = marketData;
    const totalValue = portfolio.totalValue;
    const maxPositionValue = totalValue * this.riskParams.maxPositionSize;

    let tradeValue: number;
    
    if (decision.action === 'buy') {
      tradeValue = decision.amount; // Amount in USDC for buy orders
    } else {
      const tokenPrice = prices[decision.fromToken];
      tradeValue = decision.amount * tokenPrice;
    }

    // Check if this trade would create a position larger than allowed
    const targetToken = decision.action === 'buy' ? decision.toToken : decision.fromToken;
    const currentTokenValue = portfolio.tokens.find(t => t.token === targetToken)?.value || 0;
    
    let newPositionValue: number;
    if (decision.action === 'buy') {
      newPositionValue = currentTokenValue + tradeValue;
    } else {
      newPositionValue = currentTokenValue - tradeValue;
    }

    const isValid = newPositionValue <= maxPositionValue;
    
    if (!isValid) {
      logger.warn('Position size would exceed limit', {
        newPositionValue,
        maxPositionValue,
        currentValue: currentTokenValue
      });
    }

    return isValid;
  }

  private hasSufficientBalance(decision: TradingDecision, marketData: MarketData): boolean {
    const { portfolio } = marketData;
    const fromToken = portfolio.tokens.find(t => t.token === decision.fromToken);

    if (!fromToken) {
      logger.warn('From token not found in portfolio', { token: decision.fromToken });
      return false;
    }

    const requiredAmount = decision.amount;
    const availableAmount = fromToken.amount;

    // Add a small buffer (1%) to account for price movements and fees
    const buffer = 0.01;
    const isValid = availableAmount >= requiredAmount * (1 + buffer);

    if (!isValid) {
      logger.warn('Insufficient balance for trade', {
        required: requiredAmount,
        available: availableAmount,
        token: decision.fromToken
      });
    }

    return isValid;
  }

  private isTradeFrequencyValid(): boolean {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Remove trades older than 1 hour
    this.tradeHistory = this.tradeHistory.filter(trade => trade.timestamp > oneHourAgo);

    const recentTradesCount = this.tradeHistory.length;
    const isValid = recentTradesCount < this.riskParams.maxTradesPerHour;

    if (!isValid) {
      logger.warn('Trade frequency limit exceeded', {
        recentTrades: recentTradesCount,
        maxTrades: this.riskParams.maxTradesPerHour
      });
    }

    return isValid;
  }

  private isMaxDrawdownExceeded(agentState: AgentState, marketData: MarketData): boolean {
    // Simple drawdown check based on total PnL
    const currentValue = marketData.portfolio.totalValue;
    const initialValue = 10000; // Assuming starting value, should be configurable
    const currentDrawdown = (initialValue - currentValue) / initialValue;

    const isExceeded = currentDrawdown > this.riskParams.maxDrawdown;

    if (isExceeded) {
      logger.warn('Maximum drawdown exceeded', {
        currentDrawdown,
        maxDrawdown: this.riskParams.maxDrawdown,
        currentValue,
        initialValue
      });
    }

    return isExceeded;
  }

  recordTrade(amount: number): void {
    this.tradeHistory.push({
      timestamp: Date.now(),
      amount
    });

    logger.debug('Trade recorded for frequency tracking', { 
      amount,
      recentTradesCount: this.tradeHistory.length 
    });
  }

  shouldStopTrading(agentState: AgentState, marketData: MarketData): boolean {
    return (
      !agentState.isActive ||
      this.isDailyLossExceeded(agentState) ||
      this.isMaxDrawdownExceeded(agentState, marketData)
    );
  }

  updateRiskParams(newParams: Partial<typeof this.riskParams>): void {
    this.riskParams = { ...this.riskParams, ...newParams };
    logger.info('Risk parameters updated', { newParams });
  }

  updateMaxPositionSize(newMax: number): void {
    this.riskParams.maxPositionSize = newMax;
    logger.info('Max position size updated', { newMaxPositionSize: newMax });
  }

  getRiskParams(): typeof this.riskParams {
    return { ...this.riskParams };
  }

  getRiskMetrics(agentState: AgentState, marketData: MarketData): any {
    return {
      dailyPnL: agentState.dailyPnL,
      totalPnL: agentState.totalPnL,
      currentValue: marketData.portfolio.totalValue,
      recentTradesCount: this.tradeHistory.length,
      isActive: agentState.isActive,
      riskLevel: agentState.riskLevel
    };
  }
}

export default RiskManager;