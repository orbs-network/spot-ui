import { getOrderExecutionRate, getOrderFillDelayMillis, Order, OrderFill } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useAmountUi, useNetwork } from "./helper-hooks";
import {
  useOrderLimitPrice,
  useOrderAvgExecutionPrice,
  useHistoryOrderTitle,
  useOrderTriggerPriceRate,
  useOrdersQuery,
} from "./order-hooks";
import { useTranslations } from "./use-translations";
import { useBuildOrderInfo } from "./use-build-order-info";
import { SelectedOrder, Token } from "../types";
import { getExplorerUrl, toAmountUi } from "../utils";


const useFills = (fills?: OrderFill[], srcToken?: Token, dstToken?: Token) => {
  const network = useNetwork();

  return useMemo(() => {
    return fills?.map((fill) => ({
      srcToken: srcToken!,
      dstToken: dstToken!,
      srcAmount: toAmountUi(fill.inAmount, srcToken?.decimals),
      dstAmount: toAmountUi(fill.outAmount, dstToken?.decimals),
      timestamp: fill.timestamp,
      txHash: fill.txHash,
      explorerUrl: getExplorerUrl(fill.txHash, network?.id),
      executionRate: getOrderExecutionRate(fill.inAmount, fill.outAmount, srcToken?.decimals, dstToken?.decimals),
    })).filter((fill) => fill.srcToken !== undefined && fill.dstToken !== undefined);
  }, [fills, srcToken, dstToken, network])
}

export const useSelectedOrder = (
  orderId?: string,
): SelectedOrder | undefined => {
  const { data: orders } = useOrdersQuery();
  const { useToken, config } = useSpotContext();
  const t = useTranslations();
  const order =
    useMemo(
      () => orders?.find((order) => order.id === orderId),
      [orders, orderId],
    ) || ({} as Order);
  const title = useHistoryOrderTitle(order);
  const srcToken = useToken?.(order?.srcTokenAddress);
  const dstToken = useToken?.(order?.dstTokenAddress);
  const srcAmount = useAmountUi(srcToken?.decimals, order?.srcAmount);
  const limitPrice = useOrderLimitPrice(srcToken, dstToken, order);
  const triggerPrice = useOrderTriggerPriceRate(srcToken, dstToken, order);
  const executionPrice = useOrderAvgExecutionPrice(srcToken, dstToken, order);
  const srcFilledAmount = useAmountUi(
    srcToken?.decimals,
    order?.srcAmountFilled,
  );
  const dstFilledAmount = useAmountUi(
    dstToken?.decimals,
    order?.dstAmountFilled,
  );
  const progress = order?.progress;

  const srcAmountPerTrade = useAmountUi(
    srcToken?.decimals,
    order?.srcAmountPerTrade,
  );
  const minDestAmountPerTrade = useAmountUi(
    dstToken?.decimals,
    order?.dstMinAmountPerTrade,
  );

  const tradeInterval = useMemo(() => {
    if (!order) return 0;
    if (order.version === 2) {
      return order.fillDelay;
    }
    if (config.twapConfig) {
      return getOrderFillDelayMillis(order, config.twapConfig);
    }
    return 0;
  }, [order, config]);

  const info = useBuildOrderInfo({
    srcToken,
    dstToken,
    account: order?.maker,
    limitPrice,
    deadline: order?.deadline,
    tradeInterval,
    srcAmount,
    totalTrades: order?.totalTradesAmount,
    srcAmountPerTrade: srcAmountPerTrade,
    minDestAmountPerTrade,
    triggerPrice,
    orderType: order?.type,
  });

  const fills = useFills(order?.fills, srcToken, dstToken) ?? [];
  

  return useMemo((): SelectedOrder | undefined => {
    if (!order?.id) return undefined;
    return {
      original: order as Order,
      fills,
      title,
      ...info,
      createdAt: {
        label: t("createdAt"),
        value: order?.createdAt,
      },
      id: {
        label: t("id"),
        value: order?.id,
      },
      amountInFilled: {
        label: t("amountOut"),
        value: srcFilledAmount ?? "",
      },
      amountOutFilled: {
        label: t("amountReceived"),
        value: dstFilledAmount ?? "",
        token: dstToken,
      },
      progress: {
        label: t("progress"),
        value: progress,
      },
      executionPrice: {
        label: t(
          order?.totalTradesAmount === 1
            ? "finalExecutionPrice"
            : "averageExecutionPrice",
        ),
        value: executionPrice,
      },
      version: {
        label: t("version"),
        value: order?.version,
      },
    };
  }, [
    order,
    t,
    executionPrice,
    srcFilledAmount,
    dstFilledAmount,
    progress,
    title,
    srcToken,
    dstToken,
    info,
  ]);
};
