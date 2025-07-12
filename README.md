# Recall Trading Agent

A sophisticated and resilient crypto trading agent built for the Recall Network's 7-day trading competition. This agent implements advanced trading strategies, comprehensive risk management, and robust error handling to compete effectively in the competition environment.

## Features

### 🎯 Trading Strategies
- **Portfolio Rebalancing**: Maintains target allocations across USDC, WETH, and WBTC
- **Momentum Trading**: Identifies and capitalizes on market trends
- **Risk-Adjusted Position Sizing**: Dynamic position sizing based on volatility and risk parameters
- **Extensible Strategy Framework**: Easy to add new strategies like Mean Reversion, Trend Following, etc.

### 🛡️ Risk Management
- **Daily Loss Limits**: Automatic trading halt if daily losses exceed threshold
- **Position Size Controls**: Maximum position size limits per asset
- **Trade Frequency Limits**: Prevents over-trading with configurable limits
- **Drawdown Protection**: Stops trading if maximum drawdown is reached
- **Balance Validation**: Ensures sufficient funds before executing trades

### 📊 Data Management
- **Real-time Market Data**: Fetches live prices and portfolio data from Recall API
- **Price Caching**: Intelligent caching to reduce API calls and improve performance
- **SQLite Persistence**: Local database for trade logs, agent state, and performance metrics
- **Historical Analysis**: Tracks performance metrics and trade history

### 🔧 Architecture
- **Modular Design**: Clean separation of concerns across layers
- **Error Resilience**: Comprehensive error handling and recovery mechanisms
- **Configurable Parameters**: Environment-based configuration for easy tuning
- **Logging & Monitoring**: Structured logging with multiple levels and outputs

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Recall Network API key

### Installation

1. **Clone and setup the project:**
```bash
git clone <repository-url>
cd recall-trading-agent
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Required environment variables:**
```env
RECALL_API_KEY=your_api_key_here
RECALL_API_URL=https://api.sandbox.competitions.recall.network
```

4. **Build and run:**
```bash
npm run build
npm start

# Or for development:
npm run dev
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RECALL_API_KEY` | - | Your Recall Network API key (required) |
| `RECALL_API_URL` | sandbox URL | API endpoint URL |
| `TRADE_INTERVAL_MS` | 300000 | Trading cycle interval (5 minutes) |
| `MAX_DAILY_LOSS_PERCENT` | 5 | Maximum daily loss percentage |
| `MIN_TRADE_AMOUNT_USDC` | 10 | Minimum trade amount in USDC |
| `MAX_POSITION_SIZE_PERCENT` | 20 | Maximum position size percentage |
| `LOG_LEVEL` | info | Logging level (debug, info, warn, error) |

### Strategy Configuration

The agent uses a portfolio rebalancing strategy with these default allocations:
- **USDC**: 40% (stable base)
- **WETH**: 35% (main crypto exposure) 
- **WBTC**: 25% (diversification)

Rebalancing triggers when any asset deviates more than 5% from target allocation.

## Architecture Overview

```
src/
├── agent.ts              # Main agent orchestration
├── api/
│   └── recallApiClient.ts # Recall Network API client
├── data/
│   └── dataIngestor.ts    # Market data fetching and caching
├── strategy/
│   └── strategy.ts        # Trading strategy implementation
├── risk/
│   └── riskManager.ts     # Risk management and validation
├── database/
│   └── database.ts        # SQLite persistence layer
├── types/
│   └── index.ts           # TypeScript type definitions
└── utils/
    └── logger.ts          # Structured logging
```

### Key Components

1. **TradingAgent**: Main orchestrator that coordinates all components
2. **RecallApiClient**: Handles all API interactions with rate limiting and error handling
3. **DataIngestor**: Fetches and caches market data with intelligent caching
4. **TradingStrategy**: Implements trading logic and decision making
5. **RiskManager**: Validates trades and enforces risk parameters
6. **TradingDatabase**: Persists trade logs, agent state, and performance metrics

## Trading Flow

1. **Data Collection**: Fetch portfolio and market prices
2. **Strategy Analysis**: Analyze market data and generate trading decisions
3. **Risk Validation**: Validate trades against risk parameters
4. **Trade Execution**: Execute approved trades via Recall API
5. **Persistence**: Log trades and update agent state
6. **Monitoring**: Track performance and risk metrics

## Monitoring & Debugging

### Logs
- **Console Output**: Real-time trading activity and status
- **File Logs**: Detailed logs in `logs/` directory
- **Error Logs**: Separate error log file for debugging

### Database Tables
- **trades**: Complete trade history with results
- **agent_state**: Current agent configuration and state
- **market_data**: Historical price and portfolio data
- **performance_metrics**: Daily performance tracking

### Status Monitoring
The agent provides real-time status information including:
- Current portfolio value and allocations
- Recent trade history and performance
- Risk metrics and limits
- System health and connectivity

## Extending the Agent

### Adding New Strategies

1. **Implement strategy logic** in `src/strategy/strategy.ts`
2. **Add strategy parameters** to configuration
3. **Update decision logic** in `makeDecision()` method

Example strategy addition:
```typescript
private checkMeanReversionStrategy(marketData: MarketData): TradingDecision | null {
  // Implement mean reversion logic
  // Return trading decision or null
}
```

### Adding New Risk Controls

1. **Add risk parameters** to `RiskManager` constructor
2. **Implement validation logic** in `validateTrade()` method
3. **Add monitoring** in `shouldStopTrading()` method

### Adding New Data Sources

1. **Extend DataIngestor** with new data fetching methods
2. **Update MarketData interface** to include new data
3. **Modify strategy logic** to use new data sources

## Production Deployment

### Environment Setup
1. **Use production API URL**: `https://api.competitions.recall.network`
2. **Configure appropriate risk parameters** for live trading
3. **Set up monitoring and alerting** for production environment
4. **Implement backup and recovery procedures**

### Monitoring
- Monitor log files for errors and warnings
- Track performance metrics and risk exposure
- Set up alerts for critical events (large losses, API failures)
- Regular health checks and system status monitoring

### Security
- Store API keys securely (environment variables, secrets management)
- Restrict file permissions on configuration and log files
- Regular security updates and dependency management
- Monitor for unusual trading patterns or API usage

## Competition Strategy

For the 7-day competition, the agent is configured with:
- **Conservative risk parameters** to ensure 7-day survival
- **Balanced portfolio approach** across major crypto assets
- **Adaptive rebalancing** to maintain target allocations
- **Comprehensive logging** for post-competition analysis

The strategy prioritizes:
1. **Capital preservation** over aggressive returns
2. **Consistent performance** over volatile gains
3. **Risk management** over maximum profit
4. **Reliability** over complexity

## Troubleshooting

### Common Issues

**API Connection Errors**:
- Verify API key is correct and active
- Check network connectivity
- Ensure API URL is correct for environment

**Database Errors**:
- Check file permissions for database file
- Ensure sufficient disk space
- Verify SQLite installation

**Trading Errors**:
- Check account balance and credit
- Verify token addresses are correct
- Review risk parameters and limits

**Performance Issues**:
- Monitor API rate limits
- Check cache hit rates
- Review trade frequency settings

### Debug Mode
Enable debug logging by setting `LOG_LEVEL=debug` in your environment variables.

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the logs for error details
2. Review the troubleshooting section
3. Consult the Recall Network documentation
4. Join the Recall Discord community

---

**Disclaimer**: This trading agent is for educational and competition purposes. Cryptocurrency trading involves risk, and past performance does not guarantee future results. Always understand the risks before trading.