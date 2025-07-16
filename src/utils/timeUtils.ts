import logger from './logger.js';

export class TimeUtils {
  /**
   * Check if the current UTC time falls within any of the specified peak hours
   */
  static isPeakLiquidityTime(peakHours: { start: number; end: number; }[]): boolean {
    const now = new Date();
    const currentHour = now.getUTCHours();

    for (const period of peakHours) {
      if (this.isTimeInRange(currentHour, period.start, period.end)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a time falls within a range, handling overnight periods
   */
  private static isTimeInRange(currentHour: number, start: number, end: number): boolean {
    if (start <= end) {
      // Normal range (e.g., 13-21)
      return currentHour >= start && currentHour < end;
    } else {
      // Overnight range (e.g., 22-6)
      return currentHour >= start || currentHour < end;
    }
  }

  /**
   * Get a descriptive string for the current time period
   */
  static getCurrentTimePeriod(peakHours: { start: number; end: number; }[]): string {
    const isPeak = this.isPeakLiquidityTime(peakHours);
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    return `${isPeak ? 'PEAK' : 'OFF-PEAK'} (${currentHour}:00 UTC)`;
  }

  /**
   * Calculate the adjusted trade interval based on current time
   */
  static getAdjustedTradeInterval(
    baseInterval: number,
    peakHours: { start: number; end: number; }[],
    peakMultiplier: number,
    offPeakMultiplier: number
  ): number {
    const isPeak = this.isPeakLiquidityTime(peakHours);
    const multiplier = isPeak ? peakMultiplier : offPeakMultiplier;
    const adjustedInterval = Math.round(baseInterval * multiplier);

    logger.debug('Trade interval adjusted', {
      baseInterval,
      isPeak,
      multiplier,
      adjustedInterval,
      timePeriod: this.getCurrentTimePeriod(peakHours)
    });

    return adjustedInterval;
  }

  /**
   * Calculate the adjusted position size multiplier based on current time
   */
  static getPositionSizeMultiplier(
    peakHours: { start: number; end: number; }[],
    peakMultiplier: number,
    offPeakMultiplier: number
  ): number {
    const isPeak = this.isPeakLiquidityTime(peakHours);
    const multiplier = isPeak ? peakMultiplier : offPeakMultiplier;

    logger.debug('Position size multiplier calculated', {
      isPeak,
      multiplier,
      timePeriod: this.getCurrentTimePeriod(peakHours)
    });

    return multiplier;
  }
}

export default TimeUtils;