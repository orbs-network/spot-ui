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
import { useSwapExecution } from "./use-swap-execution";
import { OrderType } from "@orbs-network/spot-ui";
import { toAmountUi } from "../utils";

export const useFormData = () => {
  const { srcToken, dstToken, account, marketPrice } = useSpotContext();

  const { amount: _srcAmount } = useSrcAmount();
  const {
    amount: limitPrice,
    amountUI: limitPriceUI,
    usd: limitPriceUsd,
  } = useLimitPrice();
  const {
    amountPerTrade: srcAmountPerTrade,
    amountPerTradeUI: srcAmountPerTradeUI,
    amountPerTradeUsd: srcAmountPerTradeUsd,
    totalTrades,
  } = useTrades();
  const deadlineMillis = useDeadline();
  const {
    amount: minDestAmountPerTrade,
    amountUI: minDestAmountPerTradeUI,
    usd: minDestAmountPerTradeUsd,
  } = useDstMinAmountPerTrade();
  const {
    amountUI: triggerPriceUI,
    amount: triggerPrice,
    usd: triggerPriceUsd,
  } = useTriggerPrice();
  const { milliseconds: fillDelayMillis } = useFillDelay();
  const { amount: dstAmount, amountUI: dstAmountUI } = useDstTokenAmount();
  const { srcAmountUsd, dstAmountUsd } = useAmountsUsd();
  const { amount: feesAmount, amountUI: feesAmountUI, percent: feesPercent, usd: feesUsd } = useFees();
  const rePermitData = useRePermitOrderData();
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const createdAt = useSpotStore((s) => s.state.currentTime);
  const swapExecution = useSwapExecution();
  const orderType = useOrderType();
  const srcAmount = swapExecution.acceptedSrcAmount || _srcAmount;
  const marketPriceUi = toAmountUi(marketPrice, dstToken?.decimals || 0);

  const isTriggerPrice = useMemo(() => {
    return (
      orderType === OrderType.TAKE_PROFIT ||
      orderType === OrderType.STOP_LOSS_LIMIT ||
      orderType === OrderType.STOP_LOSS_MARKET
    );
  }, [orderType]);

  const info = useBuildOrderInfo({
    srcToken,
    dstToken,
    account,
    orderType,
    createdAt,
    deadline: deadlineMillis,
    totalTrades,
    tradeInterval: fillDelayMillis,

    srcAmount,
    srcAmountUI: toAmountUi(srcAmount, srcToken?.decimals || 0),
    srcAmountUsd,

    dstAmount,
    dstAmountUI,
    dstAmountUsd,

    limitPrice: isMarketOrder ? undefined : limitPrice,
    limitPriceUI: isMarketOrder ? undefined : limitPriceUI,
    limitPriceUsd: isMarketOrder ? undefined : limitPriceUsd,

    srcAmountPerTrade,
    srcAmountPerTradeUI,
    srcAmountPerTradeUsd,

    minDestAmountPerTrade,
    minDestAmountPerTradeUI,
    minDestAmountPerTradeUsd,

    triggerPrice,
    triggerPriceUI,
    triggerPriceUsd,
  });

  return useMemo(() => {
    return {
      ...info,
      feesAmountUI,
      feesAmount,
      feesUsd: feesUsd || "",
      feesPercentage: feesPercent,
      rePermitData,
      isTriggerPrice,
      isMarketOrder,
      marketPrice,
      marketPriceUi,
    };
  }, [
    info,
    feesAmountUI,
    feesAmount,
    feesUsd,
    feesPercent,
    rePermitData,
    isTriggerPrice,
    isMarketOrder,
    marketPrice,
    marketPriceUi,
  ]);
};
