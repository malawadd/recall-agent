
# LLM-Driven Trading Strategy

This document explains how to use and configure the Large Language Model (LLM)-driven trading strategy within the Recall Trading Agent. This advanced strategy allows the agent to make dynamic trading decisions based on real-time market data and a specified objective.

## How it Works

When the LLM-driven strategy is enabled, the agent delegates its trading decisions to an integrated OpenAI LLM. The process is as follows:

1.  **Data Collection**: The agent gathers comprehensive market data, including:
    *   Your current portfolio holdings and their values.
    *   Real-time prices for all tokens in your portfolio and a set of standard tokens (USDC, WETH, WBTC).
    *   A dynamic list of the **top 50 cryptocurrencies by market capitalization** from CoinGecko, providing their current price, 24-hour price change, 24-hour trading volume, and market cap.
    *   A list of "top losing tokens" (weakest performers) from CoinGecko, based on their 24-hour price change.
2.  **Contextual Prompting**: All this data, along with the agent's current state, risk parameters, and the LLM's objective (e.g., `maximize_profit` or `maximize_loss`), is formatted into a detailed prompt and sent to the OpenAI LLM.
3.  **AI Decision-Making**: The LLM processes this information and generates a structured JSON response containing a `TradingDecision` (buy, sell, or hold), specifying the tokens, amount, a reason, and a confidence score.
4.  **Execution**: The agent receives the LLM's decision and attempts to execute the trade, subject to risk management rules (which can be bypassed if the objective is to maximize loss).

This approach allows for more flexible and context-aware trading compared to rigid rule-based strategies.

## Prerequisites

*   **OpenAI API Key**: You need an API key from OpenAI to use their models.

## Configuration

### Environment Variables

Ensure the following environment variables are set in your `.env` file:

```dotenv
# Your OpenAI API key (required for LLM strategy)
OPENAI_API_KEY=your_openai_api_key_here

# LLM Strategy Parameters (optional, defaults are provided)
# LLM model to use (e.g., gpt-4o, gpt-4o-mini)
LLM_MODEL=gpt-4o
# LLM temperature (0.0 - 1.0, higher for more creative/risky decisions)
LLM_TEMPERATURE=0.7
```

## Controlling the LLM Strategy

The LLM strategy can be controlled dynamically via the Command Center API.

### 1. Enable/Disable LLM Strategy

By default, the LLM strategy is disabled, and the agent uses its rule-based strategies.

*   **Enable**:
    ```bash
    curl -X POST http://localhost:3001/command/toggle-llm-strategy \
      -H "Content-Type: application/json" \
      -d '{"enable": true}'
    ```
*   **Disable**:
    ```bash
    curl -X POST http://localhost:3001/command/toggle-llm-strategy \
      -H "Content-Type: application/json" \
      -d '{"enable": false}'
    ```

### 2. Set LLM Objective

You can instruct the LLM whether to try and maximize profit or maximize loss. This is crucial for the competition's "lose money" objective.

*   **Maximize Profit**:
    ```bash
    curl -X POST http://localhost:3001/command/set-llm-objective \
      -H "Content-Type: application/json" \
      -d '{"objective": "maximize_profit"}'
    ```
*   **Maximize Loss**:
    ```bash
    curl -X POST http://localhost:3001/command/set-llm-objective \
      -H "Content-Type: application/json" \
      -d '{"objective": "maximize_loss"}'
    ```
    **Note**: When `maximize_loss` is set, certain risk management checks are bypassed to allow the LLM to execute trades that are intended to reduce portfolio value.

### 3. Get LLM Strategy Status

Check the current status of the LLM strategy:

```bash
curl http://localhost:3001/command/llm-status
```

**Example Response**:
```json
{
  "success": true,
  "llmEnabled": true,
  "llmObjective": "maximize_loss"
}
```

## Data Provided to the LLM

The LLM receives a comprehensive `marketInsights` object, which includes:

```json
{
  "portfolio": { /* Your current portfolio details */ },
  "prices": { /* Current prices of all relevant tokens */ },
  "agentState": { /* Simplified agent state */ },
  "riskParams": { /* Current risk management parameters */ },
  "objective": "maximize_profit" | "maximize_loss",
  "marketInsights": {
    "topLosingTokens": [ /* Array of TokenCandidate for weakest performers */ ],
    "topCoinsByMarketCap": [ /* Array of TokenCandidate for top 50 coins by market cap */ ]
  }
}
```

The `topCoinsByMarketCap` array provides a dynamic snapshot of the broader cryptocurrency market, allowing the LLM to identify trends and opportunities beyond just your current holdings.

## Important Considerations

*   **Cost**: Using LLMs incurs API costs. Monitor your OpenAI usage.
*   **Latency**: LLM API calls introduce latency. The agent will wait for the LLM's response before proceeding.
*   **Decision Quality**: The effectiveness of the LLM's decisions depends on the model's capabilities, the clarity of the prompt, and the quality/completeness of the input data. Experiment with different models and prompt variations.
*   **Risk Bypass**: Be extremely cautious when using the `maximize_loss` objective, as it intentionally bypasses critical risk checks.
