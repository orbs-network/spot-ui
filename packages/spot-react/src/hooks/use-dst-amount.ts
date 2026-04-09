import { getDestTokenAmount, getDestTokenMinAmountPerChunk } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useAmountUi, useUsdAmount } from "./helper-hooks";
import { useTradePrice } from "./use-trade-price";
import { useTrades } from "./use-trades";
import { useSrcAmount } from "./use-src-amount";

export const useDstTokenAmount = () => {
  const { srcToken, dstToken, dstUsd1Token } = useSpotContext();
  const tradePrice = useTradePrice();
  const srcAmount = useSrcAmount().amount;

  const amount = useMemo(() => getDestTokenAmount(srcAmount || "", tradePrice, srcToken?.decimals || 0), [srcAmount, tradePrice, srcToken?.decimals]);
  const amountUI = useAmountUi(dstToken?.decimals, amount);
  return {
    amount,
    amountUI,
    usd: useUsdAmount(amountUI, dstUsd1Token),
  };
};

export const useDstMinAmountPerTrade = () => {
  const { srcToken, dstToken, dstUsd1Token } = useSpotContext();
  const tradePrice = useTradePrice();
  const amountPerTrade = useTrades().amountPerTrade;
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);

  const amount = useMemo(
    () => getDestTokenMinAmountPerChunk(amountPerTrade, tradePrice, Boolean(isMarketOrder), srcToken?.decimals || 0),
    [ amountPerTrade, tradePrice, isMarketOrder, srcToken?.decimals],
  );
  const amountUI = useAmountUi(dstToken?.decimals, amount);
  return {
    amount,
    amountUI,
    usd: useUsdAmount(amountUI, dstUsd1Token),
  };
};
