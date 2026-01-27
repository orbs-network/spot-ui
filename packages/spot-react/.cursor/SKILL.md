---
name: spot-react-integration
description: Integration guide for @orbs-network/spot-react into a DEX
compatibility: React 18+, wagmi, EVM chains
---

# Integrate @orbs-network/spot-react into a DEX

## Key Principles

1. **Token Inputs = Exact DEX Copy** - Top section must look EXACTLY like DEX swap UI
2. **4 Module Tabs** - TWAP, Limit, Stop-Loss, Take-Profit
3. **Use DEX Components** - Search for existing DEX components first
4. **Modals Required** - SubmitOrderPanel and Orders must be in modals
5. **Split Into Sections** - Each section is its own component with own hooks
6. **Mobile-First** - Min 44px touch targets, full-screen modals on mobile

## Installation

```bash
npm uninstall @orbs-network/twap-ui  # Remove deprecated package
npm install @orbs-network/spot-react
```

## Price Protection (NOT Slippage)

- Default: 3%
- When Spot tab active: **HIDE ALL** DEX settings, show **ONLY** Price Protection
- Pass value to `priceProtection` prop

```tsx
import { PRICE_PROTECTION_SETTINGS } from "@orbs-network/spot-react";
```

## SpotProvider Setup

```tsx
import { SpotProvider, Module, Partners, Components } from "@orbs-network/spot-react";

<SpotProvider
  partner={Partners.Quick}
  module={Module.TWAP}
  priceProtection={3}
  minChunkSizeUsd={5}
  
  // Market price - output amount in wei from DEX quote
  marketReferencePrice={{
    value: trade?.outAmount,
    isLoading: isLoadingTrade,
    noLiquidity: Boolean(typedValue) && !isLoadingTrade && !trade?.outAmount,
  }}
  
  // Required UI components
  components={{
    Button: YourButton,
    Tooltip: YourTooltip,
    TokenLogo: YourTokenLogo,
    Spinner: <YourSpinner />,
  }}
  
  // Tokens
  srcToken={{ address, symbol, decimals, logoUrl }}
  dstToken={{ address, symbol, decimals, logoUrl }}
  srcBalance="1000000000000000000"  // wei string
  dstBalance="1000000000"
  srcUsd1Token="1850.50"  // USD price for 1 token
  dstUsd1Token="1.00"
  
  // Wallet
  chainId={chainId}
  account={address}
  provider={walletClient?.transport}
  
  // Optional
  callbacks={callbacks}
  refetchBalances={() => {}}
  useToken={useTokenByAddress}
  fees={0.25}
>
  {children}
</SpotProvider>
```

## Module Types

```tsx
enum Module {
  TWAP = "twap",
  LIMIT = "limit", 
  STOP_LOSS = "stop_loss",
  TAKE_PROFIT = "take_profit"
}
```

## Amount Sync (Required)

```tsx
import { useTypedSrcAmount } from "@orbs-network/spot-react";

function AmountSyncListener() {
  const { amount } = useTypedSrcAmount();
  const { setInputAmount } = useDexStore();
  
  useEffect(() => {
    setInputAmount(amount ?? "");
  }, [amount, setInputAmount]);
  
  return null;
}
```

## Hooks Reference

| Hook | Purpose |
|------|---------|
| `useSrcTokenPanel()` | Source token: value, balance, usd, token, onChange, onMax |
| `useDstTokenPanel()` | Destination: value, balance, usd, token, isLoading |
| `useTradesPanel()` | TWAP trades config |
| `useDurationPanel()` | Order expiration |
| `useFillDelayPanel()` | TWAP delay between trades |
| `useLimitPricePanel()` | Limit price config |
| `useTriggerPricePanel()` | Stop-Loss/Take-Profit trigger |
| `useInputErrors()` | Validation errors |
| `useSubmitOrderPanel()` | Order submission flow |
| `useSubmitOrderButton()` | Submit button state |
| `useOrderHistoryPanel()` | Order history |
| `usePartnerChains()` | Supported chains for partner |

## Complete Integration

```tsx
// spot-form.tsx
import { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId, useWalletClient, useSwitchChain } from "wagmi";
import { zeroAddress } from "viem";
import {
  SpotProvider, Module, Partners, Components,
  useTypedSrcAmount, useSrcTokenPanel, useDstTokenPanel,
  useTradesPanel, useDurationPanel, useFillDelayPanel,
  useLimitPricePanel, useTriggerPricePanel, useInvertTradePanel,
  useInputErrors, useSubmitOrderPanel, useSubmitOrderButton,
  useOrderHistoryPanel, useDisclaimerPanel, usePartnerChains,
  useFormatNumber, DEFAULT_DURATION_OPTIONS, PRICE_PROTECTION_SETTINGS,
  type Token,
} from "@orbs-network/spot-react";
// Use lucide-react for icons: InfoIcon, AlertTriangle, ChevronDown, ArrowUpDown, 
// History, ArrowLeft, X, Settings, Check, CheckCircle, XCircle

// ============================================================================
// MAIN FORM LAYOUT - Thin wrapper, each section handles own hooks
// ============================================================================

interface SpotFormContentProps {
  module: Module;
  onModuleChange: (module: Module) => void;
  priceProtection: number;
  onPriceProtectionChange: (value: number) => void;
  onInputSelect?: (currency: any) => void;
  onOutputSelect?: (currency: any) => void;
  onSwitchTokens?: () => void;
}

function SpotFormContent({ 
  module, onModuleChange, priceProtection, onPriceProtectionChange,
  onInputSelect, onOutputSelect, onSwitchTokens,
}: SpotFormContentProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <ModuleTabs module={module} onModuleChange={onModuleChange} />
      <FormHeader onSettingsClick={() => setIsSettingsOpen(true)} />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        priceProtection={priceProtection}
        onPriceProtectionChange={onPriceProtectionChange}
      />
      <TokenInputsSection 
        onInputSelect={onInputSelect}
        onOutputSelect={onOutputSelect}
        onSwitchTokens={onSwitchTokens}
      />
      <PriceConfigSection module={module} />
      {module !== Module.TWAP && <DurationSection />}
      {module === Module.TWAP && <TradeSizeSection />}
      {module === Module.TWAP && <TradeIntervalSection />}
      <ErrorSection />
      <DisclaimerSection />
      <SubmitOrderSection />
      <OrderHistorySection />
    </div>
  );
}

// ============================================================================
// MODULE TABS - 4 tabs required
// ============================================================================

const MODULE_TABS = [
  { id: Module.TWAP, label: "TWAP" },
  { id: Module.LIMIT, label: "Limit" },
  { id: Module.STOP_LOSS, label: "Stop-Loss" },
  { id: Module.TAKE_PROFIT, label: "Take-Profit" },
] as const;

function ModuleTabs({ module, onModuleChange }: { module: Module; onModuleChange: (m: Module) => void }) {
  return (
    <div className="flex rounded-lg bg-muted p-1 gap-1 overflow-x-auto">
      {MODULE_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onModuleChange(tab.id)}
          className={cn(
            "flex-1 min-w-fit px-3 py-2.5 text-sm font-medium rounded-md transition-all min-h-[44px]",
            module === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// TOKEN INPUTS - MUST MATCH DEX SWAP UI EXACTLY
// Copy DEX's CurrencyInputPanel + SwitchButton structure, only change data source
// ============================================================================

function TokenInputsSection({ onInputSelect, onOutputSelect, onSwitchTokens }: {
  onInputSelect?: (c: any) => void;
  onOutputSelect?: (c: any) => void;
  onSwitchTokens?: () => void;
}) {
  const srcPanel = useSrcTokenPanel();
  const dstPanel = useDstTokenPanel();

  return (
    <InputsWrapper>  {/* Use DEX wrapper */}
      <CurrencyInputPanel  // Use DEX component
        label="From"
        value={srcPanel.value}
        onUserInput={srcPanel.onChange}
        onMax={srcPanel.onMax}
        showMaxButton={true}
        currency={srcPanel.token}
        onCurrencySelect={onInputSelect}
        apiUSDValue={srcPanel.usd}
      />
      <SwitchButton onClick={onSwitchTokens} />  {/* Use DEX component */}
      <CurrencyInputPanel
        label="To (estimated)"
        value={dstPanel.value}
        onUserInput={() => {}}  // Read-only
        showMaxButton={false}
        currency={dstPanel.token}
        onCurrencySelect={onOutputSelect}
        apiUSDValue={dstPanel.usd}
        loading={dstPanel.isLoading}
      />
    </InputsWrapper>
  );
}

// ============================================================================
// PRICE CONFIG SECTION
// ============================================================================

function PriceConfigSection({ module }: { module: Module }) {
  const invertPanel = useInvertTradePanel();
  const triggerPanel = useTriggerPricePanel();
  const limitPanel = useLimitPricePanel();
  const showTrigger = module === Module.STOP_LOSS || module === Module.TAKE_PROFIT;

  return (
    <div className="bg-card rounded-lg p-4 flex flex-col gap-4">
      <PriceHeader invertPanel={invertPanel} />
      {showTrigger && !triggerPanel.hide && (
        <PriceInputPanel panel={triggerPanel} />
      )}
      <LimitPricePanel panel={limitPanel} showToggle={module !== Module.LIMIT} />
    </div>
  );
}

// Price input layout: [Symbol | Input + USD] [% Input]
function PriceInputPanel({ panel }: { panel: any }) {
  const formattedUsd = useFormatNumber({ value: panel.usd, decimalScale: 2, prefix: "$" });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <LabelWithTooltip text={panel.label} tooltip={panel.tooltip} />
        <button onClick={panel.onReset} className="text-xs text-primary">Reset</button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-input rounded-lg px-3 py-2">
          <span className="text-sm text-muted-foreground shrink-0">{panel.toToken?.symbol}</span>
          <div className="flex-1 flex flex-col items-end">
            <NumericInput value={panel.price} onChange={panel.onChange} className="text-right w-full" />
            <span className="text-xs text-muted-foreground">{formattedUsd}</span>
          </div>
        </div>
        <div className="w-24 flex items-center bg-input rounded-lg px-3 py-2 min-h-[44px]">
          <NumericInput value={panel.percentage} onChange={panel.onPercentageChange} className="text-right flex-1" />
          <span className="text-sm text-muted-foreground ml-1">%</span>
        </div>
      </div>
    </div>
  );
}

function LimitPricePanel({ panel, showToggle }: { panel: any; showToggle: boolean }) {
  const formattedUsd = useFormatNumber({ value: panel.usd, decimalScale: 2, prefix: "$" });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {showToggle && <Switch checked={panel.isLimitPrice} onCheckedChange={panel.toggleLimitPrice} />}
        <LabelWithTooltip text={panel.label} tooltip={panel.tooltip} />
        {panel.isLimitPrice && <button onClick={panel.onReset} className="ml-auto text-xs text-primary">Reset</button>}
      </div>
      {panel.isLimitPrice && (
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-input rounded-lg px-3 py-2">
            <span className="text-sm text-muted-foreground shrink-0">{panel.toToken?.symbol}</span>
            <div className="flex-1 flex flex-col items-end">
              <NumericInput value={panel.price} onChange={panel.onChange} className="text-right w-full" />
              <span className="text-xs text-muted-foreground">{formattedUsd}</span>
            </div>
          </div>
          <div className="w-24 flex items-center bg-input rounded-lg px-3 py-2 min-h-[44px]">
            <NumericInput value={panel.percentage} onChange={panel.onPercentageChange} className="text-right flex-1" />
            <span className="text-sm text-muted-foreground ml-1">%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DURATION, TRADE SIZE, TRADE INTERVAL SECTIONS
// ============================================================================

function DurationSection() {
  const panel = useDurationPanel();
  return (
    <PanelCard error={panel.error}>
      <LabelWithTooltip text={panel.label} tooltip={panel.tooltip} />
      <DurationInputRow value={panel.duration.value} unit={panel.duration.unit} 
        onInputChange={panel.onInputChange} onUnitSelect={panel.onUnitSelect} />
    </PanelCard>
  );
}

function TradeSizeSection() {
  const panel = useTradesPanel();
  const formattedUsd = useFormatNumber({ value: panel.amountPerTradeUsd, decimalScale: 2, prefix: "$" });
  return (
    <PanelCard error={panel.error}>
      <LabelWithTooltip text={panel.label} tooltip={panel.tooltip} />
      <div className="flex items-center gap-2 mt-2">
        <div className="w-20 bg-input rounded-lg px-3 py-2">
          <NumericInput value={panel.totalTrades?.toString() ?? ""} onChange={(v) => panel.onChange(Number(v) || 0)} />
        </div>
        <span className="text-sm text-muted-foreground">trades</span>
      </div>
      {panel.amountPerTradeUsd && <span className="text-xs text-muted-foreground">{formattedUsd} per trade</span>}
    </PanelCard>
  );
}

function TradeIntervalSection() {
  const panel = useFillDelayPanel();
  return (
    <PanelCard error={panel.error}>
      <LabelWithTooltip text={panel.label} tooltip={panel.tooltip} />
      <DurationInputRow value={panel.fillDelay.value} unit={panel.fillDelay.unit}
        onInputChange={panel.onInputChange} onUnitSelect={panel.onUnitSelect} />
    </PanelCard>
  );
}

// ============================================================================
// ERROR & DISCLAIMER SECTIONS
// ============================================================================

function ErrorSection() {
  const error = useInputErrors();
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
      <AlertTriangle className="w-4 h-4 text-destructive" />
      <span className="text-sm text-destructive">{error.message}</span>
    </div>
  );
}

function DisclaimerSection() {
  const disclaimer = useDisclaimerPanel();
  if (!disclaimer) return null;
  return (
    <div className="flex items-start gap-2 p-3 bg-card rounded-lg">
      <InfoIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
      <p className="text-xs text-muted-foreground">{disclaimer.text}</p>
    </div>
  );
}

// ============================================================================
// SUBMIT ORDER SECTION + MODAL
// Handles: wallet connection, chain validation, submit modal
// ============================================================================

function SubmitOrderSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { address, chainId } = useAccount();
  const partnerChains = usePartnerChains();
  const isValidChain = chainId && partnerChains?.includes(chainId);
  const submitPanel = useSubmitOrderPanel();
  const submitButton = useSubmitOrderButton();
  const { reset: resetTypedAmount } = useTypedSrcAmount();

  const handleOpenModal = useCallback(() => {
    submitPanel.onOpenModal();
    setIsModalOpen(true);
  }, [submitPanel.onOpenModal]);

  const handleCloseModal = useCallback(() => {
    submitPanel.onCloseModal();
    setIsModalOpen(false);
    if (submitPanel.isSuccess) resetTypedAmount();
  }, [submitPanel, resetTypedAmount]);

  // Not connected
  if (!address) return <ConnectWalletButton />;
  
  // Wrong chain
  if (!isValidChain) return <SwitchNetworkButton targetChainId={partnerChains?.[0]} />;

  return (
    <>
      <SubmitButton text={submitButton.text} disabled={submitButton.disabled} loading={submitButton.loading} onClick={handleOpenModal} />
      <SubmitOrderModal isOpen={isModalOpen} onClose={handleCloseModal} submitPanel={submitPanel} />
    </>
  );
}

function ConnectWalletButton() {
  const toggleWalletModal = useToggleWalletModal(); // Your DEX hook
  return (
    <button onClick={toggleWalletModal} className="w-full min-h-[48px] rounded-xl font-semibold bg-primary text-primary-foreground">
      Connect Wallet
    </button>
  );
}

function SwitchNetworkButton({ targetChainId }: { targetChainId?: number }) {
  const { switchChain, isPending } = useSwitchChain();
  return (
    <button
      onClick={() => targetChainId && switchChain({ chainId: targetChainId })}
      disabled={isPending}
      className="w-full min-h-[48px] rounded-xl font-semibold bg-orange-500 text-white disabled:opacity-50"
    >
      {isPending ? "Switching..." : "Switch Network"}
    </button>
  );
}

function SubmitButton({ text, disabled, loading, onClick }: { text: string; disabled: boolean; loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} className="w-full h-12 rounded-xl font-semibold bg-primary text-primary-foreground disabled:opacity-50">
      {loading ? <><Spinner size="sm" /> Loading...</> : text}
    </button>
  );
}

// ============================================================================
// SUBMIT ORDER MODAL - FULL SCREEN
// ============================================================================

function SubmitOrderModal({ isOpen, onClose, submitPanel }: { isOpen: boolean; onClose: () => void; submitPanel: any }) {
  if (!isOpen) return null;

  const title = submitPanel.isSuccess ? "Order Created!" : submitPanel.isFailed ? "Order Failed" : "Confirm Order";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-full bg-background flex flex-col animate-in fade-in-0">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-input">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 pb-safe">
          {submitPanel.parsedError ? (
            <SubmitErrorView message={submitPanel.parsedError.message} onClose={onClose} />
          ) : submitPanel.isSuccess ? (
            <SubmitSuccessView onClose={onClose} />
          ) : (
            <SubmitReviewView submitPanel={submitPanel} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function SubmitSuccessView({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-green-500" />
      </div>
      <div className="text-center">
        <h3 className="text-xl font-semibold">Order Created!</h3>
        <p className="text-sm text-muted-foreground">Your order will execute according to settings.</p>
      </div>
      <button onClick={onClose} className="w-full min-h-[48px] rounded-xl font-semibold bg-primary text-primary-foreground">Done</button>
    </div>
  );
}

function SubmitErrorView({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <XCircle className="w-10 h-10 text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="text-xl font-semibold">Order Failed</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <button onClick={onClose} className="w-full min-h-[48px] rounded-xl font-medium border border-border">Close</button>
    </div>
  );
}

function SubmitReviewView({ submitPanel, onClose }: { submitPanel: any; onClose: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const loadingText = submitPanel.step === "wrap" ? "Wrapping..." : submitPanel.step === "approve" ? "Approving..." : "Creating Order...";

  return (
    <div className="flex flex-col gap-4">
      {/* Order Summary - styled data rows */}
      <div className="bg-card rounded-xl border border-border p-4">
        <Components.SubmitOrderPanel reviewDetails={null} />
      </div>
      
      {/* Disclaimer + Buttons */}
      <DisclaimerAccept accepted={accepted} onAcceptedChange={setAccepted} />
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={onClose} disabled={submitPanel.isLoading} className="flex-1 min-h-[48px] rounded-xl font-medium border border-border disabled:opacity-50">Cancel</button>
        <button onClick={submitPanel.onSubmit} disabled={!accepted || submitPanel.isLoading} className="flex-1 min-h-[48px] rounded-xl font-semibold bg-primary text-primary-foreground disabled:opacity-50">
          {submitPanel.isLoading ? <><Spinner size="sm" /> {loadingText}</> : "Confirm Order"}
        </button>
      </div>
    </div>
  );
}

// Disclaimer: "Accept disclaimer" (link) | Switch
const DISCLAIMER_URL = "https://www.orbs.com/spot-disclaimer";

function DisclaimerAccept({ accepted, onAcceptedChange }: { accepted: boolean; onAcceptedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
      <span className="text-sm">
        Accept <a href={DISCLAIMER_URL} target="_blank" className="text-primary underline" onClick={(e) => e.stopPropagation()}>disclaimer</a>
      </span>
      <Switch checked={accepted} onCheckedChange={onAcceptedChange} />
    </div>
  );
}

// ============================================================================
// ORDER HISTORY SECTION + MODAL
// ============================================================================

function OrderHistorySection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const panel = useOrderHistoryPanel();

  return (
    <>
      <button onClick={() => setIsModalOpen(true)} className="w-full min-h-[44px] h-11 rounded-xl font-medium border border-border flex items-center justify-center gap-2">
        <History className="w-4 h-4" />
        <span>Order History</span>
        {panel.openOrdersCount > 0 && <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">{panel.openOrdersCount} open</span>}
      </button>
      <OrderHistoryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} panel={panel} />
    </>
  );
}

function OrderHistoryModal({ isOpen, onClose, panel }: { isOpen: boolean; onClose: () => void; panel: any }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl h-[95vh] sm:h-auto sm:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {panel.selectedOrder && (
              <button onClick={panel.onHideSelectedOrder} className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-input">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-semibold">{panel.selectedOrder ? "Order Details" : "Order History"}</h2>
          </div>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-input">
            <X className="w-5 h-5" />
          </button>
        </div>
        {!panel.selectedOrder && (
          <div className="px-4 pb-3">
            <div className="flex gap-1 p-1 bg-input rounded-lg overflow-x-auto">
              {[{ value: "", text: "All" }, ...panel.statuses].map((s) => (
                <button
                  key={s.value}
                  onClick={() => panel.onSelectStatus(s.value || undefined)}
                  className={cn(
                    "flex-1 min-w-fit px-3 py-2 text-sm font-medium rounded-md min-h-[40px]",
                    (panel.selectedStatus || "") === s.value ? "bg-background shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto px-4 pb-4">
          {panel.isLoading ? (
            <div className="flex flex-col items-center py-12"><Spinner size="lg" /><p className="text-sm text-muted-foreground">Loading...</p></div>
          ) : panel.ordersToDisplay.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center"><History className="w-8 h-8 text-muted-foreground/50" /></div>
              <div className="text-center"><h3 className="font-medium">No orders yet</h3><p className="text-sm text-muted-foreground">Orders appear here after creation.</p></div>
            </div>
          ) : (
            <Components.Orders />
          )}
        </div>
      </div>
    </div>
  );
}

// Portal pattern for rendering modal outside form tree while keeping context
function OrderHistorySectionWithPortal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const panel = useOrderHistoryPanel();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let el = document.getElementById("spot-modal-root");
    if (!el) { el = document.createElement("div"); el.id = "spot-modal-root"; document.body.appendChild(el); }
    setContainer(el);
  }, []);

  return (
    <>
      <button onClick={() => setIsModalOpen(true)}>Order History</button>
      {isModalOpen && container && createPortal(
        <OrderHistoryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} panel={panel} />,
        container
      )}
    </>
  );
}

// ============================================================================
// SETTINGS MODAL - Price Protection only when Spot active
// ============================================================================

function SettingsModal({ isOpen, onClose, priceProtection, onPriceProtectionChange }: {
  isOpen: boolean; onClose: () => void; priceProtection: number; onPriceProtectionChange: (v: number) => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-input rounded"><X className="w-5 h-5" /></button>
        </div>
        <PriceProtectionSettings value={priceProtection} onChange={onPriceProtectionChange} />
      </div>
    </div>
  );
}

function PriceProtectionSettings({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [input, setInput] = useState("");
  const presets = [1, 3, 5];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between"><span className="text-sm font-medium">Price Protection</span><span className="text-sm">{value}%</span></div>
      <div className="flex gap-2">
        {presets.map((p) => (
          <button key={p} onClick={() => { setInput(""); onChange(p); }} className={cn("flex-1 py-2 rounded-lg text-sm font-medium", value === p && !input ? "bg-primary text-primary-foreground" : "bg-input")}>{p}%</button>
        ))}
        <div className="flex-1 flex items-center bg-input rounded-lg px-2">
          <NumericInput value={input} onChange={setInput} onBlur={() => { if (input) onChange(Number(input)); setInput(""); }} placeholder={value.toString()} className="flex-1 text-right" />
          <span className="text-sm text-muted-foreground ml-1">%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{PRICE_PROTECTION_SETTINGS}</p>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function PanelCard({ children, error }: { children: ReactNode; error?: string }) {
  return <div className={cn("bg-card rounded-lg p-4", error && "border border-destructive")}>{children}</div>;
}

function LabelWithTooltip({ text, tooltip }: { text: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium">{text}</span>
      {tooltip && <Tooltip><TooltipTrigger><InfoIcon className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger><TooltipContent>{tooltip}</TooltipContent></Tooltip>}
    </div>
  );
}

function PriceHeader({ invertPanel }: { invertPanel: any }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground font-medium">
        {invertPanel.isInverted ? "Buy " : "Sell "}{invertPanel.fromToken?.symbol} {invertPanel.isMarketPrice ? "at best rate" : "at rate"}
      </span>
      {!invertPanel.isMarketPrice && <button onClick={invertPanel.onInvert} className="p-1 hover:bg-input rounded"><ArrowUpDown className="w-4 h-4" /></button>}
    </div>
  );
}

function FormHeader({ onSettingsClick }: { onSettingsClick: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <button onClick={onSettingsClick} className="p-2 rounded-lg hover:bg-input"><Settings className="w-5 h-5" /></button>
    </div>
  );
}

const DURATION_OPTIONS = [
  { value: 60, text: "Minutes" },
  { value: 3600, text: "Hours" },
  { value: 86400, text: "Days" },
  { value: 604800, text: "Weeks" },
];

function DurationInputRow({ value, unit, onInputChange, onUnitSelect }: {
  value?: number; unit: number; onInputChange: (v: string) => void; onUnitSelect: (u: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="w-20 bg-input rounded-lg px-3 py-2">
        <NumericInput value={value?.toString() ?? ""} onChange={onInputChange} />
      </div>
      <SelectMenu selected={DURATION_OPTIONS.find((o) => o.value === unit)} items={DURATION_OPTIONS} onSelect={(i) => onUnitSelect(i.value as number)} />
    </div>
  );
}

// ============================================================================
// FALLBACK COMPONENTS - Use DEX components if available
// ============================================================================

function NumericInput({ value, onChange, onBlur, placeholder = "0.0", className }: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      type="text" inputMode="decimal" value={value} placeholder={placeholder} className={cn("w-full bg-transparent outline-none text-foreground font-medium", className)}
      onChange={(e) => { if (e.target.value === "" || /^[0-9]*\.?[0-9]*$/.test(e.target.value)) onChange(e.target.value); }}
      onBlur={onBlur}
    />
  );
}

function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 rounded-full transition-colors", checked ? "bg-primary" : "bg-input")}>
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition", checked ? "translate-x-4" : "translate-x-0")} />
    </button>
  );
}

function SelectMenu({ selected, items, onSelect, className }: {
  selected?: { value: number | string; text: string }; items: { value: number | string; text: string }[];
  onSelect: (i: { value: number | string; text: string }) => void; className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="flex items-center justify-between gap-2 min-w-[100px] px-3 py-2 bg-input rounded-lg text-sm font-medium">
        <span>{selected?.text || "Select"}</span><ChevronDown className={cn("w-4 h-4", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-lg py-1">
          {items.map((item) => (
            <button key={item.value} type="button" onClick={() => { onSelect(item); setIsOpen(false); }}
              className={cn("w-full px-3 py-2 text-left text-sm hover:bg-input", selected?.value === item.value && "bg-primary/10 text-primary")}>
              {item.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };
  return (
    <svg className={cn("animate-spin text-primary", sizes[size])} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Use lucide-react for icons: InfoIcon, AlertTriangle, ChevronDown, ArrowUpDown, 
// History, ArrowLeft, X, Settings, Check, CheckCircle, XCircle

// ============================================================================
// CALLBACKS
// ============================================================================

const callbacks = {
  onWrapRequest: () => void,
  onWrapSuccess: ({ txHash, explorerUrl, amount }) => void,
  onApproveRequest: () => void,
  onApproveSuccess: ({ txHash, explorerUrl, token, amount }) => void,
  onSignOrderRequest: () => void,
  onSignOrderSuccess: (signature: string) => void,
  onSignOrderError: (error: Error) => void,
  onOrderCreated: (order: Order) => void,
  onOrderFilled: (order: Order) => void,
  onSubmitOrderFailed: ({ message, code }) => void,
  onSubmitOrderRejected: () => void,
  onCancelOrderRequest: (orders: Order[]) => void,
  onCancelOrderSuccess: ({ orders, txHash, explorerUrl }) => void,
  onCopy: () => void,
};
```

## Integration Checklist

- [ ] Uninstall `@orbs-network/twap-ui`
- [ ] Install `@orbs-network/spot-react`
- [ ] Implement required components: Button, Tooltip, TokenLogo, Spinner
- [ ] Add Price Protection setting (hide DEX slippage when Spot active)
- [ ] Build token panels matching DEX swap UI exactly
- [ ] Add amount sync listener with `useTypedSrcAmount`
- [ ] Build submit modal with `Components.SubmitOrderPanel`
- [ ] Add order history modal with `Components.Orders`
- [ ] Implement callbacks for toast notifications
