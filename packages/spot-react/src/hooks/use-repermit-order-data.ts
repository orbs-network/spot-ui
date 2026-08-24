import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useDeadline } from "./use-deadline";
import { useDstMinAmountPerTrade } from "./use-dst-amount";
import { useFillDelay } from "./use-fill-delay";
import { useSrcAmount } from "./use-src-amount";
import { useTrades } from "./use-trades";
import { useTriggerPrice } from "./use-trigger-price";
import { useSpotStore } from "../store";
import { buildRePermitOrderData } from "@orbs-network/spot-ui";
import { useRePermitData } from "./use-repermit-data";

export const useRePermitOrderData = () => {
  const { srcToken, dstToken, account, chainId, slippage, module } =
    useSpotContext();
  const currentTimeMillis = useSpotStore((s) => s.state.currentTime);
  const { amount: srcAmount } = useSrcAmount();
  const { amountPerTrade: srcAmountPerTrade, totalTrades } = useTrades();
  const deadlineMillis = useDeadline();
  const { amount: minDestAmountPerTrade } = useDstMinAmountPerTrade();
  const { pricePerChunk: triggerPricePerTrade } = useTriggerPrice();
  const { milliseconds: fillDelayMillis } = useFillDelay();
  const { data: permitData, error, isLoading } = useRePermitData();

  const data = useMemo(() => {
    if (!permitData) return undefined;

    return buildRePermitOrderData({
      chainId,
      srcTokenAddress: srcToken?.address || "",
      dstTokenAddress: dstToken?.address || "",
      totalSrcAmount: srcAmount,
      currentTimeMillis,
      deadlineMillis,
      fillDelayMillis,
      totalTrades,
      slippageBps: slippage * 100,
      swapperAddress: account as `0x${string}`,
      srcAmountPerTrade,
      minDstAmountPerTrade: minDestAmountPerTrade,
      triggerAmountPerTrade: triggerPricePerTrade,
      permitData,
      module,
    });
  }, [
    permitData,
    srcToken,
    dstToken,
    account,
    chainId,
    currentTimeMillis,
    slippage,
    module,
    srcAmount,
    srcAmountPerTrade,
    totalTrades,
    deadlineMillis,
    fillDelayMillis,
    minDestAmountPerTrade,
    triggerPricePerTrade,
  ]);

  return useMemo(
    () => ({ data, error, isLoading }),
    [data, error, isLoading],
  );
};
