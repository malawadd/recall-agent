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


### 9. `POST /command/toggle-llm-strategy`

*   **Description**: Toggles the AI-driven (LLM) trading strategy on or off. When enabled, the agent will use an LLM to make trading decisions.
*   **Method**: `POST`
*   **Request Body**: A JSON object with a boolean `enable` field.
    *   `enable`: (`boolean`) - `true` to enable the LLM strategy, `false` to disable.
*   **Example Request (Enable)**:
    ```bash
    curl -X POST http://localhost:3001/command/toggle-llm-strategy \
      -H "Content-Type: application/json" \
      -d '{"enable": true}'
    ```
*   **Example Request (Disable)**:
    ```bash
    curl -X POST http://localhost:3001/command/toggle-llm-strategy \
      -H "Content-Type: application/json" \
      -d '{"enable": false}'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "LLM strategy enabled",
      "llmEnabled": true
    }
    ```

### 10. `POST /command/set-llm-objective`

*   **Description**: Sets the objective for the LLM when the LLM strategy is enabled.
*   **Method**: `POST`
*   **Request Body**: A JSON object with an `objective` field.
    *   `objective`: (`'maximize_profit'` | `'maximize_loss'`) - The goal for the LLM.
*   **Example Request (Maximize Profit)**:
    ```bash
    curl -X POST http://localhost:3001/command/set-llm-objective \
      -H "Content-Type: application/json" \
      -d '{"objective": "maximize_profit"}'
    ```
*   **Example Request (Maximize Loss)**:
    ```bash
    curl -X POST http://localhost:3001/command/set-llm-objective \
      -H "Content-Type: application/json" \
      -d '{"objective": "maximize_loss"}'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "LLM objective set to maximize_loss",
      "llmObjective": "maximize_loss"
    }
    ```

### 11. `GET /command/llm-status`

*   **Description**: Retrieves the current status of the LLM strategy, including whether it's enabled and its current objective.
*   **Method**: `GET`
*   **Example Request**:
    ```bash
    curl http://localhost:3001/command/llm-status
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "llmEnabled": true,
      "llmObjective": "maximize_loss"
    }
    ```

### 12. `POST /command/toggle-guaranteed-meme-mode`

*   **Description**: Toggles the guaranteed meme token trading mode on or off. When enabled, the agent will make a guaranteed meme token trade every cycle if no other strategy triggers.
*   **Method**: `POST`
*   **Request Body**: A JSON object with a boolean `enable` field.
    *   `enable`: (`boolean`) - `true` to enable guaranteed meme mode, `false` to disable.
*   **Example Request (Enable)**:
    ```bash
    curl -X POST http://localhost:3001/command/toggle-guaranteed-meme-mode \
      -H "Content-Type: application/json" \
      -d '{"enable": true}'
    ```
*   **Example Request (Disable)**:
    ```bash
    curl -X POST http://localhost:3001/command/toggle-guaranteed-meme-mode \
      -H "Content-Type: application/json" \
      -d '{"enable": false}'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "🚀 GUARANTEED MEME MODE ACTIVATED - PREPARE TO ACCUMULATE ALL THE MEMES! 🚀",
      "guaranteedMemeEnabled": true
    }
    ```

### 13. `POST /command/update-guaranteed-meme-params`

*   **Description**: Updates the parameters for the guaranteed meme token trading mode.
*   **Method**: `POST`
*   **Request Body**: A JSON object containing the meme trading parameters to update.
*   **Example Request**:
    ```bash
    curl -X POST http://localhost:3001/command/update-guaranteed-meme-params \
      -H "Content-Type: application/json" \
      -d '{
        "guaranteedMemeTradeAmountUSD": 25,
        "guaranteedMemeTokenSelectionMethod": "most_negative_solana_change"
      }'
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "message": "Guaranteed meme parameters updated successfully",
      "params": {
        "guaranteedMemeTradeAmountUSD": 25,
        "guaranteedMemeTokenSelectionMethod": "most_negative_solana_change"
      }
    }
    ```

### 14. `GET /command/guaranteed-meme-status`

*   **Description**: Retrieves the current status of the guaranteed meme token trading mode.
*   **Method**: `GET`
*   **Example Request**:
    ```bash
    curl http://localhost:3001/command/guaranteed-meme-status
    ```
*   **Example Response**:
    ```json
    {
      "success": true,
      "status": {
        "enabled": true,
        "tradeAmountUSD": 10,
        "selectionMethod": "random_top_solana_meme",
        "specificTokenAddress": "",
        "state": {
          "enabled": true,
          "lastSelectedToken": {
            "symbol": "BONK",
            "contractAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
          },
          "lastSelectionTime": 1640995200000,
          "tradeAmountUSD": 10,
          "selectionMethod": "random_top_solana_meme"
        }
      }
    }
    ```