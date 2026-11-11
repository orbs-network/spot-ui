import { useCallback } from "react";
import { useSwapParams } from "./use-swap-params";
import { Field, TABS } from "../types";
import { useSwapStore } from "./store";
import { eqCompare } from "../utils";

export const useActionHandlers = () => {
  const {
    setInputCurrency,
    setOutputCurrency,
    inputCurrency,
    outputCurrency,
    setSwapType,
    toggleCurrencies,
  } = useSwapParams();
  const store = useSwapStore();

  const handleInputCurrencyChange = useCallback(
    (currency: string) => {
      if (eqCompare(currency, outputCurrency ?? "")) {
        toggleCurrencies();
      } else {
        setInputCurrency(currency);
      }
    },
    [outputCurrency, setInputCurrency, toggleCurrencies]
  );

  const handleOutputCurrencyChange = useCallback(
    (currency: string) => {
      if (eqCompare(currency, inputCurrency ?? "")) {
        toggleCurrencies();
      } else {
        setOutputCurrency(currency);
      }
    },
    [inputCurrency, setOutputCurrency, toggleCurrencies]
  );

  const handleSwapTypeChange = useCallback(
    (swapType: TABS) => {
      setSwapType(swapType);
    },
    [setSwapType]
  );

  const handleCurrencyChange = useCallback(
    (currency: string, field: Field) => {
      if (field === Field.INPUT) {
        handleInputCurrencyChange(currency);
      } else {
        handleOutputCurrencyChange(currency);
      }
    },
    [handleInputCurrencyChange, handleOutputCurrencyChange]
  );

  return {
    handleCurrencyChange,
    handleToggleCurrencies: toggleCurrencies,
    handleSwapTypeChange,
    setInputAmount: store.setInputAmount,
  };
};
