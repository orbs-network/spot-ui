import {
  getOrderExecutionRate,
  getOrderFillDelayMillis,
  Order,
  OrderFill,
} from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useNetwork } from "./helper-hooks";
import {
  useOrderLimitPrice,
  useOrderAvgExecutionPrice,
  useOrderTriggerPriceRate,
} from "./order-hooks";
import { Token } from "../types";
import { getExplorerUrl, toAmountUi, toAmountWei } from "../utils";

const useFills = (fills?: OrderFill[], srcToken?: Token, dstToken?: Token) => {
  const network = useNetwork();

  return useMemo(() => {
    return fills
      ?.map((fill) => ({
        srcToken: srcToken!,
        dstToken: dstToken!,
        srcAmount: toAmountUi(fill.inAmount, srcToken?.decimals),
        dstAmount: toAmountUi(fill.outAmount, dstToken?.decimals),
        timestamp: fill.timestamp,
        txHash: fill.txHash,
        explorerUrl: getExplorerUrl(fill.txHash, network?.id),
        executionRate: getOrderExecutionRate(
          fill.inAmount,
          fill.outAmount,
          srcToken?.decimals,
          dstToken?.decimals,
        ),
      }))
      .filter(
        (fill) => fill.srcToken !== undefined && fill.dstToken !== undefined,
      );
  }, [fills, srcToken, dstToken, network]);
};

export const useDisplayHistoryOrder = (
  order: Order,
  srcToken?: Token,
  dstToken?: Token,
) => {
  const { config } = useSpotContext();

  const limitPriceUI = useOrderLimitPrice(srcToken, dstToken, order);
  const triggerPriceUI = useOrderTriggerPriceRate(srcToken, dstToken, order);
  const executionPriceUI = useOrderAvgExecutionPrice(srcToken, dstToken, order);

  const tradeInterval = useMemo(() => {
    if (!order) return 0;
    if (order.version === 2) return order.fillDelay;
    if (config.twapConfig)
      return getOrderFillDelayMillis(order, config.twapConfig);
    return 0;
  }, [order, config]);

  const fills = useFills(order?.fills, srcToken, dstToken) ?? [];

  return useMemo(() => {
    if (!order?.id) return undefined;
    return {
      original: order,
      fills,
      srcToken,
      dstToken,
      orderType: order.type,
      createdAt: order.createdAt,
      deadline: order.deadline || 0,
      totalTrades: order.totalTradesAmount || 0,
      tradeInterval,
      recipient: order.maker || "",

      srcAmount: order.srcAmount || "",
      srcAmountUI: toAmountUi(order.srcAmount, srcToken?.decimals),
      srcAmountUsd: "",

      dstAmount: "",
      dstAmountUI: "",
      dstAmountUsd: "",

      limitPrice: toAmountWei(limitPriceUI, dstToken?.decimals),
      limitPriceUI: limitPriceUI || "",
      limitPriceUsd: "",

      sizePerTrade: order.srcAmountPerTrade || "",
      sizePerTradeUI: toAmountUi(order.srcAmountPerTrade, srcToken?.decimals),

      minDestAmountPerTrade: order.dstMinAmountPerTrade || "",
      minDestAmountPerTradeUI: toAmountUi(order.dstMinAmountPerTrade, dstToken?.decimals),

      dstMinAmount: order.dstMinAmountTotal,
      dstMinAmountUI: toAmountUi(order.dstMinAmountTotal, dstToken?.decimals),
      dstMinAmountUsd: "",

      triggerPrice: toAmountWei(triggerPriceUI, dstToken?.decimals),
      triggerPriceUI: triggerPriceUI || "",

      id: order.id,
      amountInFilled: toAmountUi(order.srcAmountFilled, srcToken?.decimals),
      amountOutFilled: toAmountUi(order.dstAmountFilled, dstToken?.decimals),
      amountOutFilledToken: dstToken,
      progress: order.progress,
      executionPrice: executionPriceUI,
      version: order.version,
    };
  }, [
    order,
    fills,
    srcToken,
    dstToken,
    tradeInterval,
    limitPriceUI,
    triggerPriceUI,
    executionPriceUI,
  ]);
};
