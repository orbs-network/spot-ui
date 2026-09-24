import { Module } from "@orbs-network/spot-ui";
import type { SpotProps } from "../provider/types";
import type { FormDefaults, FormState } from "./types";
export const createFormState = (defaults: FormDefaults): FormState => ({
  tradeCount: defaults.tradeCount,
  tradeInterval: defaults.tradeInterval,
  orderDuration: defaults.orderDuration,
  limitPriceUi: defaults.limitPriceUi,
  triggerPriceUi: defaults.triggerPriceUi,
  triggerPricePercent: defaults.triggerPricePercent,
  limitPricePercent: defaults.limitPricePercent,
  isMarketOrder: defaults.isMarketOrder,
  isPriceInverted: undefined,
});
export const createSpotFormDefaults = (
  props: Pick<SpotProps, "module" | "overrides">,
): FormDefaults => {
  const state = props.overrides?.state;
  return {
    isMarketOrder: props.module === Module.LIMIT ? false : state?.isMarketOrder,
    tradeCount: state?.tradeCount,
    tradeInterval: state?.tradeInterval,
    orderDuration: state?.orderDuration,
    limitPriceUi: state?.limitPriceUi,
    triggerPriceUi: state?.triggerPriceUi,
    triggerPricePercent: state?.triggerPricePercent,
    limitPricePercent: state?.limitPricePercent,
  };
};
