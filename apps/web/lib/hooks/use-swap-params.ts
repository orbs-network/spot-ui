import { StringParam, useQueryParam, useQueryParams } from "use-query-params";
import { SwapType } from "../types";
import { useActiveChainId } from "./use-active-chain-id";
import { useCallback, useMemo } from "react";
import { getDefaultTokensForChain } from "../utils";
import { parsePartner } from "../spot-partners";

const parsePositiveNumber = (
  value: string | null | undefined,
): number | undefined => {
  if (!value?.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

export const useSwapParams = () => {
  const [currencies, setCurrencies] = useQueryParams({
    inputCurrency: StringParam,
    outputCurrency: StringParam,
  });
  const [swapType, setSwapType] = useQueryParam("swapType", StringParam);
  const [partner, setPartner] = useQueryParam("partner", StringParam);
  // URL overrides: minimum trade size in USD, order duration in minutes.
  const [minTradeSize] = useQueryParam("minTradeSize", StringParam);
  const [duration] = useQueryParam("duration", StringParam);

  const chainId = useActiveChainId();
  const defaultTokens = useMemo(() => {
    return getDefaultTokensForChain(chainId);
  }, [chainId]);

  const effectiveInput = currencies.inputCurrency || defaultTokens?.input;
  const effectiveOutput = currencies.outputCurrency || defaultTokens?.output;

  const setInputCurrency = useCallback(
    (inputCurrency: string) => {
      setCurrencies({ ...currencies, inputCurrency });
    },
    [currencies, setCurrencies],
  );
  const setOutputCurrency = useCallback(
    (outputCurrency: string) => {
      setCurrencies({ ...currencies, outputCurrency });
    },
    [currencies, setCurrencies],
  );

  const toggleCurrencies = useCallback(() => {
    setCurrencies({
      inputCurrency: effectiveOutput,
      outputCurrency: effectiveInput,
    });
  }, [effectiveInput, effectiveOutput, setCurrencies]);

  const selectedPartner = parsePartner(partner);

  return {
    minTradeSizeUsd: parsePositiveNumber(minTradeSize),
    durationMinutes: parsePositiveNumber(duration),
    inputCurrency: effectiveInput,
    setInputCurrency,
    outputCurrency: effectiveOutput,
    setOutputCurrency,
    swapType: (swapType || SwapType.SWAP) as SwapType,
    setSwapType,
    toggleCurrencies,
    partner: selectedPartner,
    setPartner,
    setCurrencies,
    parsedPartner: selectedPartner,
  };
};
