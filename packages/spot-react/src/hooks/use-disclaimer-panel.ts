import { Module } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useTranslations } from "./use-translations";

export const useDisclaimerPanel = () => {
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const { module } = useSpotContext();
  const t = useTranslations();

  const hide = module === Module.STOP_LOSS || module === Module.TAKE_PROFIT;
  return useMemo(() => {
    if (hide) return;
    return {
      text: isMarketOrder ? t("marketOrderWarning") : t("limitPriceMessage"),
      url: "https://www.orbs.com/dtwap-and-dlimit-faq/",
    };
  }, [isMarketOrder, t, hide]);
};
