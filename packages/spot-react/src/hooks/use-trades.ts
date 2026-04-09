import { useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { getChunks, getMaxChunksError, getMaxPossibleChunks, getSrcTokenChunkAmount, getMinTradeSizeError, InputErrors, InputError } from "@orbs-network/spot-ui";
import { useSrcAmount } from "./use-src-amount";
import { useAmountUi } from "./helper-hooks";
import BN from "bignumber.js";

const useTradesError = (amount: number, maxAmount: number) => {
  const { module, srcUsd1Token, marketPrice, minChunkSizeUsd, typedInputAmount } = useSpotContext();

  return useMemo((): InputError | undefined => {
    if (BN(typedInputAmount || "0").isZero() || !marketPrice || BN(srcUsd1Token || "0").isZero()) return;
    if (!amount) {
      return {
        type: InputErrors.MIN_CHUNKS,
        value: 1,
        args: { minChunks: '1' },
      };
    }
    const { isError: maxChunksError } = getMaxChunksError(amount, maxAmount, module);
    if (maxChunksError) {
      return {
        type: InputErrors.MAX_CHUNKS,
        value: maxAmount,
        args: { maxChunks: `${maxAmount}` },
      };
    }
    const { isError: minTradeSizeError, value: minTradeSizeValue } = getMinTradeSizeError(typedInputAmount || "", srcUsd1Token || "", minChunkSizeUsd || 0);

    if (minTradeSizeError) {
      return {
        type: InputErrors.MIN_TRADE_SIZE,
        value: minTradeSizeValue,
        args: { minTradeSize: `${minTradeSizeValue}` },
      };
    }
  }, [amount, maxAmount, module, typedInputAmount, srcUsd1Token, minChunkSizeUsd, marketPrice]);
};

export const useTrades = () => {
  const { srcToken, srcUsd1Token, module, minChunkSizeUsd } = useSpotContext();
  const typedChunks = useSpotStore((s) => s.state.typedChunks);
  const updateState = useSpotStore((s) => s.updateState);
  const { amount: srcAmountWei, amountUI: srcAmountUI } = useSrcAmount();

  const maxTrades = useMemo(
    () => getMaxPossibleChunks(srcAmountUI || "", srcUsd1Token || "", minChunkSizeUsd || 0),
    [srcAmountUI, srcUsd1Token, minChunkSizeUsd],
  );

  const totalTrades = useMemo(() => getChunks(maxTrades, module, typedChunks), [maxTrades, typedChunks, module]);

  const onChange = useCallback(
    (typedChunks: number) =>
      updateState({
        typedChunks,
      }),
    [updateState],
  );

  const amountPerTrade = useMemo(() => getSrcTokenChunkAmount(srcAmountWei || "", totalTrades), [srcAmountWei, totalTrades]);
  const amountPerTradeUI = useAmountUi(srcToken?.decimals, amountPerTrade);

  const usd = useMemo(() => {
    if (!srcUsd1Token) return "0";
    return BN(amountPerTradeUI || "0")
      .times(srcUsd1Token || 0)
      .toString();
  }, [amountPerTradeUI, srcUsd1Token]);

  return {
    totalTrades,
    maxTrades,
    amountPerTradeUI,
    amountPerTrade: amountPerTrade,
    amountPerTradeUsd: usd,
    onChange,
    error: useTradesError(totalTrades, maxTrades),
  };
};

export const useTradesPanel = () => {
  const { srcToken, dstToken } = useSpotContext();
  const { onChange, totalTrades, amountPerTradeUsd, amountPerTradeUI, error, maxTrades, amountPerTrade } = useTrades();

  return useMemo(() => ({
    error,
    maxTrades,
    totalTrades,
    amountPerTradeUI,
    amountPerTrade,
    onChange,
    amountPerTradeUsd,
    fromToken: srcToken,
    toToken: dstToken,
  }), [error, maxTrades, totalTrades, amountPerTradeUI, amountPerTrade, onChange, amountPerTradeUsd, srcToken, dstToken]);
};
