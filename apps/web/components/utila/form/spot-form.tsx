"use client";

import { SwapType } from "@/lib/types";
import { UtilaSubmitOrder } from "./order-submit";
import {
  UtilaAvailableQuotesPanel,
  UtilaDisclaimer,
  UtilaInputError,
  UtilaModuleInputs,
  UtilaPrices,
  UtilaProtectionPanel,
} from "./strategy-panels";
import { UtilaSubmitSwap, UtilaSwapValidationError } from "./swap-submit";
import { UtilaTokenPanel, UtilaToggleCurrencies } from "./token-panels";

export const UtilaSpotForm = ({ swapType }: { swapType: SwapType }) => {
  const isSwap = swapType === SwapType.SWAP;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <UtilaTokenPanel isSrcToken />
        <UtilaToggleCurrencies />
        <UtilaTokenPanel isSrcToken={false} />
      </div>
      {!isSwap && (
        <>
          <UtilaPrices />
          <UtilaModuleInputs />
        </>
      )}
      <UtilaProtectionPanel isSwap={isSwap} />
      {isSwap && <UtilaAvailableQuotesPanel />}
      {isSwap ? (
        <>
          <UtilaSwapValidationError />
          <UtilaSubmitSwap />
        </>
      ) : (
        <>
          <UtilaInputError />
          <UtilaSubmitOrder />
          <UtilaDisclaimer />
        </>
      )}
    </div>
  );
};
