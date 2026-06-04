import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  type UrlUpdateType,
} from "use-query-params";
import { SwapType } from "../types";
import { useChainId } from "wagmi";
import { useCallback, useMemo } from "react";
import { getDefaultTokensForChain } from "../utils";

export const useSwapParams = () => {
  const [swapParams, setSwapParams] = useQueryParams({
    chainId: NumberParam,
    inputCurrency: StringParam,
    outputCurrency: StringParam,
  });

  const connectedChainId = useChainId();
  const [swapType, setSwapType] = useQueryParam("swapType", StringParam);
  const [envMode, setEnvMode] = useQueryParam("env", StringParam);
  const selectedChainId = swapParams.chainId ?? undefined;
  const chainId = selectedChainId ?? connectedChainId;

  const defaultTokens = useMemo(() => {
    if (!chainId) return undefined;

    return getDefaultTokensForChain(chainId);
  }, [chainId]);

  const queryInputCurrency = swapParams.inputCurrency ?? undefined;
  const queryOutputCurrency = swapParams.outputCurrency ?? undefined;
  const effectiveInput = queryInputCurrency || defaultTokens?.input;
  const effectiveOutput = queryOutputCurrency || defaultTokens?.output;

  const setInputCurrency = useCallback(
    (inputCurrency: string) => {
      setSwapParams({ inputCurrency }, "replaceIn");
    },
    [setSwapParams],
  );
  const setOutputCurrency = useCallback(
    (outputCurrency: string) => {
      setSwapParams({ outputCurrency }, "replaceIn");
    },
    [setSwapParams],
  );

  const toggleCurrencies = useCallback(() => {
    const nextCurrencies = {
      inputCurrency: effectiveOutput,
      outputCurrency: effectiveInput,
    };
    setSwapParams(nextCurrencies, "replaceIn");
  }, [effectiveInput, effectiveOutput, setSwapParams]);

  const setCurrencies = useCallback(
    (
      currencies: {
        inputCurrency?: string;
        outputCurrency?: string;
      },
      updateType: UrlUpdateType = "replaceIn",
    ) => {
      setSwapParams(currencies, updateType);
    },
    [setSwapParams],
  );

  const setSelectedChainId = useCallback(
    (nextChainId?: number, updateType: UrlUpdateType = "replaceIn") => {
      setSwapParams({ chainId: nextChainId }, updateType);
    },
    [setSwapParams],
  );

  const setSelectedChainIdAndClearCurrencies = useCallback(
    (nextChainId: number, updateType: UrlUpdateType = "replaceIn") => {
      setSwapParams(
        {
          chainId: nextChainId,
          inputCurrency: undefined,
          outputCurrency: undefined,
        },
        updateType,
      );
    },
    [setSwapParams],
  );

  return {
    inputCurrency: effectiveInput,
    setInputCurrency,
    outputCurrency: effectiveOutput,
    setOutputCurrency,
    swapType: (swapType || SwapType.SWAP) as SwapType,
    setSwapType,
    toggleCurrencies,
    setCurrencies,
    chainId,
    queryChainId: selectedChainId,
    setSelectedChainId,
    setSelectedChainIdAndClearCurrencies,
    envMode: (envMode === "dev" ? "dev" : "prod") as "prod" | "dev",
    setEnvMode,
  };
};
