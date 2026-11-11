import { OrderType } from "@orbs-network/spot-ui";
import { Disclaimer } from "../types";
import { useOrderForm } from "../context/order-form-context";

export const useDisclaimer = (): Disclaimer | undefined => {
  const { orderType, values } = useOrderForm();

  if (values.isMarketOrder && orderType === OrderType.STOP_LOSS) {
    return Disclaimer.TRIGGER_MARKET_PRICE;
  }
  if (orderType === OrderType.LIMIT || orderType === OrderType.TWAP) {
    return values.isMarketOrder
      ? Disclaimer.MARKET_PRICE
      : Disclaimer.LIMIT_PRICE;
  }
  return undefined;
};
