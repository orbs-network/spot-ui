import { useMemo } from "react";
import { OrderType, Token } from "../types";
import BN from "bignumber.js";

type Props = {
  srcToken?: Token;
  dstToken?: Token;
  account?: string;
  orderType?: OrderType;
  createdAt?: number;
  deadline?: number;
  totalTrades?: number;
  tradeInterval?: number;
  srcAmount?: string;
  srcAmountUI?: string;
  srcAmountUsd?: string;
  dstAmount?: string;
  dstAmountUI?: string;
  dstAmountUsd?: string;
  limitPrice?: string;
  limitPriceUI?: string;
  limitPriceUsd?: string;
  srcAmountPerTrade?: string;
  srcAmountPerTradeUI?: string;
  srcAmountPerTradeUsd?: string;
  minDestAmountPerTrade?: string;
  minDestAmountPerTradeUI?: string;
  minDestAmountPerTradeUsd?: string;
  triggerPrice?: string;
  triggerPriceUI?: string;
  triggerPriceUsd?: string;
};

export const useBuildOrderInfo = (props: Props) => {

  const dstMinAmount = useMemo(() => {
    if(!props.minDestAmountPerTrade || !props.totalTrades) return "";
    return BN(props.minDestAmountPerTrade).multipliedBy(props.totalTrades).decimalPlaces(0).toFixed();
  }, [props.minDestAmountPerTrade, props.totalTrades])

  const dstMinAmountUI = useMemo(() => {
    if(!props.minDestAmountPerTradeUI || !props.totalTrades) return "";
    return BN(props.minDestAmountPerTradeUI).multipliedBy(props.totalTrades).toFixed();
  }, [props.minDestAmountPerTradeUI, props.totalTrades])

  const dstMinAmountUsd = useMemo(() => {
    if(!props.minDestAmountPerTradeUsd || !props.totalTrades) return "";
    return BN(props.minDestAmountPerTradeUsd).multipliedBy(props.totalTrades).decimalPlaces(2).toFixed();
  }, [props.minDestAmountPerTradeUsd, props.totalTrades])

  return useMemo(() => {
    return {
      srcToken: props.srcToken,
      dstToken: props.dstToken,
      orderType: props.orderType,
      createdAt: props.createdAt || 0,
      deadline: props.deadline || 0,
      totalTrades: props.totalTrades || 0,
      tradeInterval: props.tradeInterval || 0,
      recipient: props.account || "",

      srcAmount: props.srcAmount || "",
      srcAmountUI: props.srcAmountUI || "",
      srcAmountUsd: props.srcAmountUsd || "",

      dstAmount: props.dstAmount || "",
      dstAmountUI: props.dstAmountUI || "",
      dstAmountUsd: props.dstAmountUsd || "",

      limitPrice: props.limitPrice || "",
      limitPriceUI: props.limitPriceUI || "",
      limitPriceUsd: props.limitPriceUsd || "",

      sizePerTrade: props.srcAmountPerTrade || "",
      sizePerTradeUI: props.srcAmountPerTradeUI || "",
      sizePerTradeUsd: props.srcAmountPerTradeUsd,

      minDestAmountPerTrade: props.minDestAmountPerTrade || "",
      minDestAmountPerTradeUI: props.minDestAmountPerTradeUI || "",
      minDestAmountPerTradeUsd: props.minDestAmountPerTradeUsd,

      dstMinAmount,
      dstMinAmountUI,
      dstMinAmountUsd,

      triggerPrice: props.triggerPrice || "",
      triggerPriceUI: props.triggerPriceUI || "",
      triggerPriceUsd: props.triggerPriceUsd,
    };
  }, [
    props.srcToken,
    props.dstToken,
    props.orderType,
    props.createdAt,
    props.deadline,
    props.totalTrades,
    props.tradeInterval,
    props.account,
    props.srcAmount,
    props.srcAmountUI,
    props.srcAmountUsd,
    props.dstAmount,
    props.dstAmountUI,
    props.dstAmountUsd,
    props.limitPrice,
    props.limitPriceUI,
    props.limitPriceUsd,
    props.srcAmountPerTrade,
    props.srcAmountPerTradeUI,
    props.srcAmountPerTradeUsd,
    props.minDestAmountPerTrade,
    props.minDestAmountPerTradeUI,
    props.minDestAmountPerTradeUsd,
    dstMinAmount,
    dstMinAmountUI,
    dstMinAmountUsd,
    props.triggerPrice,
    props.triggerPriceUI,
    props.triggerPriceUsd,
  ]);
};
