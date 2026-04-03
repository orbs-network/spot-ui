/**
 * Spot Form Skeleton
 *
 * Copy this file into your DEX and replace placeholders with real DEX components.
 * Search for "DEX:" comments to find what needs replacing.
 */

import React, { useMemo, useCallback, useState } from "react";
import {
  SpotProvider,
  Module,
  Partners,
  type Token,
  useDstTokenPanel,
  useDurationPanel,
  useTradesPanel,
  useFillDelayPanel,
  useSubmitOrderPanel,
  useSubmitOrderButton,
  useDerivedOrder,
  useFormatNumber,
} from "@orbs-network/spot-react";

// ============ DEX: Replace these with your DEX imports ============
// import { Button } from "../ui/button";
// import { Tooltip } from "../ui/tooltip";
// import { Dialog, DialogContent } from "../ui/dialog";
// import { Switch } from "../ui/switch";
// import { NumericInput } from "../ui/numeric-input";
// import { CurrencyInputPanel } from "../currency-input-panel";

// ============ Section Components ============

function DurationSection() {
  const panel = useDurationPanel();
  return (
    <div>
      {/* DEX: Add your own label, e.g. "Expiry" */}
      <input
        type="number"
        value={panel.duration.value}
        onChange={(e) => panel.onInputChange(e.target.value)}
      />
      <select
        value={panel.duration.unit}
        onChange={(e) => panel.onUnitSelect(Number(e.target.value))}
      >
        <option value={60000}>Minutes</option>
        <option value={3600000}>Hours</option>
        <option value={86400000}>Days</option>
      </select>
    </div>
  );
}

function TradeSizeSection() {
  const panel = useTradesPanel();
  return (
    <div>
      {/* DEX: Add your own label, e.g. "Trades" */}
      <input
        type="number"
        value={panel.totalTrades}
        onChange={(e) => panel.onChange(Number(e.target.value))}
      />
      {panel.amountPerTradeUsd && <span>${panel.amountPerTradeUsd} per trade</span>}
    </div>
  );
}

function TradeIntervalSection() {
  const panel = useFillDelayPanel();
  return (
    <div>
      {/* DEX: Add your own label, e.g. "Trade Interval" */}
      <input
        type="number"
        value={panel.fillDelay.value}
        onChange={(e) => panel.onInputChange(e.target.value)}
      />
      <select
        value={panel.fillDelay.unit}
        onChange={(e) => panel.onUnitSelect(Number(e.target.value))}
      >
        <option value={60000}>Minutes</option>
        <option value={3600000}>Hours</option>
        <option value={86400000}>Days</option>
      </select>
    </div>
  );
}

function SubmitOrderSection({ setInputAmount }: { setInputAmount: (v: string) => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const submitPanel = useSubmitOrderPanel();
  const submitButton = useSubmitOrderButton();
  const order = useDerivedOrder();
  const [accepted, setAccepted] = useState(false);

  // DEX: Replace with your ConnectWallet / SwitchNetwork checks

  const onClose = useCallback(() => {
    setIsModalOpen(false);
    setTimeout(() => {
      submitPanel.resetState();
      if (submitPanel.isSuccess) {
        setInputAmount("");
      }
    }, 500);
  }, [submitPanel.resetState, submitPanel.isSuccess, setInputAmount]);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={submitButton.disabled}
      >
        {submitButton.text}
      </button>

      {isModalOpen && (
        <div className="modal">
          {/* DEX: Replace with your Dialog/Modal component */}

          {submitPanel.parsedError ? (
            <div>
              <p>Error: {submitPanel.parsedError.message}</p>
              <button onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              {/* DEX: Build order review UI using:
                - order.srcAmountUI, order.dstAmountUI (amounts)
                - order.limitPriceUI, order.triggerPriceUI (prices)
                - order.totalTrades, order.sizePerTradeUI (trade config)
                - order.deadline, order.tradeInterval (timing)
                - order.feesAmount, order.feesPercentage (fees)
                - submitPanel.srcToken, submitPanel.dstToken (tokens)
              */}

              {/* Swap progress: submitPanel.status, submitPanel.step,
                  submitPanel.stepIndex, submitPanel.totalSteps,
                  submitPanel.wrapTxHash, submitPanel.approveTxHash */}

              {!submitPanel.status && (
                <>
                  <label>
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                    Accept disclaimer
                  </label>
                  <button onClick={onClose}>Cancel</button>
                  <button
                    onClick={submitPanel.onSubmit}
                    disabled={!accepted || Boolean(submitPanel.allowanceLoading)}
                  >
                    {submitPanel.allowanceLoading ? "Checking..." : "Create Order"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

// ============ Main Export ============

export function SpotForm({
  module,
  // DEX: Add your props (inputCurrency, outputCurrency, etc.)
}: {
  module: Module;
}) {
  // DEX: Replace with real values from your DEX state
  const marketReferencePrice = useMemo(() => ({
    value: "0",
    isLoading: false,
    noLiquidity: false,
  }), []);

  const srcToken = useMemo(() => undefined, []);
  const dstToken = useMemo(() => undefined, []);
  const callbacks = useMemo(() => ({
    // DEX: Wire callbacks for toasts and balance refetch
    onWrapSuccess: () => {
      // refetchBalances();
      // toast.success("Wrapped");
    },
    onOrdersProgressUpdate: () => {
      // refetchBalances();
    },
    onOrderCreated: () => {
      // toast.success("Order created");
    },
    onSubmitOrderFailed: () => {
      // toast.error("Failed");
    },
  }), []);

  // DEX: Replace with your input amount state
  const [inputAmount, setInputAmount] = useState("");

  return (
    <SpotProvider
      partner={Partners.Quick} // DEX: Replace with your partner
      module={module}
      priceProtection={3}
      minChunkSizeUsd={5}
      typedInputAmount={inputAmount}
      marketReferencePrice={marketReferencePrice}
      srcToken={srcToken}
      dstToken={dstToken}
      callbacks={callbacks}
      fees={0.25}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* DEX: Token inputs section using your CurrencyInputPanel */}
        {module === Module.TWAP && <TradeSizeSection />}
        {module === Module.TWAP && <TradeIntervalSection />}
        {module !== Module.TWAP && <DurationSection />}
        <SubmitOrderSection setInputAmount={setInputAmount} />
      </div>
    </SpotProvider>
  );
}
