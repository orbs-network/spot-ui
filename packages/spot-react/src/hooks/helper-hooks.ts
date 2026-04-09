import { getNetwork } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import BN from "bignumber.js";
import { getExplorerUrl, shouldUnwrapOnly, shouldWrapOnly, toAmountUi, toAmountWei } from "../utils";


export const useAmountBN = (decimals?: number, value?: string) => {
  return useMemo(() => toAmountWei(value, decimals), [decimals, value]);
};

export const useAmountUi = (decimals?: number, value?: string) => {
  return useMemo(() => toAmountUi(value, decimals), [decimals, value]);
};

export const useNetwork = () => {
  const { chainId } = useSpotContext();
  return useMemo(() => getNetwork(chainId), [chainId]);
};

export const useExplorerLink = (txHash?: string) => {
  const network = useNetwork();
  return useMemo(() => {
    if (!txHash || !network) return undefined;
    return getExplorerUrl(txHash, network.id);
  }, [txHash, network]);
};

export const useUsdAmount = (amount?: string, usd?: string | number) => {
  return useMemo(() => {
    if (!amount || !usd || BN(amount || "0").isZero() || BN(usd || "0").isZero()) return "";
    return BN(amount || "0")
      .times(usd)
      .toFixed();
  }, [amount, usd]);
};

export const useShouldOnlyWrap = () => {
  const { srcToken, dstToken, chainId } = useSpotContext();

  return useMemo(() => {
    return shouldWrapOnly(srcToken, dstToken, chainId);
  }, [srcToken, dstToken, chainId]);
};

export const useShouldUnwrap = () => {
  const { srcToken, dstToken, chainId } = useSpotContext();

  return useMemo(() => {
    return shouldUnwrapOnly(srcToken, dstToken, chainId);
  }, [srcToken, dstToken, chainId]);
};

export const useShouldWrapOrUnwrapOnly = () => {
  const wrap = useShouldOnlyWrap();
  const unwrap = useShouldUnwrap();

  return wrap || unwrap;
};
