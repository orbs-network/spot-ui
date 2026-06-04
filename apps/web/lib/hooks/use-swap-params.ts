import { StringParam, useQueryParam, useQueryParams } from "use-query-params";
import { SwapType } from "../types";
import { useConnection } from "wagmi";
import { useCallback, useMemo } from "react";
import { getDefaultTokensForChain } from "../utils";
import { getPartners } from "@orbs-network/spot-ui";
import { DEFAULT_CHAIN_ID, DEFAULT_PARTNER } from "../consts";
import { usePathname } from "next/navigation";

const partners = getPartners();
const INPUT_CURRENCY_PARAM = "inputCurrency";
const OUTPUT_CURRENCY_PARAM = "outputCurrency";

const replaceCurrencyParamsInUrl = (params: {
  inputCurrency?: string;
  outputCurrency?: string;
}) => {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  if (params.inputCurrency) {
    url.searchParams.set(INPUT_CURRENCY_PARAM, params.inputCurrency);
  } else {
    url.searchParams.delete(INPUT_CURRENCY_PARAM);
  }

  if (params.outputCurrency) {
    url.searchParams.set(OUTPUT_CURRENCY_PARAM, params.outputCurrency);
  } else {
    url.searchParams.delete(OUTPUT_CURRENCY_PARAM);
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
};

const getCurrencyParamsFromUrl = () => {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);

  return {
    inputCurrency: params.get(INPUT_CURRENCY_PARAM) ?? undefined,
    outputCurrency: params.get(OUTPUT_CURRENCY_PARAM) ?? undefined,
  };
};

export const useSwapParams = () => {
  const pathname = usePathname();
  const isUtilaPage = pathname.startsWith("/utila");
  const [currencies, setCurrencies] = useQueryParams({
    inputCurrency: StringParam,
    outputCurrency: StringParam,
  });
  const [swapType, setSwapType] = useQueryParam("swapType", StringParam);
  const [partner, setPartner] = useQueryParam("partner", StringParam);
  const [envMode, setEnvMode] = useQueryParam("env", StringParam);

  const { chainId } = useConnection();
  const selectedPartner = useMemo(() => {
    const p = partners.find((it) => {
      const value = `${it.name}_${it.chainId}`;
      return value === partner;
    });
    return p
      ? `${p.name}_${p.chainId}`
      : `${DEFAULT_PARTNER}_${DEFAULT_CHAIN_ID}`;
  }, [partner]);
  const targetChainId = selectedPartner?.split("_")[1];
  const defaultTokenChainId =
    isUtilaPage && targetChainId ? Number(targetChainId) : chainId;
  const defaultTokens = useMemo(() => {
    return getDefaultTokensForChain(defaultTokenChainId);
  }, [defaultTokenChainId]);

  const queryInputCurrency = currencies.inputCurrency ?? undefined;
  const queryOutputCurrency = currencies.outputCurrency ?? undefined;
  const effectiveInput = isUtilaPage
    ? queryInputCurrency
    : queryInputCurrency || defaultTokens?.input;
  const effectiveOutput = isUtilaPage
    ? queryOutputCurrency
    : queryOutputCurrency || defaultTokens?.output;

  const setInputCurrency = useCallback(
    (inputCurrency: string) => {
      if (isUtilaPage) {
        const nextCurrencies = {
          ...getCurrencyParamsFromUrl(),
          inputCurrency,
        };

        replaceCurrencyParamsInUrl(nextCurrencies);
        setCurrencies(nextCurrencies, "replaceIn");
        return;
      }

      setCurrencies({ inputCurrency }, "replaceIn");
    },
    [isUtilaPage, setCurrencies]
  );
  const setOutputCurrency = useCallback(
    (outputCurrency: string) => {
      if (isUtilaPage) {
        const nextCurrencies = {
          ...getCurrencyParamsFromUrl(),
          outputCurrency,
        };

        replaceCurrencyParamsInUrl(nextCurrencies);
        setCurrencies(nextCurrencies, "replaceIn");
        return;
      }

      setCurrencies({ outputCurrency }, "replaceIn");
    },
    [isUtilaPage, setCurrencies]
  );

  const toggleCurrencies = useCallback(() => {
    const nextCurrencies = {
      inputCurrency: effectiveOutput,
      outputCurrency: effectiveInput,
    };

    if (isUtilaPage) {
      replaceCurrencyParamsInUrl(nextCurrencies);
    }

    setCurrencies(
      nextCurrencies,
      "replaceIn",
    );
  }, [effectiveInput, effectiveOutput, isUtilaPage, setCurrencies]);

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
    setCurrencies,
    parsedPartner: selectedPartner?.split("_")[0],
    envMode: (envMode === "dev" ? "dev" : "prod") as "prod" | "dev",
    setEnvMode,
    targetChainId,
  };
};
