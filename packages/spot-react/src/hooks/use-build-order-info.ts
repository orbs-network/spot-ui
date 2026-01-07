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
  triggerPricePerTrade?: string;
  triggerPricePerTradeUsd?: string;
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
  const triggerPricePerChunk = useFormatNumber({
    value: props.triggerPricePerTrade,
  });
  const triggerPricePerChunkUsd = useFormatNumber({
    value: props.triggerPricePerTradeUsd,
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
        tooltip: t("tradeIntervalTootlip"),
        label: t("tradeIntervalLabel"),
        value: props.tradeInterval || 0,
      },
      triggerPricePerTrade: {
        tooltip: t("triggerPriceTooltip"),
        label: t(props.totalTrades && props.totalTrades > 1 ? "triggerPricePerChunk" : "triggerPrice"),
        value: triggerPricePerChunk || "",
        usd: triggerPricePerChunkUsd,
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
    triggerPricePerChunk,
    triggerPricePerChunkUsd,
    limitPrice,
    limitPriceUsd,
    dstAmount,
    dstUsd,
    dstMinAmountPerTradeUsd,
  ]);
};
