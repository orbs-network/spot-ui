import { Module, ORBS_TWAP_FAQ_URL } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";

export const useDisclaimerPanel = () => {
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const { module } = useSpotContext();

  const triggerPriceWarning = useMemo(() => {
    if(!isMarketOrder) return;
    if (module !== Module.STOP_LOSS) return;

    return {
      text: "triggerMarketPriceDisclaimer",
      url: ORBS_TWAP_FAQ_URL,
    };
  }, [isMarketOrder, module]);

  const spotWarning = useMemo(() => {
    if (module !== Module.LIMIT && module !== Module.TWAP) return;
    return {
      text: isMarketOrder ? "marketOrderWarning" : "limitPriceMessage",
      url: "https://www.orbs.com/dtwap-and-dlimit-faq/",
    };
  }, [isMarketOrder, module]);
  return triggerPriceWarning || spotWarning;
};
