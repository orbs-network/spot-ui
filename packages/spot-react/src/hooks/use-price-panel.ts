import { useCallback, useMemo } from "react";
import { useSpotStore } from "../store";
import BN from "bignumber.js";
import { useSpotContext } from "../spot-context";
import { toAmountUi, toAmountWei } from "../utils";
import { useUsdAmount } from "./helper-hooks";

const invertTypedPrice = (value?: string) => {
  if (value === undefined || value === "") return value;

  const amount = BN(value);
  if (amount.isNaN() || amount.isZero()) return "0";

  return BN(1).div(amount).toFixed();
};

export const usePricePanel = () => {
  const { srcToken, dstToken } = useSpotContext();
  const updateState = useSpotStore((s) => s.updateState);
  const isInverted = useSpotStore((s) => s.state.isInvertedTrade);
  const typedTriggerPrice = useSpotStore((s) => s.state.typedTriggerPrice);
  const typedLimitPrice = useSpotStore((s) => s.state.typedLimitPrice);
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const onInvert = useCallback(() => {
    updateState({
      isInvertedTrade: !isInverted,
      ...(typedTriggerPrice !== undefined
        ? { typedTriggerPrice: invertTypedPrice(typedTriggerPrice) }
        : {}),
      ...(typedLimitPrice !== undefined
        ? { typedLimitPrice: invertTypedPrice(typedLimitPrice) }
        : {}),
    });
  }, [updateState, isInverted, typedTriggerPrice, typedLimitPrice]);

  return {
    onInvert,
    isInverted,
    fromToken: isInverted ? dstToken : srcToken,
    toToken: isInverted ? srcToken : dstToken,
    isMarketPrice: isMarketOrder,
  };
};

const sanitizeAmount = (value?: string) => {
  if (!value) return "";
  return BN(value).isNaN() ? "" : value;
};

export const usePricePanelAmount = ({
  amount,
  typedValue,
  amountDecimals = 18,
  invertedAmountDecimals = 18,
  amountUsd,
  invertedAmountUsd,
  isInverted,
}: {
  amount?: string;
  typedValue?: string;
  amountDecimals?: number;
  invertedAmountDecimals?: number;
  amountUsd?: string;
  invertedAmountUsd?: string;
  isInverted?: boolean;
}) => {
  const amountUI = useMemo(() => {
    if (typedValue !== undefined) {
      return sanitizeAmount(typedValue);
    }

    const baseAmountUI = toAmountUi(amount, amountDecimals);
    if (!baseAmountUI || BN(baseAmountUI || "0").isZero()) return "";
    if (!isInverted) return baseAmountUI;

    return BN(1).div(baseAmountUI).toFixed();
  }, [amount, amountDecimals, isInverted, typedValue]);

  const displayAmount = useMemo(() => {
    if (!amountUI) return "";
    if (!isInverted) return sanitizeAmount(amount);

    return sanitizeAmount(toAmountWei(amountUI, invertedAmountDecimals));
  }, [amount, amountUI, invertedAmountDecimals, isInverted]);

  const usd = useUsdAmount(
    amountUI || "0",
    isInverted ? invertedAmountUsd : amountUsd,
  );

  return {
    amount: displayAmount,
    amountUI,
    usd: sanitizeAmount(usd),
  };
};
