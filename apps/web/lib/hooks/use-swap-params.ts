import { StringParam, useQueryParam, useQueryParams } from "use-query-params";
import { SwapType } from "../types";
import { useConnection } from "wagmi";
import { useCallback, useMemo } from "react";
import { getDefaultTokensForChain } from "../utils";
import { getPartners } from "@orbs-network/spot-ui";
import { DEFAULT_CHAIN_ID, DEFAULT_PARTNER } from "../consts";

const partners = getPartners();

export const useSwapParams = () => {
  const [currencies, setCurrencies] = useQueryParams({
    inputCurrency: StringParam,
    outputCurrency: StringParam,
  });
  const [swapType, setSwapType] = useQueryParam("swapType", StringParam);
  const [partner, setPartner] = useQueryParam("partner", StringParam);

  const { chainId } = useConnection();
  const defaultTokens = useMemo(() => {
    return getDefaultTokensForChain(chainId);
  }, [chainId]);

  const effectiveInput = currencies.inputCurrency || defaultTokens?.input;
  const effectiveOutput = currencies.outputCurrency || defaultTokens?.output;

  const setInputCurrency = useCallback(
    (inputCurrency: string) => {
      setCurrencies({ ...currencies, inputCurrency });
    },
    [currencies, setCurrencies]
  );
  const setOutputCurrency = useCallback(
    (outputCurrency: string) => {
      setCurrencies({ ...currencies, outputCurrency });
    },
    [currencies, setCurrencies]
  );

  const toggleCurrencies = useCallback(() => {
    setCurrencies({
      inputCurrency: effectiveOutput,
      outputCurrency: effectiveInput,
    });
  }, [effectiveInput, effectiveOutput, setCurrencies]);

  const selectedPartner = useMemo(() => {
    if(process.env.NEXT_PUBLIC_MODE === "prod") {
      return undefined
    }
    const p = partners.find((it) => {
      const value = `${it.partner}_${it.chainId}`;            
      return value === partner
    });
    return p ? `${p.partner}_${p.chainId}` : `${DEFAULT_PARTNER}_${DEFAULT_CHAIN_ID}`;
  }, [partner]);

  return {
    inputCurrency: effectiveInput,
    setInputCurrency,
    outputCurrency: effectiveOutput,
    setOutputCurrency,
    swapType: (swapType || SwapType.SWAP) as SwapType,
    setSwapType,
    toggleCurrencies,
    partner: selectedPartner,
    setPartner,
    setCurrencies
  };
};
