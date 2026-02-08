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
import { useTranslations } from "./use-translations";
import { useFees } from "./use-fees";
import {
  buildRePermitOrderData,
  getNetwork,
  isNativeAddress,
} from "@orbs-network/spot-ui";
import { useBuildOrderInfo } from "./use-build-order-info";
import { useFormatNumber } from "./helper-hooks";
import { useSpotStore } from "../store";

export const useOrder = () => {
  const { srcToken, dstToken, account, chainId, slippage, config, module } =
    useSpotContext();
  const { amountWei: srcAmount } = useSrcAmount();
  const { amountWei: limitPrice } = useLimitPrice();
  const { amountPerTradeWei: srcAmountPerTrade, totalTrades } = useTrades();
  const deadlineMillis = useDeadline();
  const { amountWei: minDestAmountPerTrade } = useDstMinAmountPerTrade();
  const { amountWei: triggerPricePerTrade } = useTriggerPrice();
  const { milliseconds: fillDelayMillis } = useFillDelay();

  return useMemo(() => {
    return {
      srcToken,
      dstToken,
      limitPrice,
      deadline: deadlineMillis,
      srcAmount,
      srcAmountPerTrade,
      totalTrades,
      minDestAmountPerTrade,
      tradeInterval: fillDelayMillis,
      triggerPricePerTrade,
      maker: account,
      rePermitData: buildRePermitOrderData({
        chainId,
        srcToken: isNativeAddress(srcToken?.address || "")
          ? getNetwork(chainId)?.wToken.address || ""
          : srcToken?.address || "",
        dstToken: dstToken?.address || "",
        srcAmount,
        deadlineMillis,
        fillDelayMillis:
          !totalTrades || totalTrades === 1 ? 0 : fillDelayMillis,
        slippage: slippage * 100,
        account: account as `0x${string}`,
        srcAmountPerTrade,
        dstMinAmountPerTrade: minDestAmountPerTrade,
        triggerAmountPerTrade: triggerPricePerTrade,
        config,
        module,
      }),
    };
  }, [
    srcToken,
    dstToken,
    limitPrice,
    deadlineMillis,
    srcAmount,
    srcAmountPerTrade,
    totalTrades,
    minDestAmountPerTrade,
    triggerPricePerTrade,
    account,
    fillDelayMillis,
    slippage,
    chainId,
    config,
    module,
  ]);
};

export const useOrderInfo = () => {
  const { srcToken, dstToken, account } = useSpotContext();
  const t = useTranslations();
  const { amountUI: dstMinAmountPerTradeUI, usd: dstMinAmountPerTradeUsd } =
    useDstMinAmountPerTrade();

  const {
    amountPerTradeUI: srcAmountPerTradeUI,
    amountPerTradeUsd: srcAmountPerTradeUsd,
    totalTrades,
  } = useTrades();

  const { amountUI: triggerPricePerTradeUI, usd: triggerPricePerTradeUsd } =
    useTriggerPrice();
  const deadlineMillis = useDeadline();
  const { amountUI: limitPriceUI, usd: limitPriceUsd } = useLimitPrice();
  const {
    amount: feesAmountRaw,
    percent: feesPercent,
    usd: feesUsdRaw,
  } = useFees();
  const { milliseconds: fillDelayMillis } = useFillDelay();
  const { amountUI: dstAmountUI } = useDstTokenAmount();
  const { srcAmountUsd, dstAmountUsd } = useAmountsUsd();
  const srcAmountUI = useSrcAmount().amountUI;
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);

  const info = useBuildOrderInfo({
    srcToken,
    dstToken,
    account,
    limitPrice: isMarketOrder ? undefined : limitPriceUI,
    limitPriceUsd: isMarketOrder ? undefined : limitPriceUsd,
    deadline: deadlineMillis,
    tradeInterval: fillDelayMillis,
    srcAmount: srcAmountUI,
    totalTrades,
    srcAmountPerTrade: srcAmountPerTradeUI,
    srcAmountPerTradeUsd: srcAmountPerTradeUsd,
    minDestAmountPerTrade: dstMinAmountPerTradeUI,
    minDestAmountPerTradeUsd: dstMinAmountPerTradeUsd,
    triggerPricePerTrade: triggerPricePerTradeUI,
    triggerPricePerTradeUsd: triggerPricePerTradeUsd,
    srcUsd: srcAmountUsd,
    dstUsd: dstAmountUsd,
    dstAmount: dstAmountUI,
  });

  const feesAmount = useFormatNumber({ value: feesAmountRaw });
  const feesUsd = useFormatNumber({ value: feesUsdRaw });

  return useMemo(() => {
    return {
      ...info,
      fees: {
        label: t("fees", { value: `${feesPercent}%` }),
        amount: feesAmount,
        usd: feesUsd || "",
        percentage: feesPercent,
      },
    };
  }, [info, feesAmount, feesUsd, feesPercent]);
};
