import { getOrderFillDelayMillis, Order } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useAmountUi, useFormatNumber } from "./helper-hooks";
import {
  useOrders,
  useOrderLimitPrice,
  useOrderAvgExcecutionPrice,
  useHistoryOrderTitle,
} from "./order-hooks";
import { useTranslations } from "./use-translations";
import { useBuildOrderInfo } from "./use-build-order-info";


export const useHistoryOrder = (orderId?: string) => {
  const { orders } = useOrders();
  const { useToken, config } = useSpotContext();
  const t = useTranslations();
  const order =
    useMemo(
      () => orders?.all.find((order) => order.id === orderId),
      [orders, orderId]
    ) || ({} as Order);
  const title = useHistoryOrderTitle(order);
  const srcToken = useToken?.(order?.srcTokenAddress);
  const dstToken = useToken?.(order?.dstTokenAddress);
  const srcAmount = useAmountUi(srcToken?.decimals, order?.srcAmount);
  const limitPrice = useOrderLimitPrice(srcToken, dstToken, order);

  const excecutionPrice = useFormatNumber({
    value: useOrderAvgExcecutionPrice(srcToken, dstToken, order),
  });
  const srcFilledAmount = useFormatNumber({
    value: useAmountUi(srcToken?.decimals, order?.srcAmountFilled),
  });
  const dstFilledAmount = useFormatNumber({
    value: useAmountUi(dstToken?.decimals, order?.dstAmountFilled),
  });
  const progress = useFormatNumber({ value: order?.progress, decimalScale: 2 });

  const srcAmountPerTrade = useAmountUi(
    srcToken?.decimals,
    order?.srcAmountPerTrade
  );
  const minDestAmountPerTrade = useAmountUi(
    dstToken?.decimals,
    order?.dstMinAmountPerTrade
  );
  const triggerPricePerTrade = useAmountUi(
    dstToken?.decimals,
    order?.triggerPricePerTrade
  );

  

  const tradeInterval = useMemo(() => {
    if(!order) return 0;
    if(order.version === 2) {
      return order.fillDelay;
    }
    if(config.twapConfig) {
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
    triggerPricePerTrade,
  });

  return useMemo(() => {
    return {
      original: order,
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
        value: srcFilledAmount,
      },
      amountOutFilled: {
        label: t("amountReceived"),
        value: dstFilledAmount,
        token: dstToken,
      },
      progress: {
        label: t("progress"),
        value: progress,
      },
      excecutionPrice: {
        label: t(
          order?.totalTradesAmount === 1
            ? "finalExcecutionPrice"
            : "averageExecutionPrice"
        ),
        value: excecutionPrice,
      },
      version: {
        label: t("version"),
        value: order?.version,
      },
    };
  }, [
    order,
    t,
    excecutionPrice,
    srcFilledAmount,
    dstFilledAmount,
    progress,
    title,
    srcToken,
    dstToken,
    info,
  ]);
};
