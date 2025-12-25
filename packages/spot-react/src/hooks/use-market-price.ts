import { amountUi } from "@orbs-network/spot-ui";
import { useState, useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useAmountBN, useFormatNumber } from "./helper-hooks";
import BN from "bignumber.js";

export const useMarketPricePanel = () => {
  const { srcToken, dstToken, marketPrice } = useSpotContext();
  const [invert, setInvert] = useState(false);

  const price = useMemo(() => {
    if (BN(marketPrice || "0").isZero() || !dstToken) return "0";
    const amountUI = amountUi(dstToken?.decimals, marketPrice);
    if (invert) {
      return BN(1)
        .div(amountUI || 0)
        .toFixed();
    }
    return amountUI;
  }, [invert, marketPrice, srcToken?.decimals, dstToken?.decimals]);

  return {
    fromToken: invert ? dstToken : srcToken,
    toToken: invert ? srcToken : dstToken,
    price: useFormatNumber({ value: price }),
    priceWei: useAmountBN(dstToken?.decimals, marketPrice),
    onInvert: useCallback(() => setInvert(!invert), [invert]),
  };
};
