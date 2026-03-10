import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useDeadline } from "./use-deadline";
import { useDstMinAmountPerTrade } from "./use-dst-amount";
import { useFillDelay } from "./use-fill-delay";
import { useSrcAmount } from "./use-src-amount";
import { useTrades } from "./use-trades";
import { useTriggerPrice } from "./use-trigger-price";
import {
  buildRePermitOrderData,
  getNetwork,
  isNativeAddress,
} from "@orbs-network/spot-ui";

export const useRePermitOrderData = () => {
  const { srcToken, dstToken, account, chainId, slippage, config, module, fees } =
    useSpotContext();
  const { amountWei: srcAmount } = useSrcAmount();
  const { amountPerTradeWei: srcAmountPerTrade, totalTrades } = useTrades();
  const deadlineMillis = useDeadline();
  const { amountWei: minDestAmountPerTrade } = useDstMinAmountPerTrade();
  const { pricePerChunkWei: triggerPricePerTrade } = useTriggerPrice();
  const { milliseconds: fillDelayMillis } = useFillDelay();

  return useMemo(() => {
    return buildRePermitOrderData({
      chainId,
      srcToken: isNativeAddress(srcToken?.address || "")
        ? getNetwork(chainId)?.wToken.address || ""
        : srcToken?.address || "",
      dstToken: dstToken?.address || "",
      srcAmount,
      deadlineMillis,
      fillDelayMillis: !totalTrades || totalTrades === 1 ? 0 : fillDelayMillis,
      slippage: slippage * 100,
      account: account as `0x${string}`,
      srcAmountPerTrade,
      dstMinAmountPerTrade: minDestAmountPerTrade,
      triggerAmountPerTrade: triggerPricePerTrade,
      config,
      module,
      feePercentage: fees,
    });
  }, [
    srcToken,
    dstToken,
    account,
    chainId,
    slippage,
    config,
    module,
    srcAmount,
    srcAmountPerTrade,
    totalTrades,
    fillDelayMillis,
    minDestAmountPerTrade,
    triggerPricePerTrade,
    fees,
  ]);
};
