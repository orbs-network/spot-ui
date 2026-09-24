import BN from "bignumber.js";
import { getEstimatedDelayBetweenTradesMillis } from "../history/legacy/deployments";
import { Config } from "../history/legacy/types";
import { Order, OrderType } from "./types";
export const getOrderFillDelayMillis = (order: Order, config?: Config) => {
  if (order.version === 1) {
    return (
      (order.fillDelay || 0) * 1000 +
      (config ? getEstimatedDelayBetweenTradesMillis(config) : 0)
    );
  }
  // v2 history normalization already stores epoch/fillDelay in milliseconds.
  return order.fillDelay || 0;
};

export const getOrderExecutionRate = (
  srcAmountFilled = "",
  dstAmountFilled = "",
  srcTokenDecimals = 18,
  dstTokenDecimals = 18,
) => {
  if (!BN(srcAmountFilled || 0).gt(0) || !BN(dstAmountFilled || 0).gt(0))
    return "";
  const srcFilledAmountUi = amountUi(srcTokenDecimals, srcAmountFilled);
  const dstFilledAmountUi = amountUi(dstTokenDecimals, dstAmountFilled);

  return BN(dstFilledAmountUi).div(srcFilledAmountUi).toFixed();
};

export const getOrderLimitPriceRate = (
  order: Order,
  srcTokenDecimals: number,
  dstTokenDecimals: number,
) => {
  if (order.type === OrderType.TWAP_MARKET) return "";
  const srcBidAmountUi = amountUi(srcTokenDecimals, order.srcAmountPerTrade);
  const dstMinAmountUi = amountUi(dstTokenDecimals, order.dstMinAmountPerTrade);
  return BN(dstMinAmountUi).div(srcBidAmountUi).toFixed();
};

export const getTriggerPriceRate = (
  order: Order,
  srcTokenDecimals: number,
  dstTokenDecimals: number,
) => {
  if (order.type === OrderType.TWAP_MARKET) return "";
  const srcBidAmountUi = amountUi(srcTokenDecimals, order.srcAmountPerTrade);
  const dstMinAmountUi = amountUi(dstTokenDecimals, order.triggerPricePerTrade);
  return BN(dstMinAmountUi).div(srcBidAmountUi).toFixed();
};

import { amountUi } from "../shared/numbers";
