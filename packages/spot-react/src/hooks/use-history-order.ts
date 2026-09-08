import {
  getOrderExecutionRate,
  getOrderFillDelayMillis,
  getOrderLimitPriceRate,
  getTriggerPriceRate,
  getTwapConfig,
  toAmountUI,
  toAmountRaw,
  type Order,
  type OrderFill,
} from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotRuntime } from "../context/spot-runtime-context";
import type { Token } from "../types";

const getAmount = (raw?: string, decimals?: number) => ({
  raw: raw || "",
  ui: toAmountUI(raw, decimals),
});

const useFills = (
  fills?: OrderFill[],
  inputToken?: Token,
  outputToken?: Token,
) => {
  return useMemo(() => {
    if (!fills || !inputToken || !outputToken) return [];
    return fills.map((fill) => ({
      rawFill: fill,
      inputToken,
      outputToken,
      inputAmount: getAmount(fill.inAmount, inputToken.decimals),
      outputAmount: getAmount(fill.outAmount, outputToken.decimals),
      timestamp: fill.timestamp,
      txHash: fill.txHash,
      executionRate: getOrderExecutionRate(
        fill.inAmount,
        fill.outAmount,
        inputToken.decimals,
        outputToken.decimals,
      ),
    }));
  }, [fills, inputToken, outputToken]);
};

export const useHistoryOrder = (
  order?: Order,
  inputToken?: Token,
  outputToken?: Token,
) => {
  const { chainId, partner } = useSpotRuntime();

  const limitPriceUI = useMemo(() => {
    if (!inputToken || !outputToken || !order || order.isMarketPrice) return;
    return getOrderLimitPriceRate(
      order,
      inputToken.decimals,
      outputToken.decimals,
    );
  }, [inputToken, order, outputToken]);
  const triggerPriceUI = useMemo(() => {
    if (!inputToken || !outputToken || !order) return;
    return getTriggerPriceRate(
      order,
      inputToken.decimals,
      outputToken.decimals,
    );
  }, [inputToken, order, outputToken]);
  const executionPriceUI = useMemo(() => {
    if (!inputToken || !outputToken || !order) return;
    return getOrderExecutionRate(
      order.srcAmountFilled,
      order.dstAmountFilled,
      inputToken.decimals,
      outputToken.decimals,
    );
  }, [inputToken, order, outputToken]);

  const tradeInterval = useMemo(() => {
    if (!order) return 0;
    return getOrderFillDelayMillis(
      order,
      chainId ? getTwapConfig(partner, chainId) : undefined,
    );
  }, [order, partner, chainId]);

  const fills = useFills(order?.fills, inputToken, outputToken);

  return useMemo(() => {
    if (!order?.id) return undefined;
    return {
      original: order,
      fills,
      inputToken,
      outputToken,
      orderType: order.type,
      createdAt: order.createdAt,
      deadline: order.deadline || 0,
      totalTrades: order.totalTradesAmount || 0,
      tradeInterval,
      recipient: order.maker || "",

      inputAmount: getAmount(order.srcAmount, inputToken?.decimals),

      limitPrice: getAmount(
        toAmountRaw(limitPriceUI, outputToken?.decimals),
        outputToken?.decimals,
      ),

      inputAmountPerTrade: getAmount(
        order.srcAmountPerTrade,
        inputToken?.decimals,
      ),

      minOutputAmountPerTrade: getAmount(
        order.dstMinAmountPerTrade,
        outputToken?.decimals,
      ),

      minOutputAmount: getAmount(
        order.dstMinAmountTotal,
        outputToken?.decimals,
      ),

      triggerPrice: getAmount(
        toAmountRaw(triggerPriceUI, outputToken?.decimals),
        outputToken?.decimals,
      ),

      id: order.id,
      inputAmountFilled: getAmount(
        order.srcAmountFilled,
        inputToken?.decimals,
      ),

      outputAmountFilled: getAmount(
        order.dstAmountFilled,
        outputToken?.decimals,
      ),

      progress: order.progress,

      executionPrice: getAmount(
        toAmountRaw(executionPriceUI, outputToken?.decimals),
        outputToken?.decimals,
      ),
      version: order.version,
    };
  }, [
    order,
    fills,
    inputToken,
    outputToken,
    tradeInterval,
    limitPriceUI,
    triggerPriceUI,
    executionPriceUI,
  ]);
};
