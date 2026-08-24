import {
  Address,
  Module,
  Partners,
  RePermitData,
  RePermitOrder,
} from "./types";
import {
  getNetwork,
  getQueryParam,
  isNativeAddress,
  safeBNString,
} from "./utils";
import {
  getRePermitConfigEndpoint,
  QUERY_PARAMS,
} from "./consts";
import BN from "bignumber.js";

export type BuildRePermitOrderDataParams = {
  chainId: number;
  srcTokenAddress: string;
  dstTokenAddress: string;
  totalSrcAmount: string;
  currentTimeMillis: number;
  deadlineMillis: number;
  fillDelayMillis: number;
  totalTrades: number;
  slippageBps: number;
  swapperAddress: string;
  srcAmountPerTrade: string;
  minDstAmountPerTrade?: string;
  triggerAmountPerTrade?: string;
  permitData: RePermitData;
  module: Module;
};

export const fetchRePermitData = async (
  partner: Partners,
  chainId: number,
  isDev = false,
): Promise<RePermitData> => {
  const query = new URLSearchParams({
    partner,
    chain: chainId.toString(),
  });
  const response = await fetch(`${getRePermitConfigEndpoint(isDev)}?${query}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to fetch RePermit data for partner "${partner}" on chain ${chainId}: ${response.status}${message ? ` ${message}` : ""}`,
    );
  }

  return response.json() as Promise<RePermitData>;
};

export const buildRePermitOrderData = ({
  chainId,
  srcTokenAddress,
  dstTokenAddress,
  totalSrcAmount,
  currentTimeMillis,
  deadlineMillis,
  fillDelayMillis,
  totalTrades,
  slippageBps,
  swapperAddress,
  srcAmountPerTrade,
  minDstAmountPerTrade = "0",
  triggerAmountPerTrade = "0",
  permitData,
  module,
}: BuildRePermitOrderDataParams) => {
  const nonce = currentTimeMillis.toString();
  const epoch =
    !totalTrades || totalTrades === 1
      ? 0
      : parseInt((fillDelayMillis / 1000).toFixed(0));
  const deadline = safeBNString(deadlineMillis / 1000);
  const customFreshness = getQueryParam(QUERY_PARAMS.FRESHNESS);
  const freshness = customFreshness ? parseInt(customFreshness) : 60;
  const start = Math.floor(currentTimeMillis / 1000).toString();
  const normalizedSrcTokenAddress = isNativeAddress(srcTokenAddress)
    ? getNetwork(chainId)?.wToken.address || ""
    : srcTokenAddress;
  const limit = BN(minDstAmountPerTrade || 0).toFixed();
  const triggerLower = BN(
    module === Module.STOP_LOSS ? triggerAmountPerTrade || 0 : 0,
  ).toFixed();
  const triggerUpper = BN(
    module === Module.TAKE_PROFIT ? triggerAmountPerTrade || 0 : 0,
  ).toFixed();

  const orderData: RePermitOrder = {
    ...permitData.order,
    permitted: {
      ...permitData.order.permitted,
      token: normalizedSrcTokenAddress as Address,
      amount: totalSrcAmount,
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
        token: normalizedSrcTokenAddress as Address,
        amount: srcAmountPerTrade,
        maxAmount: totalSrcAmount,
      },
      output: {
        ...permitData.order.witness.output,
        token: dstTokenAddress as Address,
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
