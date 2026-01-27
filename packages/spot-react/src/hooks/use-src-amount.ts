import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useAmountBN } from "./helper-hooks";
import BN from "bignumber.js";
import { useTranslations } from "./use-translations";

export const useSrcAmount = () => {
  const { srcToken, typedInputAmount } = useSpotContext();
  const t = useTranslations();

  const acceptedSrcAmount = useSpotStore((s) => s.state.acceptedSrcAmount);

  const value = acceptedSrcAmount || typedInputAmount;

  return {
    amountWei: useAmountBN(srcToken?.decimals, value),
    amountUI: value,
    error: BN(value || 0).isZero() ? t("enterAmount") : undefined,
  };
};

