/**
 * Spot Form Skeleton
 *
 * Copy this file into your DEX and replace placeholders with real DEX components.
 * Search for "DEX:" comments to find what needs replacing.
 */

import { useMemo, useCallback, useState } from "react";
import {
  SpotProvider,
  Module,
  Partners,
  TimeUnit,
  useSpot,
  type Token,
  type WalletInteractions,
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

function PriceConfigSection({ module }: { module: Module }) {
  return (
    <div>
      <PriceHeader />
      {(module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) && (
        <TriggerPriceSection module={module} />
      )}
      <LimitPriceSection module={module} />
    </div>
  );
}

function PriceHeader() {
  const { onInvert, isInverted, fromToken, isMarketPrice } =
    useSpot().pricePanel;

  return (
    <div>
      <span>
        {isInverted ? "Buy" : "Sell"} {fromToken?.symbol}{" "}
        {isMarketPrice ? "at best rate" : "at rate"}
      </span>
      {!isMarketPrice && (
        <button type="button" onClick={onInvert}>
          Invert
        </button>
      )}
    </div>
  );
}

function LimitPriceSection({ module }: { module: Module }) {
  const {
    priceUI,
    onInputChange,
    percentage,
    onPercentageChange,
    isLimitPrice,
    toggleLimitPrice,
    onReset,
    invertedDstToken,
    isTypedValue,
    usd,
  } = useSpot().limitPricePanel;
  const showInput = module === Module.LIMIT || isLimitPrice;

  return (
    <div>
      {module !== Module.LIMIT && (
        <label>
          <input
            type="checkbox"
            checked={isLimitPrice}
            onChange={() => toggleLimitPrice()}
          />
          Limit price
        </label>
      )}
      {showInput && (
        <>
          {/* DEX: Replace with your price input and percentage controls */}
          <input
            type="number"
            value={isTypedValue ? priceUI : priceUI || ""}
            onChange={(e) => onInputChange(e.target.value)}
          />
          <span>{invertedDstToken?.symbol}</span>
          <input
            type="number"
            value={percentage || ""}
            onChange={(e) => onPercentageChange(e.target.value)}
          />
          {usd && <span>${usd}</span>}
          <button type="button" onClick={onReset}>
            Reset
          </button>
        </>
      )}
    </div>
  );
}

function TriggerPriceSection({ module }: { module: Module }) {
  const {
    priceUI,
    onInputChange,
    percentage,
    onPercentageChange,
    onReset,
    invertedDstToken,
    isTypedValue,
    usd,
  } = useSpot().triggerPricePanel;

  return (
    <div>
      {/* DEX: Translate as "Stop loss" or "Take profit" in your UI */}
      <label>
        {module === Module.STOP_LOSS
          ? "Stop-loss trigger"
          : "Take-profit trigger"}
      </label>
      <input
        type="number"
        value={isTypedValue ? priceUI : priceUI || ""}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <span>{invertedDstToken?.symbol}</span>
      <input
        type="number"
        value={percentage || ""}
        onChange={(e) => onPercentageChange(e.target.value)}
      />
      {usd && <span>${usd}</span>}
      <button type="button" onClick={onReset}>
        Reset
      </button>
    </div>
  );
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
  const {
    totalTrades,
    onChange,
    error,
    amountPerTradeUI,
    amountPerTradeUsd,
    fromToken,
  } = useSpot().tradesAmountPanel;

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
    isSuccess,
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
    if (isSuccess) {
      setInputAmount("");
      setTimeout(() => {
        resetState();
      }, 500);
    } else if (Boolean(status)) {
      setTimeout(() => {
        resetCurrentSwap();
      }, 500);
    }
  }, [isSuccess, resetCurrentSwap, resetState, setInputAmount, status]);

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

  const srcToken = useMemo<Token | undefined>(() => undefined, []);
  const dstToken = useMemo<Token | undefined>(() => undefined, []);
  const walletInteractions = useMemo<WalletInteractions>(
    () => ({
      // DEX: call the wrapped native token deposit method, wait for receipt, return tx hash.
      wrapNativeToken: async (_amountWei) => {
        throw new Error("DEX: implement wrapNativeToken");
      },
      // DEX: approve tokenAddress for spenderAddress. amount is the requested source amount in wei.
      approveToken: async (_props) => {
        throw new Error("DEX: implement approveToken");
      },
      // DEX: call the provided abi/function args on contractAddress, wait for receipt, return tx hash.
      cancelOrder: async (_props) => {
        throw new Error("DEX: implement cancelOrder");
      },
      // DEX: sign the supplied EIP-712 typed data and return the signature hex string.
      signOrder: async (_props) => {
        throw new Error("DEX: implement signOrder");
      },
      // DEX: read ERC-20 allowance for tokenAddress/spenderAddress and return the raw wei string.
      getAllowance: async (_props) => {
        throw new Error("DEX: implement getAllowance");
      },
    }),
    [],
  );
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
  // DEX: Replace these with wallet, chain, balance, and USD price state.
  const chainId = undefined;
  const account = undefined;
  const srcBalance = undefined;
  const dstBalance = undefined;
  const srcUsd1Token = undefined;
  const dstUsd1Token = undefined;

  return (
    <SpotProvider
      chainId={chainId}
      account={account}
      walletInteractions={walletInteractions}
      partner={Partners.Quick} // DEX: Replace with your partner
      module={module}
      priceProtection={3}
      minChunkSizeUsd={5}
      typedInputAmount={inputAmount}
      marketReferencePrice={marketReferencePrice}
      srcToken={srcToken}
      dstToken={dstToken}
      srcBalance={srcBalance}
      dstBalance={dstBalance}
      srcUsd1Token={srcUsd1Token}
      dstUsd1Token={dstUsd1Token}
      callbacks={callbacks}
      fees={0.25}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* DEX: Token inputs section using your CurrencyInputPanel */}
        <OutputAmount />
        <PriceConfigSection module={module} />
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
