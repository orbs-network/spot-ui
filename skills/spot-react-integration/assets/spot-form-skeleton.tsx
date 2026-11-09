/**
 * Advanced Orders Form Skeleton
 *
 * Copy this file into your DEX and replace placeholders with real DEX components.
 * Search for "DEX:" comments to find what needs replacing.
 */

import { useEffect, useMemo, useCallback, useState } from "react";
import {
  AdvancedOrdersProvider,
  Module,
  Partners,
  TimeUnit,
  useDisclaimer,
  useDuration,
  useExecution,
  useFillDelay,
  useInputErrors,
  useLimitPrice,
  useOutputAmount,
  usePriceDisplay,
  useSubmitButton,
  useTrades,
  useTriggerPrice,
  type ClientErrorFallbackProps,
  type AdvancedOrderModule,
  type MarketQuote,
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

// DEX: Register these defaults in your i18n resources (see 03-panels.md).
const DISCLAIMER_DEFAULTS = {
  marketOrderDisclaimer:
    "Each individual trade in this order will be filled at the current market price at the time of execution.",
  limitOrderDisclaimer:
    "Limit orders may not execute when the token's price is equal or close to the limit price, due to gas and standard swap fees.",
  triggerMarketPriceDisclaimer:
    "In extreme market movements, slippage may occur and the executed price of the market order may be worse than the specified trigger price.",
};

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

function PriceConfigSection({ module }: { module: AdvancedOrderModule }) {
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

function LimitPriceSection({ module }: { module: AdvancedOrderModule }) {
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

function TriggerPriceSection({ module }: { module: AdvancedOrderModule }) {
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
  // DEX: Use t(disclaimer), falling back to this English default when the
  // translation is missing, empty/whitespace-only, or returns the key itself.
  return (
    <p>
      {DISCLAIMER_DEFAULTS[disclaimer]}{" "}
      <a href={ORBS_TWAP_FAQ_URL} target="_blank" rel="noopener noreferrer">
        Learn more
      </a>
    </p>
  );
}

function SubmitOrderSection({
  setInputAmount,
  onQuotePauseChange,
}: {
  setInputAmount: (v: string) => void;
  onQuotePauseChange: (paused: boolean) => void;
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
    isUnconfirmed,
    canDismiss,
    resumeTracking,
    orderId,
    account,
    chainId,
  } = useExecution();
  const [accepted, setAccepted] = useState(true);

  useEffect(() => {
    // DEX: Disable automatic/manual quotes AND cancel in-flight quote requests.
    onQuotePauseChange(isExecuting);
    return () => onQuotePauseChange(false);
  }, [isExecuting, onQuotePauseChange]);

  // DEX: Replace with your ConnectWallet / SwitchNetwork checks

  const onClose = useCallback(() => {
    if (!canDismiss) return;
    setIsModalOpen(false);
    if (isUnconfirmed) return;
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
    canDismiss,
    isSuccess,
    isUnconfirmed,
    returnToOrderForm,
    setInputAmount,
    startNewOrder,
    status,
  ]);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={!isUnconfirmed && disabled}
      >
        {isUnconfirmed ? "Check previous order" : loading ? "Loading..." : "Place Order"}
      </button>

      {isModalOpen && (
        <div className="modal">
          {/* DEX: Replace with your Dialog/Modal component */}

          {isUnconfirmed ? (
            <div role="status">
              <p>{error?.message || "Order status needs confirmation."}</p>
              {orderId && <p>Order: {orderId}</p>}
              <p>Account: {account} · Chain: {chainId}</p>
              <button type="button" onClick={resumeTracking}>Check order status</button>
              <button type="button" onClick={onClose}>Close</button>
            </div>
          ) : error ? (
            <div>
              <p>Error: {error.message}</p>
              <button onClick={onClose} disabled={!canDismiss}>Close</button>
            </div>
          ) : (
            <>
              {/* Order review details from the authoritative calculated form */}
              {(!status || isPreparingOrder) && (
                <>
                  {/* DEX: Render review rows per references/03-panels.md:
                      recipient explorer link; abbreviated ID when available;
                      Individual trade size and trade count only for >1 trade;
                      expiry as a date/time;
                      min output for limit execution;
                      trigger price only for SL/TP. Use DEX amount/date formatters.
                      Build a DEX-owned OrderReviewDetails component using
                      useOrderForm() and the DEX account/chain context. */}

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
                  {!isExecuting && <button onClick={onClose}>Cancel</button>}
                  <button
                    onClick={submitOrder}
                    disabled={!accepted || disabled || Boolean(isPreparingOrder)}
                  >
                    {/* DEX: Replace loading text with your button spinner. */}
                    {isPreparingOrder ? "Loading..." : "Create Order"}
                  </button>
                </>
              )}
              {/* DEX: Render SwapFlow when status is set and !isPreparingOrder.
                  Hide close/dismiss while isExecuting. Render UNCONFIRMED above
                  as recovery, with no fresh submit/reset. Creation succeeds on
                  confirmed acceptance. */}
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
  marketQuote,
  onQuotePauseChange,
  // DEX: Add your props (inputCurrency, outputCurrency, etc.)
}: {
  module: AdvancedOrderModule;
  /** DEX: Supply current raw/USD quote fields or an original SDK quote for valuation. */
  marketQuote: MarketQuote;
  /** DEX: Stable callback controlling automatic/manual refresh and cancellation. */
  onQuotePauseChange: (paused: boolean) => void;
}) {
  // DEX: supply the selected input and its balance. For native selections,
  // provide wrappedNativeToken and return true from shouldWrap for execution-time wrapping.
  const inputToken = useMemo<Token | undefined>(() => undefined, []);
  const outputToken = useMemo<Token | undefined>(() => undefined, []);
  const wrappedNativeToken = useMemo<Token | undefined>(() => undefined, []);
  const walletInteractions = useMemo<WalletInteractions>(
    () => ({
      // DEX: decide from the captured selected input/account/chain; this callback takes no arguments.
      shouldWrap: () => {
        throw new Error("DEX: implement shouldWrap (true for native input, false for ERC-20 input)");
      },
      // DEX: deposit into this chain's wrapped contract; wait for a successful receipt.
      wrapNativeToken: async (_amountRaw) => {
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
      // DEX: read the connected account's wrapped-token balance for safe completed-wrap retries.
      getTokenBalance: async (_props) => {
        throw new Error("DEX: implement getTokenBalance");
      },
    }),
    [],
  );
  const callbacks = useMemo(
    () => ({
      // DEX: Wire callbacks for toasts and balance refetch
      onWrapSuccess: () => {
        // refetchBalances();
      },
      onOrdersProgressUpdate: () => {
        // refetchBalances();
      },
      onOrderCreated: () => {
        // Advanced-order creation succeeds at acceptance; fills appear in history.
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
  const inputBalanceRaw = undefined;
  const inputTokenUsdPrice = undefined;
  const outputTokenUsdPrice = undefined;

  return (
    <AdvancedOrdersProvider
      chainId={chainId}
      account={account}
      walletInteractions={walletInteractions}
      partner={Partners.Quick} // DEX: Replace with your partner
      module={module}
      priceProtectionPercent={3}
      minTradeSizeUsd={5}
      inputAmountUi={inputAmount}
      marketQuote={marketQuote}
      inputToken={inputToken}
      outputToken={outputToken}
      wrappedNativeToken={wrappedNativeToken}
      inputBalanceRaw={inputBalanceRaw}
      inputTokenUsdPrice={inputTokenUsdPrice}
      outputTokenUsdPrice={outputTokenUsdPrice}
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
        <SubmitOrderSection setInputAmount={setInputAmount} onQuotePauseChange={onQuotePauseChange} />
      </div>
    </AdvancedOrdersProvider>
  );
}
