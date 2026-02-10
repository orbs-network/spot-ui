import { useMemo } from "react";
import { Token } from "../types";
import { useFormatNumber } from "./helper-hooks";
import { useTranslations } from "./use-translations";

type Props = {
  srcToken?: Token;
  dstToken?: Token;
  account?: string;
  limitPrice?: string;
  limitPriceUsd?: string;
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
};

export const useBuildOrderInfo = (props: Props) => {
  const t = useTranslations();

  const srcAmount = useFormatNumber({ value: props.srcAmount });
  const limitPrice = useFormatNumber({ value: props.limitPrice });
  const limitPriceUsd = useFormatNumber({ value: props.limitPriceUsd });
  const srcAmountPerTrade = useFormatNumber({ value: props.srcAmountPerTrade });
  const srcAmountPerTradeUsd = useFormatNumber({
    value: props.srcAmountPerTradeUsd,
    decimalScale: 2,
  });
  const dstMinAmountPerTrade = useFormatNumber({
    value: props.minDestAmountPerTrade,
  });
  const dstMinAmountPerTradeUsd = useFormatNumber({
    value: props.minDestAmountPerTradeUsd,
    decimalScale: 2,
  });
  const triggerPrice = useFormatNumber({
    value: props.triggerPrice,
  });
  const triggerPriceUsd = useFormatNumber({
    value: props.triggerPriceUsd,
    decimalScale: 2,
  });

  const srcUsd = useFormatNumber({ value: props.srcUsd, decimalScale: 2 });
  const dstUsd = useFormatNumber({ value: props.dstUsd, decimalScale: 2 });
  const dstAmount = useFormatNumber({ value: props.dstAmount });

  return useMemo(() => {
    return {
      srcToken: props.srcToken,
      dstToken: props.dstToken,
      srcUsd: srcUsd || "",
      dstUsd: dstUsd || "",
      limitPrice: {
        label: t("limitPrice"),
        tooltip: t("limitPriceTooltip"),
        value: limitPrice || "",
        usd: limitPriceUsd || "",
      },
      deadline: {
        tooltip: t("expirationTooltip"),
        label: t("expirationLabel"),
        value: props.deadline || 0,
      },
      srcAmount: {
        label: t("amountOut"),
        value: srcAmount || "",
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
        value: dstMinAmountPerTrade || "",
        usd: dstMinAmountPerTradeUsd,
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
    srcUsd,
    dstUsd,
    limitPrice,
    srcAmount,
    srcAmountPerTrade,
    srcAmountPerTradeUsd,
    dstMinAmountPerTrade,
    triggerPrice,
    triggerPriceUsd,
    limitPrice,
    limitPriceUsd,
    dstAmount,
    dstUsd,
    dstMinAmountPerTradeUsd,
  ]);
};
