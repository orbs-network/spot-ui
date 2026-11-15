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

  const handleToggleCurrencies = useCallback(() => {
    const current = useSwapStore.getState();
    if (current.independentField === Field.OUTPUT) current.setInputAmount(current.outputAmount);
    toggleCurrencies();
  }, [toggleCurrencies]);

  const handleInputCurrencyChange = useCallback(
    (currency: string) => {
      if (eqCompare(currency, outputCurrency ?? "")) {
        handleToggleCurrencies();
      } else {
        setInputCurrency(currency);
      }
    },
    [outputCurrency, setInputCurrency, handleToggleCurrencies]
  );

  const handleOutputCurrencyChange = useCallback(
    (currency: string) => {
      if (eqCompare(currency, inputCurrency ?? "")) {
        handleToggleCurrencies();
      } else {
        setOutputCurrency(currency);
      }
    },
    [inputCurrency, setOutputCurrency, handleToggleCurrencies]
  );

  const handleSwapTypeChange = useCallback(
    (swapType: TABS) => {
      const current = useSwapStore.getState();
      if (current.independentField === Field.OUTPUT) current.setInputAmount("");
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
    handleToggleCurrencies,
    handleSwapTypeChange,
    setInputAmount: store.setInputAmount,
    setOutputAmount: store.setOutputAmount,
  };
};
