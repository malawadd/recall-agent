@@ .. @@
 export interface StrategyParams {
   maxPositionSize: number;
   minTradeAmount: number;
   riskLevel: 'low' | 'medium' | 'high';
   rebalanceThreshold: number;
   targetAllocations: Record<string, number>;
+  meanReversionLookbackPeriod: number;
+  meanReversionDeviationThreshold: number;
+  trendFollowingShortSmaPeriod: number;
+  trendFollowingLongSmaPeriod: number;
 }
 
 export class StrategyParamsManager {
@@ .. @@
       targetAllocations: {
         [TOKENS.USDC]: 0.4,  // 40% USDC (stable base)
         [TOKENS.WETH]: 0.35, // 35% WETH (main crypto exposure)
         [TOKENS.WBTC]: 0.25  // 25% WBTC (diversification)
-      }
+      },
+      meanReversionLookbackPeriod: 20,
+      meanReversionDeviationThreshold: 0.02,
+      trendFollowingShortSmaPeriod: 10,
+      trendFollowingLongSmaPeriod: 50
     };
   }