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
  Components,
  type ButtonProps,
  type TooltipProps,
  type TokenLogoProps,
  type Token,
  useDstTokenPanel,
  useDurationPanel,
  useTradesPanel,
  useFillDelayPanel,
  useSubmitOrderPanel,
  useSubmitOrderButton,
  useLimitPricePanel,
  useTriggerPricePanel,
  useInvertTradePanel,
  useDisclaimerPanel,
  useInputErrors,
  usePartnerChains,
  useFormatNumber,
} from "@orbs-network/spot-react";

// ============ DEX: Replace these with your DEX imports ============
// import { Button } from "../ui/button";
// import { Tooltip } from "../ui/tooltip";
// import { Dialog, DialogContent } from "../ui/dialog";
// import { Switch } from "../ui/switch";
// import { NumericInput } from "../ui/numeric-input";
// import { CurrencyInputPanel } from "../currency-input-panel";
// import { useCurrency } from "../../hooks/use-currency";

// ============ Component Wrappers ============

// DEX: Wire these to your actual DEX components
const SpotButton: React.FC<ButtonProps> = ({ children, onClick, disabled, loading }) => (
  <button onClick={onClick} disabled={disabled}>
    {loading ? "Loading..." : children}
  </button>
);

const SpotTooltip: React.FC<TooltipProps> = ({ children, tooltipText }) => (
  <span title={tooltipText}>{children}</span>
);

const SpotTokenLogo: React.FC<TokenLogoProps> = ({ token, className }) => (
  <img src={token?.logoUrl} alt={token?.symbol} className={className} width={24} height={24} />
);

// ============ useToken Hook ============

// DEX: Replace with your token lookup
const useTokenByAddress = (address?: string): Token | undefined => {
  // const currency = useCurrency(address);
  return useMemo(() => {
    if (!address) return undefined;
    return {
      address,
      symbol: "???",
      decimals: 18,
      logoUrl: "",
    };
  }, [address]);
};

// ============ Small UI ============

function LabelWithTooltip({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span>{label}</span>
      {tooltip && <SpotTooltip tooltipText={tooltip}>ℹ️</SpotTooltip>}
    </div>
  );
}

// ============ Section Components ============

function DurationSection() {
  const panel = useDurationPanel();
  return (
    <div>
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      {/* DEX: Replace with your NumericInput + Select */}
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
        <option value={604800000}>Weeks</option>
      </select>
    </div>
  );
}

function TradeSizeSection() {
  const panel = useTradesPanel();
  return (
    <div>
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
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
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
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

function SubmitOrderSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const submitPanel = useSubmitOrderPanel();
  const submitButton = useSubmitOrderButton();
  const [accepted, setAccepted] = useState(false);

  // DEX: Replace with your ConnectWallet / SwitchNetwork checks

  return (
    <>
      <button
        onClick={() => { submitPanel.onOpenModal(); setIsModalOpen(true); }}
        disabled={submitButton.disabled}
      >
        {submitButton.text}
      </button>

      {isModalOpen && (
        <div className="modal">
          {/* DEX: Replace with your Dialog/Modal component */}
          <Components.SubmitOrderPanel
            reviewDetails={
              <>
                <label>
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                  Accept disclaimer
                </label>
                <button onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button onClick={submitPanel.onSubmit} disabled={!accepted || submitPanel.isLoading}>
                  {submitPanel.isLoading ? "Confirming..." : "Confirm"}
                </button>
              </>
            }
          />
        </div>
      )}
    </>
  );
}

function OrderHistorySection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsModalOpen(true)}>Order History</button>
      {isModalOpen && (
        <div className="modal">
          {/* DEX: Replace with your Dialog/Modal component */}
          <Components.Orders />
          <button onClick={() => setIsModalOpen(false)}>Close</button>
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
  const resetTypedInputAmount = useCallback(() => {}, []);
  const refetchBalances = useCallback(() => {}, []);
  const callbacks = useMemo(() => ({}), []);

  return (
    <SpotProvider
      partner={Partners.Quick} // DEX: Replace with your partner
      module={module}
      priceProtection={3}
      minChunkSizeUsd={5}
      typedInputAmount=""
      resetTypedInputAmount={resetTypedInputAmount}
      marketReferencePrice={marketReferencePrice}
      components={{
        Button: SpotButton,
        Tooltip: SpotTooltip,
        TokenLogo: SpotTokenLogo,
        Spinner: <span>Loading...</span>,
      }}
      srcToken={srcToken}
      dstToken={dstToken}
      useToken={useTokenByAddress}
      refetchBalances={refetchBalances}
      callbacks={callbacks}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* DEX: Token inputs section using your CurrencyInputPanel */}
        {module === Module.TWAP && <TradeSizeSection />}
        {module === Module.TWAP && <TradeIntervalSection />}
        {module !== Module.TWAP && <DurationSection />}
        <SubmitOrderSection />
        <OrderHistorySection />
      </div>
    </SpotProvider>
  );
}
