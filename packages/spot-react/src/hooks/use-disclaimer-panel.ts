import { Module, ORBS_TWAP_FAQ_URL } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useTranslations } from "./use-translations";

export const useDisclaimerPanel = () => {
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const { module } = useSpotContext();
  const t = useTranslations();

  const triggerPriceWarning = useMemo(() => {
    if(!isMarketOrder) return;
    if (module !== Module.STOP_LOSS) return;

    return {
      text: t("triggerMarketPriceDisclaimer"),
      url: ORBS_TWAP_FAQ_URL,
    };
  }, [isMarketOrder, t, module]);

  const spotWarning = useMemo(() => {
    if(module !== Module.LIMIT && module !== Module.TWAP) return;
    return {
      text: isMarketOrder ? t("marketOrderWarning") : t("limitPriceMessage"),
      url: "https://www.orbs.com/dtwap-and-dlimit-faq/",
    };
  }, [isMarketOrder, t, module]);
  return triggerPriceWarning || spotWarning;
};
