import { useMemo } from "react";
import { OrderType, Token } from "../types";
import { useTranslations } from "./use-translations";
import BN from "bignumber.js";

type Props = {
  srcToken?: Token;
  dstToken?: Token;
  account?: string;
  limitPrice?: string;
  limitPriceUsd?: string;
  createdAt?: number;
  deadline?: number;
  srcAmount?: string;
  dstAmount?: string;
  srcAmountPerTrade?: string;
  srcAmountPerTradeUsd?: string;
  totalTrades?: number;
  minDestAmountPerTrade?: string;
  minDestAmountPerTradeUsd?: string;
  tradeInterval?: number;
  triggerPrice?: string;
  triggerPriceUsd?: string;
  srcUsd?: string;
  dstUsd?: string;
  orderType?: OrderType;
};

export const useBuildOrderInfo = (props: Props) => {
  const t = useTranslations();

  const limitPriceUsd = props.limitPriceUsd
  const srcAmountPerTrade = props.srcAmountPerTrade
  const srcAmountPerTradeUsd = props.srcAmountPerTradeUsd


  const dstMinAmount = useMemo(() => {
    if(!props.minDestAmountPerTrade || !props.totalTrades) return "";
    return BN(props.minDestAmountPerTrade).multipliedBy(props.totalTrades).decimalPlaces(0).toFixed();
  }, [props.minDestAmountPerTrade, props.totalTrades])


  const dstMinAmountUsd = useMemo(() => {
    if(! props.minDestAmountPerTradeUsd || !props.totalTrades) return "";
    return BN( props.minDestAmountPerTradeUsd).multipliedBy(props.totalTrades).decimalPlaces(2).toFixed();
  }, [ props.minDestAmountPerTradeUsd, props.totalTrades])

  const triggerPrice = props.triggerPrice
  const triggerPriceUsd = props.triggerPriceUsd

  const srcUsd = props.srcUsd
  const dstUsd = props.dstUsd
  const dstAmount = props.dstAmount

  return useMemo(() => {
    return {
      srcToken: props.srcToken,
      dstToken: props.dstToken,
      srcUsd: srcUsd || "",
      dstUsd: dstUsd || "",
      orderType: props.orderType,
      dstMinAmount,
      dstMinAmountUsd,
      limitPrice: {
        label: t("limitPrice"),
        tooltip: t("limitPriceTooltip"),
        value: props.limitPrice || "",
        usd: limitPriceUsd || "",
      },
      deadline: {
        tooltip: t("expirationTooltip"),
        label: t("expirationLabel"),
        value: props.deadline || 0,
      },
      createdAt: {
        label: t("createdAt"),
        value: props.createdAt || 0,
      },
      srcAmount: {
        label: t("amountOut"),
        value: props.srcAmount || "",
        usd: srcUsd || "",
      },
      dstAmount: {
        value: dstAmount || "",
        usd: dstUsd || "",
      },
      sizePerTrade: {
        tooltip: t("tradeSizeTooltip"),
        label: t("individualTradeSize"),
        value: srcAmountPerTrade || "",
        usd: srcAmountPerTradeUsd,
      },
      totalTrades: {
        tooltip: t("totalTradesTooltip"),
        label: t("numberOfTrades"),
        value: props.totalTrades || 0,
      },
      minDestAmountPerTrade: {
        tooltip: t("minDstAmountTooltip"),
        label: t(props.totalTrades && props.totalTrades > 1 ? "minReceivedPerTrade" : "minReceived"),
        value: props.minDestAmountPerTrade || "",
        usd: props.minDestAmountPerTradeUsd,
      },
      tradeInterval: {
        tooltip: t("tradeIntervalTooltip"),
        label: t("tradeIntervalLabel"),
        value: props.tradeInterval || 0,
      },
      triggerPrice: {
        tooltip: t("triggerPriceTooltip"),
        label: t("triggerPrice"),
        value: triggerPrice || "",
        usd: triggerPriceUsd,
      },
      recipient: {
        label: t("recipient"),
        value: props.account || "",
      },
    };
  }, [
    t,
    props.srcToken,
    props.dstToken,
    srcUsd,
    dstUsd,
    props.orderType,
    dstMinAmount,
    dstMinAmountUsd,
    props.limitPrice,
    limitPriceUsd,
    props.deadline,
    props.srcAmount,
    dstAmount,
    srcAmountPerTrade,
    srcAmountPerTradeUsd,
    props.totalTrades,
    props.minDestAmountPerTrade,
    props.minDestAmountPerTradeUsd,
    props.tradeInterval,
    triggerPrice,
    triggerPriceUsd,
    props.account,
    props.createdAt,
  ]);
};
