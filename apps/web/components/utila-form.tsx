"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UtilaSpotForm } from "@/components/utila/form/spot-form";
import {
  UTILA_SPOT_TABS,
  UtilaNotice,
  UtilaTabs,
} from "@/components/utila/form/shared";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { SwapType } from "@/lib/types";

export function UtilaForm() {
  const { handleSwapTypeChange } = useActionHandlers();
  const { swapType: querySwapType } = useSwapParams();
  const hasClearedInitialCurrenciesRef = useRef(false);
  const [swapType, setSwapType] = useState<SwapType>(() =>
    UTILA_SPOT_TABS.some((tab) => tab.value === querySwapType)
      ? querySwapType
      : SwapType.SWAP,
  );

  useEffect(() => {
    document.body.classList.remove("dark");
    document.body.classList.add("utila-mode");

    return () => {
      document.body.classList.remove("utila-mode");
      document.body.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    if (hasClearedInitialCurrenciesRef.current) return;

    hasClearedInitialCurrenciesRef.current = true;
    const url = new URL(window.location.href);

    url.searchParams.delete("inputCurrency");
    url.searchParams.delete("outputCurrency");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const onTabChange = useCallback(
    (next: SwapType) => {
      setSwapType(next);
      handleSwapTypeChange(next);
    },
    [handleSwapTypeChange],
  );

  return (
    <main className="min-h-[calc(100dvh-104px)] w-full min-w-0 bg-white text-[#3f4361] md:ml-[230px] md:min-h-[calc(100vh-64px)] md:w-[calc(100vw-230px)]">
      <UtilaNotice />
      <section className="mx-auto flex w-full min-w-0 max-w-[1200px] justify-center px-3 sm:px-6">
        <div className="mt-4 mb-16 flex w-full min-w-0 max-w-[630px] flex-col gap-3 sm:mt-6 sm:mb-20 sm:gap-4">
          <UtilaTabs onChange={onTabChange} value={swapType} />
          <UtilaSpotForm swapType={swapType} />
        </div>
      </section>
    </main>
  );
}
