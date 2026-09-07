import { analytics } from "@orbs-network/spot-ui";
import { useEffect } from "react";
import type { SpotProps } from "../types";

export const useSpotAnalytics = (
  props: SpotProps,
  isSupportedChain: boolean,
): void => {
  useEffect(() => {
    if (!props.chainId || !isSupportedChain) return;
    analytics.init(
      props.partner,
      props.minTradeSizeUsd,
      props.chainId,
      props.appId,
    );
  }, [
    props.appId,
    props.chainId,
    props.minTradeSizeUsd,
    props.partner,
    isSupportedChain,
  ]);
};
