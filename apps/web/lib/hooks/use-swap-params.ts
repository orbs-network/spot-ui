import {
  StringParam,
  useQueryParam,
  useQueryParams,
  type UrlUpdateType,
} from "use-query-params";
import { SwapType } from "../types";
import { useCallback, useMemo } from "react";
import { getDefaultTokensForChain } from "../utils";
import { useActiveConnection } from "./use-active-connection";

export const useSwapParams = () => {
  const [swapParams, setSwapParams] = useQueryParams({
    inputCurrency: StringParam,
    outputCurrency: StringParam,
  });

  const { chainId: connectedChainId } = useActiveConnection();
  const [swapType, setSwapType] = useQueryParam("swapType", StringParam);
  const [envMode, setEnvMode] = useQueryParam("env", StringParam);

  const defaultTokens = useMemo(() => {
    if (!connectedChainId) return undefined;

    return getDefaultTokensForChain(connectedChainId);
  }, [connectedChainId]);

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

  return {
    inputCurrency: effectiveInput,
    setInputCurrency,
    outputCurrency: effectiveOutput,
    setOutputCurrency,
    swapType: (swapType || SwapType.SWAP) as SwapType,
    setSwapType,
    toggleCurrencies,
    setCurrencies,
    chainId: connectedChainId,
    envMode: (envMode === "dev" ? "dev" : "prod") as "prod" | "dev",
    setEnvMode,
  };
};
