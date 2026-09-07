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
  useDisclaimer,
  useDuration,
  useExecution,
  useFillDelay,
  useInputErrors,
  useLimitPrice,
  useOrderForm,
  useOutputAmount,
  usePriceDisplay,
  useSubmitButton,
  useTrades,
  useTriggerPrice,
  type ClientErrorFallbackProps,
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

function ClientErrorFallback({
  error,
  retry,
  isRetrying,
}: ClientErrorFallbackProps) {
  return (
    <div role="alert">
      {/* DEX: Translate and style this with the host error component. */}
      <p>{error.message}</p>
      <button type="button" disabled={isRetrying} onClick={retry}>
        {isRetrying ? "Retrying..." : "Retry"}
      </button>
    </div>
  );
}

// ============ Section Components ============

function OutputAmount() {
  const { amount, isLoading } = useOutputAmount();
  if (isLoading) return <p>Loading quote...</p>;
  return <p>Estimated output: {amount.ui || "—"}</p>;
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
  const { onInvert, isInverted, displayInputToken, isMarketOrder } =
    usePriceDisplay();

  return (
    <div>
      <span>
        {isInverted ? "Buy" : "Sell"} {displayInputToken?.symbol}{" "}
        {isMarketOrder ? "at best rate" : "at rate"}
      </span>
      {!isMarketOrder && (
        <button type="button" onClick={onInvert}>
          Invert
        </button>
      )}
    </div>
  );
}

function LimitPriceSection({ module }: { module: Module }) {
  const {
    price,
    onInputChange,
    percentage,
    onPercentageChange,
    isEnabled,
    toggle,
    onReset,
    displayOutputToken,
  } = useLimitPrice();
  const showInput = module === Module.LIMIT || isEnabled;

  return (
    <div>
      {module !== Module.LIMIT && (
        <label>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={() => toggle()}
          />
          Limit price
        </label>
      )}
      {showInput && (
        <>
          {/* DEX: Replace with your price input and percentage controls */}
          <input
            type="number"
            value={price.ui}
            onChange={(e) => onInputChange(e.target.value)}
          />
          <span>{displayOutputToken?.symbol}</span>
          <input
            type="number"
            value={percentage || "0"}
            onChange={(e) => onPercentageChange(e.target.value)}
          />
          {price.usd && <span>${price.usd}</span>}
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
    price,
    onInputChange,
    percentage,
    onPercentageChange,
    onReset,
    displayOutputToken,
  } = useTriggerPrice();

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
        value={price.ui}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <span>{displayOutputToken?.symbol}</span>
      <input
        type="number"
        value={percentage || "0"}
        onChange={(e) => onPercentageChange(e.target.value)}
      />
      {price.usd && <span>${price.usd}</span>}
      <button type="button" onClick={onReset}>
        Reset
      </button>
    </div>
  );
}

function DurationSection() {
  const { duration, onInputChange, onUnitSelect } =
    useDuration();
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
    inputAmountPerTrade,
    inputToken,
  } = useTrades();

  return (
    <div>
      {/* DEX: Add your own label, e.g. "Trades" */}
      <input
        type="number"
        value={totalTrades || ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {totalTrades > 1 && inputToken && (
        <span>
          {/* DEX: Prefer converting amountPerTrade to the DEX amount type before display. */}
          {inputAmountPerTrade.ui} {inputToken.symbol} per trade (${inputAmountPerTrade.usd})
        </span>
      )}
      {error && <p style={{ color: "red" }}>{error.type}</p>}
    </div>
  );
}

function TradeIntervalSection() {
  const { fillDelay, onInputChange, onUnitSelect } =
    useFillDelay();
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
  const error = useInputErrors();
  if (!error) return null;
  // DEX: Use your i18n system: t(error.type, formatErrorArgs(error.args))
  // error.args is an optional Record<string, string>. Current duration/fill-delay
  // args are human-readable, but keep custom formatting for older/custom errors.
  return <p style={{ color: "red" }}>{error.type}</p>;
}

function DisclaimerPanel() {
  const disclaimer = useDisclaimer();
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
  const { disabled, loading } = useSubmitButton();
  const {
    submitOrder,
    status,
    isSuccess,
    returnToOrderForm,
    startNewOrder,
    error,
    isPreparingOrder,
    isExecuting,
  } = useExecution();
  const form = useOrderForm();
  const [accepted, setAccepted] = useState(false);

  // DEX: Replace with your ConnectWallet / SwitchNetwork checks

  const onClose = useCallback(() => {
    if (isExecuting) return;
    setIsModalOpen(false);
    if (isSuccess) {
      setInputAmount("");
      setTimeout(() => {
        startNewOrder();
      }, 500);
    } else if (Boolean(status)) {
      setTimeout(() => {
        returnToOrderForm();
      }, 500);
    }
  }, [
    isExecuting,
    isSuccess,
    returnToOrderForm,
    setInputAmount,
    startNewOrder,
    status,
  ]);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
      >
        {loading ? "Loading..." : "Place Order"}
      </button>

      {isModalOpen && (
        <div className="modal">
          {/* DEX: Replace with your Dialog/Modal component */}

          {error ? (
            <div>
              <p>Error: {error.message}</p>
              <button onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              {/* Order review details from the authoritative calculated form */}
              {!status && (
                <>
                  <p>
                    {form.inputAmount.ui} → {form.outputAmount.ui}
                  </p>
                  {form.limitPrice.display.ui && (
                    <p>Limit: {form.limitPrice.display.ui}</p>
                  )}
                  {form.triggerPrice.display.ui && (
                    <p>Trigger: {form.triggerPrice.display.ui}</p>
                  )}
                  <p>Trades: {form.trades.totalTrades}</p>
                  <p>Duration: {form.schedule.durationMillis} ms</p>
                  {form.fees.percentage && (
                    <p>Fees: {form.fees.percentage}%</p>
                  )}

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
                    onClick={submitOrder}
                    disabled={!accepted || Boolean(isPreparingOrder)}
                  >
                    {isPreparingOrder ? "Creating..." : "Create Order"}
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

  const inputToken = useMemo<Token | undefined>(() => undefined, []);
  const outputToken = useMemo<Token | undefined>(() => undefined, []);
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
      // DEX: return the wallet's original 0x-prefixed EIP-712 signature unchanged.
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
        // Usually no toast: submit modal already shows success.
        // refetchBalances();
      },
      onOrderFilled: () => {
        // refetchBalances();
        // toast.success("Order filled");
      },
      onCancelOrderSuccess: () => {
        // refetchBalances();
        // toast.success("Order cancelled");
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
  const inputBalance = undefined;
  const inputUsd1Token = undefined;
  const outputUsd1Token = undefined;

  return (
    <SpotProvider
      chainId={chainId}
      account={account}
      walletInteractions={walletInteractions}
      partner={Partners.Quick} // DEX: Replace with your partner
      module={module}
      priceProtection={3}
      minTradeSizeUsd={5}
      typedInputAmount={inputAmount}
      marketReferencePrice={marketReferencePrice}
      inputToken={inputToken}
      outputToken={outputToken}
      inputBalance={inputBalance}
      inputUsd1Token={inputUsd1Token}
      outputUsd1Token={outputUsd1Token}
      callbacks={callbacks}
      clientErrorFallback={ClientErrorFallback}
      displayFeePercent={0.25}
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
