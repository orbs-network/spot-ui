import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useAmountBN } from "./helper-hooks";
import BN from "bignumber.js";
import { useTranslations } from "./use-translations";

export const useSrcAmount = () => {
  const { srcToken } = useSpotContext();
  const t = useTranslations();

  const typedSrcAmount = useSpotStore((s) => s.state.typedSrcAmount);
  const acceptedSrcAmount = useSpotStore((s) => s.state.acceptedSrcAmount);

  const value = acceptedSrcAmount || typedSrcAmount;

  return {
    amountWei: useAmountBN(srcToken?.decimals, value),
    amountUI: value,
    error: BN(value || 0).isZero() ? t("enterAmount") : undefined,
  };
};
