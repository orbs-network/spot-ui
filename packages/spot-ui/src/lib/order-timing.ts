/** Signed interval in seconds; a single execution has no delay between trades. */
export const getOrderEpochSeconds = (fillDelayMillis: number, totalTrades: number): number =>
  !totalTrades || totalTrades === 1 ? 0 : Math.round(fillDelayMillis / 1000);
