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
  TimeUnit,
  useSpot,
  type Token,
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
} from "@orbs-network/spot-react";

// ============ DEX: Replace these with your DEX imports ============
// import { Button } from "../ui/button";
// import { Tooltip } from "../ui/tooltip";
// import { Dialog, DialogContent } from "../ui/dialog";
// import { Switch } from "../ui/switch";
// import { NumericInput } from "../ui/numeric-input";
// import { CurrencyInputPanel } from "../currency-input-panel";

// ============ Constants ============

const DURATION_OPTIONS = [
  { text: "Minutes", value: TimeUnit.Minutes },
  { text: "Hours", value: TimeUnit.Hours },
  { text: "Days", value: TimeUnit.Days },
];

// ============ Section Components ============

function OutputAmount() {
  const { value, isLoading } = useSpot().dstTokenPanel;
  if (isLoading) return <p>Loading quote...</p>;
  return <p>Estimated output: {value || "—"}</p>;
}

function DurationSection() {
  const { duration, onInputChange, onUnitSelect } = useSpot().durationPanel;
  return (
    <div>
      {/* DEX: Add your own label, e.g. "Expiry" */}
      <input
        type="number"
        value={duration.value || ""}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <select
        value={duration.unit}
        onChange={(e) => onUnitSelect(Number(e.target.value))}
      >
        {DURATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.text}
          </option>
        ))}
      </select>
    </div>
  );
}

function TradeSizeSection() {
  const { totalTrades, onChange, error, amountPerTradeUI, amountPerTradeUsd, fromToken } =
    useSpot().tradesAmountPanel;

  return (
    <div>
      {/* DEX: Add your own label, e.g. "Trades" */}
      <input
        type="number"
        value={totalTrades || ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {totalTrades > 1 && fromToken && (
        <span>
          {amountPerTradeUI} {fromToken.symbol} per trade (${amountPerTradeUsd})
        </span>
      )}
      {error && <p style={{ color: "red" }}>{error.type}</p>}
    </div>
  );
}

function TradeIntervalSection() {
  const { fillDelay, onInputChange, onUnitSelect } = useSpot().fillDelayPanel;
  return (
    <div>
      {/* DEX: Add your own label, e.g. "Trade Interval" */}
      <input
        type="number"
        value={fillDelay.value || ""}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <select
        value={fillDelay.unit}
        onChange={(e) => onUnitSelect(Number(e.target.value))}
      >
        {DURATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.text}
          </option>
        ))}
      </select>
    </div>
  );
}

function InputErrorPanel() {
  const error = useSpot().inputError;
  if (!error) return null;
  // DEX: Use your i18n system: t(error.type, error.args)
  return <p style={{ color: "red" }}>{error.type}</p>;
}

function DisclaimerPanel() {
  const disclaimer = useSpot().disclaimerPanel;
  if (!disclaimer) return null;
  // DEX: Use your i18n system: t(disclaimer)
  return (
    <p>
      {disclaimer}{" "}
      <a href={ORBS_TWAP_FAQ_URL} target="_blank" rel="noopener noreferrer">
        Learn more
      </a>
    </p>
  );
}

function SubmitOrderSection({
  setInputAmount,
}: {
  setInputAmount: (v: string) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { disabled, loading } = useSpot().submitOrderButton;
  const {
    onSubmit,
    status,
    resetCurrentSwap,
    resetState,
    parsedError,
    confirmButtonLoading,
  } = useSpot().orderExecutionPanel;
  const form = useSpot().derivedFormData;
  const [accepted, setAccepted] = useState(false);

  // DEX: Replace with your ConnectWallet / SwitchNetwork checks

  const onClose = useCallback(() => {
    setIsModalOpen(false);
    if (Boolean(status)) {
      setInputAmount("");
      setTimeout(() => {
        resetCurrentSwap();
        resetState();
      }, 500);
    }
  }, [resetCurrentSwap, resetState, setInputAmount, status]);

  return (
    <>
      <button onClick={() => setIsModalOpen(true)} disabled={disabled}>
        {loading ? "Loading..." : "Place Order"}
      </button>

      {isModalOpen && (
        <div className="modal">
          {/* DEX: Replace with your Dialog/Modal component */}

          {parsedError ? (
            <div>
              <p>Error: {parsedError.message}</p>
              <button onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              {/* Order review details from derivedFormData */}
              {!status && (
                <>
                  <p>
                    {form.srcAmountUI} → {form.dstAmountUI}
                  </p>
                  {form.limitPriceUI && <p>Limit: {form.limitPriceUI}</p>}
                  {form.triggerPriceUI && <p>Trigger: {form.triggerPriceUI}</p>}
                  <p>Trades: {form.totalTrades}</p>
                  <p>Deadline: {form.deadline}</p>
                  {form.feesPercentage && <p>Fees: {form.feesPercentage}%</p>}

                  <label>
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    Accept{" "}
                    <a
                      href={DISCLAIMER_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      disclaimer
                    </a>
                  </label>
                  <button onClick={onClose}>Cancel</button>
                  <button
                    onClick={onSubmit}
                    disabled={!accepted || Boolean(confirmButtonLoading)}
                  >
                    {confirmButtonLoading ? "Creating..." : "Create Order"}
                  </button>
                </>
              )}
              {/* Swap progress UI when status is set */}
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
  const marketReferencePrice = useMemo(
    () => ({
      value: "0",
      isLoading: false,
      noLiquidity: false,
    }),
    [],
  );

  const srcToken = useMemo(() => undefined, []);
  const dstToken = useMemo(() => undefined, []);
  const callbacks = useMemo(
    () => ({
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
    }),
    [],
  );

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
        <OutputAmount />
        {module === Module.TWAP && <TradeSizeSection />}
        {module === Module.TWAP && <TradeIntervalSection />}
        {module !== Module.TWAP && <DurationSection />}
        <InputErrorPanel />
        <DisclaimerPanel />
        <SubmitOrderSection setInputAmount={setInputAmount} />
      </div>
    </SpotProvider>
  );
}
