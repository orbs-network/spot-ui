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
import { useAmountUi } from "./helper-hooks";

export const useDerivedOrder = () => {
  const { srcToken, dstToken, account, marketPrice } = useSpotContext();

  const { amountWei: srcAmountWei, amountUI: srcAmountUI } = useSrcAmount();
  const {
    amountWei: limitPriceWei,
    amountUI: limitPriceUI,
    usd: limitPriceUsd,
  } = useLimitPrice();
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
  const { amountWei: dstAmountWei, amountUI: dstAmountUI } =
    useDstTokenAmount();
  const { srcAmountUsd, dstAmountUsd } = useAmountsUsd();
  const { amount: feesAmount, percent: feesPercent, usd: feesUsd } = useFees();
  const rePermitData = useRePermitOrderData();
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const createdAt = useSpotStore((s) => s.state.currentTime);
  const swapExecution = useSwapExecution();
  const orderType = useOrderType();

  const marketPriceUi = useAmountUi(dstToken?.decimals || 0, marketPrice);

  const isTriggerPrice = useMemo(() => {
    return (
      orderType === OrderType.TAKE_PROFIT ||
      orderType === OrderType.STOP_LOSS_LIMIT ||
      orderType === OrderType.STOP_LOSS_MARKET
    );
  }, [orderType]);

  const info = useBuildOrderInfo({
    srcToken: swapExecution.srcToken || srcToken,
    dstToken: swapExecution.dstToken || dstToken,
    account,
    orderType,
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
      isTriggerPrice,
      isMarketOrder,
      marketPrice,
      marketPriceUi,
    };
  }, [
    info,
    rePermitData,
    feesAmount,
    feesUsd,
    feesPercent,
    isTriggerPrice,
    isMarketOrder,
    marketPrice,
    marketPriceUi,
  ]);
};
