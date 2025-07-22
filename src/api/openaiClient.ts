```typescript
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import logger from '../utils/logger.js';
import { TradingDecision } from '../types/index.js';

export class OpenAIClient {
  private openai: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(apiKey: string, model: string = 'gpt-4o', temperature: number = 0.7, maxTokens: number = 500) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required.');
    }
    this.openai = new OpenAI({ apiKey });
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    logger.info('OpenAI client initialized', { model, temperature, maxTokens });
  }

  async getTradingDecision(
    context: {
      portfolio: any;
      prices: any;
      agentState: any;
      riskParams: any;
      objective: 'maximize_profit' | 'maximize_loss';
      marketInsights: any;
    }
  ): Promise<TradingDecision | null> {
    try {
      logger.info('Requesting trading decision from OpenAI...', { objective: context.objective });

      const systemPrompt = `You are an AI trading agent. Your goal is to ${context.objective === 'maximize_profit' ? 'maximize the profit of the portfolio' : 'lose all the money in the portfolio as quickly as possible'}.
You will receive current market data, your portfolio, and agent state.
Based on this information and your objective, you must decide on a single trading action.
Your response MUST be a JSON object with the following structure:
{
  "action": "buy" | "sell" | "hold",
  "fromToken": "0x...", // Contract address of the token to sell/use (e.g., USDC for buys)
  "toToken": "0x...",   // Contract address of the token to buy/receive (e.g., WETH for buys)
  "amount": number,     // The amount of 'fromToken' to trade (in human-readable units, e.g., 100 for 100 USDC)
  "reason": "string",   // A concise explanation for your decision (max 100 characters)
  "confidence": number  // A confidence score for your decision (0.0 to 1.0)
}
If you decide to 'hold', set fromToken, toToken, and amount to null.
Ensure 'amount' is a number, not a string.
Prioritize liquid assets for trading (USDC, WETH, WBTC).
If your objective is to maximize loss, identify tokens that are currently performing poorly or are highly volatile and buy them, or sell tokens that are performing well.
If your objective is to maximize profit, identify tokens that are performing well and buy them, or sell tokens that are performing poorly.
`;

      const userPrompt = `Current Portfolio: ${JSON.stringify(context.portfolio, null, 2)}
Current Prices: ${JSON.stringify(context.prices, null, 2)}
Agent State: ${JSON.stringify(context.agentState, null, 2)}
Risk Parameters: ${JSON.stringify(context.riskParams, null, 2)}
Market Insights: ${JSON.stringify(context.marketInsights, null, 2)}

Given this information, what is your trading decision to ${context.objective === 'maximize_profit' ? 'maximize profit' : 'maximize loss'}?`;

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        response_format: { type: 'json_object' },
      });

      const rawDecision = response.choices[0].message?.content;
      if (!rawDecision) {
        logger.warn('OpenAI returned no content for trading decision.');
        return null;
      }

      logger.debug('Raw OpenAI decision received', { rawDecision });

      const decision: TradingDecision = JSON.parse(rawDecision);

      // Basic validation of the decision structure
      if (
        !decision ||
        !['buy', 'sell', 'hold'].includes(decision.action) ||
        (decision.action !== 'hold' && (!decision.fromToken || !decision.toToken || typeof decision.amount !== 'number' || decision.amount <= 0)) ||
        typeof decision.reason !== 'string' ||
        typeof decision.confidence !== 'number' ||
        decision.confidence < 0 || decision.confidence > 1
      ) {
        logger.error('OpenAI returned an invalid trading decision format', { decision });
        return null;
      }

      logger.info('OpenAI trading decision parsed successfully', { decision });
      return decision;

    } catch (error) {
      logger.error('Error getting trading decision from OpenAI', { error });
      return null;
    }
  }
}
```