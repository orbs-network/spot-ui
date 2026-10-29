import { Module, type Address, type RePermitData, type RePermitOrder } from "./types";
import BN from "bignumber.js";
import { SpotError } from "./errors";

const MILLISECONDS_PER_SECOND = 1000;
/** Signed oracle-data freshness, independent of the host's quote age policy. */
const ORDER_FRESHNESS_SECONDS = 60;

const floorToSeconds = (milliseconds: number): number =>
  Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
const roundToSeconds = (milliseconds: number): number =>
  Math.round(milliseconds / MILLISECONDS_PER_SECOND);

export type BuildRePermitOrderDataParams = {
  inputTokenAddress: string;
  outputTokenAddress: string;
  totalInputAmount: string;
  nonce: string;
  currentTimeMillis: number;
  deadlineMillis: number;
  fillDelayMillis: number;
  totalTrades: number;
  slippageBps: number;
  swapperAddress: string;
  inputAmountPerTrade: string;
  minOutputAmountPerTrade?: string;
  triggerOutputAmountPerTrade?: string;
  permitData: RePermitData;
  module: Module;
};

/** Builds an unsigned protocol payload from reviewed inputs without mutating its configuration. */
export const buildRePermitOrderData = ({
  inputTokenAddress,
  outputTokenAddress,
  totalInputAmount,
  nonce,
  currentTimeMillis,
  deadlineMillis,
  fillDelayMillis,
  totalTrades,
  slippageBps,
  swapperAddress,
  inputAmountPerTrade,
  minOutputAmountPerTrade = "0",
  triggerOutputAmountPerTrade = "0",
  permitData,
  module,
}: BuildRePermitOrderDataParams): RePermitData => {
  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0) {
    throw new SpotError("INVALID_ARGUMENT", "slippageBps must be a non-negative safe integer");
  }
  const epoch =
    !totalTrades || totalTrades === 1
      ? 0
      : roundToSeconds(fillDelayMillis);
  // Starts and swap deadlines floor; advanced deadlines retain nearest-second rounding.
  const deadline = (module === Module.SWAP
    ? floorToSeconds(deadlineMillis)
    : roundToSeconds(deadlineMillis)).toString();
  const start = floorToSeconds(currentTimeMillis).toString();
  const limit = BN(minOutputAmountPerTrade || 0).toFixed();
  const triggerLower = BN(
    module === Module.STOP_LOSS ? triggerOutputAmountPerTrade || 0 : 0,
  ).toFixed();
  const triggerUpper = BN(
    module === Module.TAKE_PROFIT ? triggerOutputAmountPerTrade || 0 : 0,
  ).toFixed();

  const orderData: RePermitOrder = {
    ...permitData.order,
    permitted: {
      ...permitData.order.permitted,
      token: inputTokenAddress as Address,
      amount: totalInputAmount,
    },
    nonce,
    deadline,
    witness: {
      ...permitData.order.witness,
      swapper: swapperAddress as Address,
      nonce,
      start,
      deadline,
      epoch,
      slippage: slippageBps,
      freshness: ORDER_FRESHNESS_SECONDS,
      input: {
        ...permitData.order.witness.input,
        token: inputTokenAddress as Address,
        amount: inputAmountPerTrade,
        maxAmount: totalInputAmount,
      },
      output: {
        ...permitData.order.witness.output,
        token: outputTokenAddress as Address,
        limit,
        triggerLower,
        triggerUpper,
        recipient: swapperAddress as Address,
      },
    },
  };

  return {
    ...permitData,
    order: orderData,
  };
};
