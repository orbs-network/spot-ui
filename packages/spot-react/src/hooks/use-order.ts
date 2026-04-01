import { useSpotContext } from "../spot-context";
import { useDeadline } from "./use-deadline";
import { useDstMinAmountPerTrade, useDstTokenAmount } from "./use-dst-amount";
import { useFillDelay } from "./use-fill-delay";
import { useLimitPrice } from "./use-limit-price";
import { useSrcAmount } from "./use-src-amount";
import { useTrades } from "./use-trades";
import { useTriggerPrice } from "./use-trigger-price";
import { useMemo } from "react";
import { useAmountsUsd } from "./use-amounts-usd";
import { useFees } from "./use-fees";
import { useBuildOrderInfo } from "./use-build-order-info";
import { useSpotStore } from "../store";
import { useOrderType } from "./order-hooks";
import { useRePermitOrderData } from "./use-repermit-order-data";
import { useFormatNumber } from "./helper-hooks";

export const useOrder = () => {
  const { srcToken, dstToken, account } = useSpotContext();

  const { amountWei: srcAmountWei, amountUI: srcAmountUI } = useSrcAmount();
  const { amountWei: limitPriceWei, amountUI: limitPriceUI, usd: limitPriceUsd } = useLimitPrice();
  const {
    amountPerTradeWei: srcAmountPerTradeWei,
    amountPerTradeUI: srcAmountPerTradeUI,
    amountPerTradeUsd: srcAmountPerTradeUsd,
    totalTrades,
  } = useTrades();
  const deadlineMillis = useDeadline();
  const {
    amountWei: minDestAmountPerTradeWei,
    amountUI: minDestAmountPerTradeUI,
    usd: minDestAmountPerTradeUsd,
  } = useDstMinAmountPerTrade();
  const {
    pricePerChunkWei: triggerPriceWei,
    amountUI: triggerPriceUI,
    usd: triggerPriceUsd,
  } = useTriggerPrice();
  const { milliseconds: fillDelayMillis } = useFillDelay();
  const { amountWei: dstAmountWei, amountUI: dstAmountUI } = useDstTokenAmount();
  const { srcAmountUsd, dstAmountUsd } = useAmountsUsd();
  const {
    amount: feesAmount,
    percent: feesPercent,
    usd: feesUsd,
  } = useFees();
  const rePermitData = useRePermitOrderData();
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const createdAt = useSpotStore((s) => s.state.currentTime);

  const info = useBuildOrderInfo({
    srcToken,
    dstToken,
    account,
    orderType: useOrderType(),
    createdAt,
    deadline: deadlineMillis,
    totalTrades,
    tradeInterval: fillDelayMillis,

    srcAmount: srcAmountWei,
    srcAmountUI,
    srcAmountUsd,

    dstAmount: dstAmountWei,
    dstAmountUI,
    dstAmountUsd,

    limitPrice: isMarketOrder ? undefined : limitPriceWei,
    limitPriceUI: isMarketOrder ? undefined : limitPriceUI,
    limitPriceUsd: isMarketOrder ? undefined : limitPriceUsd,

    srcAmountPerTrade: srcAmountPerTradeWei,
    srcAmountPerTradeUI,
    srcAmountPerTradeUsd,

    minDestAmountPerTrade: minDestAmountPerTradeWei,
    minDestAmountPerTradeUI,
    minDestAmountPerTradeUsd,

    triggerPrice: triggerPriceWei,
    triggerPriceUI,
    triggerPriceUsd,
  });


  return useMemo(() => {
    return {
      ...info,
      feesAmount,
      feesUsd: feesUsd || "",
      feesPercentage: feesPercent,
      rePermitData,
    };
  }, [info, rePermitData, feesAmount, feesUsd, feesPercent]);
};
