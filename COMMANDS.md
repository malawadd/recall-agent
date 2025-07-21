```markdown
# Trading Agent Command Center API Reference

This document provides a comprehensive reference for the API endpoints exposed by your Trading Agent's Command Center. You can use these endpoints to monitor, control, and interact with your agent.

The Command Center runs an Express server, typically on port `3001` (configurable via `COMMAND_SERVER_PORT` in your `.env` file). All examples assume the server is running on `http://localhost:3001`.

---

## Endpoints

### 1. `GET /health`

*   **Description**: Checks if the Command Center server is running and responsive.
*   **Method**: `GET`
*   **Example Request**:
    ```bash
    curl http://localhost:3001/health
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Command server is running",
      "timestamp": "2025-07-21T21:00:00.000Z"
    }
    ```

### 2. `GET /status`

*   **Description**: Retrieves the current operational status of the trading agent, including its running state, portfolio details, risk metrics, and performance.
*   **Method**: `GET`
*   **Example Request**:
    ```bash
    curl http://localhost:3001/status
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "status": {
        "agent": {
          "isRunning": true,
          "state": {
            "id": 1,
            "totalTrades": 123,
            "totalPnL": 50.75,
            "dailyPnL": 10.20,
            "lastTradeTime": "2025-07-21T21:00:00.000Z",
            "riskLevel": "medium",
            "isActive": true,
            "strategyParams": { /* ... current strategy parameters ... */ },
            "createdAt": "2025-07-20T10:00:00.000Z",
            "updatedAt": "2025-07-21T21:00:00.000Z"
          }
        },
        "portfolio": { /* ... current portfolio details ... */ },
        "risk": { /* ... current risk metrics ... */ },
        "performance": { /* ... performance metrics ... */ },
        "lastUpdate": "2025-07-21T21:00:00.000Z"
      }
    }
    ```

### 3. `POST /command/pause`

*   **Description**: Pauses the automated trading operations of the agent. The agent will stop executing new trades until resumed.
*   **Method**: `POST`
*   **Example Request**:
    ```bash
    curl -X POST http://localhost:3001/command/pause
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Trading paused successfully"
    }
    ```

### 4. `POST /command/resume`

*   **Description**: Resumes the automated trading operations of the agent after it has been paused.
*   **Method**: `POST`
*   **Example Request**:
    ```bash
    curl -X POST http://localhost:3001/command/resume
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Trading resumed successfully"
    }
    ```

### 5. `POST /command/update-strategy-params`

*   **Description**: Updates one or more strategy parameters of the agent. Only provide the parameters you wish to change.
*   **Method**: `POST`
*   **Request Body**: A JSON object containing the strategy parameters to update. Refer to `src/strategy/strategyParams.ts` for available parameters.
*   **Example Request**:
    ```bash
    curl -X POST http://localhost:3001/command/update-strategy-params \
      -H "Content-Type: application/json" \
      -d '{
        "rebalanceThreshold": 0.02,
        "meanReversionDeviationThreshold": 0.015
      }'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Strategy parameters updated successfully",
      "params": {
        "rebalanceThreshold": 0.02,
        "meanReversionDeviationThreshold": 0.015
      }
    }
    ```

### 6. `POST /command/update-risk-params`

*   **Description**: Updates one or more risk management parameters of the agent. Only provide the parameters you wish to change.
*   **Method**: `POST`
*   **Request Body**: A JSON object containing the risk parameters to update. Refer to `src/risk/riskManager.ts` for available parameters.
*   **Example Request**:
    ```bash
    curl -X POST http://localhost:3001/command/update-risk-params \
      -H "Content-Type: application/json" \
      -d '{
        "maxDailyLoss": 0.10,
        "maxTradesPerHour": 30
      }'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Risk parameters updated successfully",
      "params": {
        "maxDailyLoss": 0.10,
        "maxTradesPerHour": 30
      }
    }
    ```

### 7. `POST /command`

*   **Description**: Forces the agent to execute a specific trading decision immediately. This bypasses the strategy orchestration and risk validation (though risk validation is still performed internally).
*   **Method**: `POST`
*   **Request Body**: A JSON object representing a `TradingDecision`.
    *   `action`: (`'buy'` | `'sell'` | `'hold'`) - The type of action.
    *   `fromToken`: (`string`) - The address of the token to sell/use.
    *   `toToken`: (`string`) - The address of the token to buy/receive.
    *   `amount`: (`number`) - The amount of `fromToken` to trade.
    *   `reason`: (`string`) - A brief explanation for the trade.
    *   `confidence`: (`number`, optional) - A confidence score between 0 and 1.
*   **Example Request**:
    ```bash
    curl -X POST http://localhost:3001/command \
      -H "Content-Type: application/json" \
      -d '{
        "action": "buy",
        "fromToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "toToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "amount": 50,
        "reason": "Manual buy of WETH for testing",
        "confidence": 0.9
      }'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Trading decision executed successfully",
      "decision": {
        "action": "buy",
        "fromToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "toToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "amount": 50,
        "reason": "Manual buy of WETH for testing",
        "confidence": 0.9
      }
    }
    ```

### 8. `POST /command/force-trade`

*   **Description**: A simplified endpoint to force an immediate trade, primarily for quick testing. It uses default values if specific trade details are not provided.
*   **Method**: `POST`
*   **Request Body**: Optional JSON object with `fromToken`, `toToken`, `amount`, `reason`.
    *   **Defaults**: If not provided, it defaults to buying $25 worth of WETH with USDC.
*   **Example Request (Default Trade)**:
    ```bash
    curl -X POST http://localhost:3001/command/force-trade
    ```
*   **Example Request (Custom Trade)**:
    ```bash
    curl -X POST http://localhost:3001/command/force-trade \
      -H "Content-Type: application/json" \
      -d '{
        "fromToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "toToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "amount": 15,
        "reason": "Forced sell of WETH"
      }'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Forced trade executed successfully",
      "decision": {
        "action": "buy",
        "fromToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "toToken": "0xC02aaA39b223FE8D0A0eC4F27eAD9083C756Cc2",
        "amount": 15,
        "reason": "Forced sell of WETH",
        "confidence": 0.1
      }
    }
    ```
```