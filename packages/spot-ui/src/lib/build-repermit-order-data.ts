import {
  Address,
  Module,
  Partners,
  RePermitData,
  RePermitOrder,
} from "./types";
import { safeBNString } from "./utils";
import { getRePermitConfigEndpoint } from "./api-config";
import BN from "bignumber.js";

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

export const fetchRePermitData = async (
  partner: Partners,
  chainId: number,
): Promise<RePermitData> => {
  const query = new URLSearchParams({
    partner,
    chain: chainId.toString(),
  });
  const response = await fetch(`${getRePermitConfigEndpoint()}?${query}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to fetch RePermit data for partner "${partner}" on chain ${chainId}: ${response.status}${message ? ` ${message}` : ""}`,
    );
  }

  return response.json() as Promise<RePermitData>;
};

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
}: BuildRePermitOrderDataParams) => {
  const epoch =
    !totalTrades || totalTrades === 1
      ? 0
      : parseInt((fillDelayMillis / 1000).toFixed(0));
  const deadline = safeBNString(deadlineMillis / 1000);
  const freshness = 60;
  const start = Math.floor(currentTimeMillis / 1000).toString();
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
      freshness,
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
