import { Module } from "@orbs-network/spot-ui";
import { Disclaimer } from "../types";
import { useOrderForm } from "../context/order-form-context";

export const useDisclaimer = (): Disclaimer | undefined => {
  const { module, values } = useOrderForm();

  if (values.isMarketOrder && module === Module.STOP_LOSS) {
    return Disclaimer.TRIGGER_MARKET_PRICE;
  }
  if (module === Module.LIMIT || module === Module.TWAP) {
    return values.isMarketOrder
      ? Disclaimer.MARKET_PRICE
      : Disclaimer.LIMIT_PRICE;
  }
  return undefined;
};
