---
name: spot-react-integration
description: Integration guide for @orbs-network/spot-react into a DEX
---

# @orbs-network/spot-react Integration

## Principles
1. **Token Inputs = Exact DEX Copy** - Must look EXACTLY like DEX swap UI
2. **4 Module Tabs** - TWAP, Limit, Stop-Loss, Take-Profit
3. **Use DEX Components As-Is** - Don't modify DEX components. If a component doesn't exist (e.g. Select), create a new one using DEX styles - never use generic web components
4. **Modals Required** - Submit order and order history in modals
5. **Pass Data as Props** - Trade, balances, USD prices passed to SpotForm
6. **All Panels Use label + tooltip** - Every panel has label and tooltip props to display

## Install
```bash
npm uninstall @orbs-network/twap-ui && npm install @orbs-network/spot-react
```

## SpotProvider
```tsx
import { SpotProvider, Module, Partners, Components } from "@orbs-network/spot-react";

<SpotProvider
  partner={Partners.Quick}
  module={Module.TWAP}
  priceProtection={3}                          // Default 3%, persist like slippage
  minChunkSizeUsd={5}
  typedInputAmount={inputAmount}               // From DEX state
  resetTypedInputAmount={resetInputAmount}     // Called after order success
  marketReferencePrice={{
    value: trade?.outAmount,
    isLoading,
    noLiquidity: Boolean(typedValue) && !isLoading && !trade?.outAmount,
  }}
  components={{ Button, Tooltip, TokenLogo, Spinner: <Spinner /> }}
  srcToken={{ address, symbol, decimals, logoUrl }}
  dstToken={{ address, symbol, decimals, logoUrl }}
  srcBalance={inputBalance}                    // Wei string
  dstBalance={outputBalance}
  srcUsd1Token={inputUsd}                      // USD price for 1 token
  dstUsd1Token={outputUsd}
  chainId={chainId}
  account={address}
  provider={walletClient?.transport}
  callbacks={callbacks}
/>
```

## Hooks
| Hook | Returns |
|------|---------|
| useDstTokenPanel() | value, usd, isLoading - destination output |
| useTradesPanel() | label, tooltip, totalTrades, onChange, error |
| useDurationPanel() | label, tooltip, duration, onInputChange, onUnitSelect |
| useFillDelayPanel() | label, tooltip, fillDelay, onInputChange, onUnitSelect |
| useLimitPricePanel() | label, tooltip, price, percentage, isLimitPrice, toggleLimitPrice |
| useTriggerPricePanel() | label, tooltip, price, percentage, hide |
| useInvertTradePanel() | isInverted, onInvert, fromToken |
| useInputErrors() | { type, message } or null |
| useSubmitOrderPanel() | onSubmit, onOpenModal, isSuccess, isLoading, step |
| useSubmitOrderButton() | text, disabled, loading |
| useOrderHistoryPanel() | orders, selectedOrder, statuses, openOrdersCount |
| usePartnerChains() | Supported chain IDs |

## Form Structure
```tsx
function SpotFormContent({ module }) {
  return (
    <div className="flex flex-col gap-4">
      <ModuleTabs />                           {/* TWAP | Limit | Stop-Loss | Take-Profit */}
      <TokenInputsSection />                   {/* DEX CurrencyInputPanel + useDstTokenPanel */}
      <PriceConfigSection module={module} />   {/* Limit/trigger price inputs */}
      {module !== Module.TWAP && <DurationSection />}
      {module === Module.TWAP && <TradeSizeSection />}
      {module === Module.TWAP && <TradeIntervalSection />}
      <ErrorSection />
      <SubmitOrderSection />                   {/* Button + modal */}
      <OrderHistorySection />                  {/* Button + modal */}
    </div>
  );
}
```

## Token Inputs
Use DEX components unchanged. Only pass dstPanel.usd if the component doesn't calculate USD itself:
```tsx
function TokenInputsSection({ inputCurrency, inputValue, outputCurrency }) {
  const dstPanel = useDstTokenPanel();
  return (
    <>
      <CurrencyInputPanel value={inputValue} currency={inputCurrency} />
      <SwitchButton />
      <CurrencyInputPanel 
        value={dstPanel.value}      // From spot-react
        currency={outputCurrency}   // From DEX
        // Only pass USD if CurrencyInputPanel doesn't calculate it internally
        // apiUSDValue={dstPanel.usd}  // Uncomment only if component needs external USD
        loading={dstPanel.isLoading}
      />
    </>
  );
}
```

## Panel Pattern (Label + Tooltip + Input)
All panels follow this pattern - use label and tooltip from the hook:
```tsx
function LabelWithTooltip({ label, tooltip }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium">{label}</span>
      {tooltip && <Tooltip content={tooltip}><InfoIcon className="w-3.5 h-3.5" /></Tooltip>}
    </div>
  );
}
```

## Duration Panel (Input + Select)
```tsx
function DurationSection() {
  const panel = useDurationPanel();
  const unitOptions = [
    { value: 60, label: "Minutes" },
    { value: 3600, label: "Hours" },
    { value: 86400, label: "Days" },
    { value: 604800, label: "Weeks" },
  ];

  return (
    <div className="bg-card rounded-lg p-4">
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      <div className="flex items-center gap-2 mt-2">
        <NumericInput 
          value={panel.duration.value} 
          onChange={panel.onInputChange} 
          className="w-20"
        />
        <Select 
          value={panel.duration.unit} 
          onValueChange={panel.onUnitSelect}
          options={unitOptions}
        />
      </div>
    </div>
  );
}
```

## Trade Size Section (TWAP)
```tsx
function TradeSizeSection() {
  const panel = useTradesPanel();
  return (
    <div className="bg-card rounded-lg p-4">
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      <div className="flex items-center gap-2 mt-2">
        <NumericInput value={panel.totalTrades} onChange={panel.onChange} className="w-20" />
        <span className="text-sm text-muted-foreground">trades</span>
      </div>
      {panel.amountPerTradeUsd && <span className="text-xs text-muted-foreground">${panel.amountPerTradeUsd} per trade</span>}
    </div>
  );
}
```

## Trade Interval Section (TWAP)
```tsx
function TradeIntervalSection() {
  const panel = useFillDelayPanel();
  return (
    <div className="bg-card rounded-lg p-4">
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      <div className="flex items-center gap-2 mt-2">
        <NumericInput value={panel.fillDelay.value} onChange={panel.onInputChange} className="w-20" />
        <Select value={panel.fillDelay.unit} onValueChange={panel.onUnitSelect} options={unitOptions} />
      </div>
    </div>
  );
}
```

## Price Panels
```tsx
function PriceConfigSection({ module }) {
  const invertPanel = useInvertTradePanel();
  const triggerPanel = useTriggerPricePanel();
  const limitPanel = useLimitPricePanel();
  const showTrigger = module === Module.STOP_LOSS || module === Module.TAKE_PROFIT;

  return (
    <div className="bg-card rounded-lg p-4">
      <PriceHeader invertPanel={invertPanel} />
      {showTrigger && !triggerPanel.hide && <PriceRow panel={triggerPanel} />}
      <LimitPriceRow panel={limitPanel} showToggle={module !== Module.LIMIT} />
    </div>
  );
}

// Layout: Label+Tooltip | [Symbol | Price Input + USD] [% Input]
function PriceRow({ panel }) {
  return (
    <div className="flex flex-col gap-2">
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      <div className="flex gap-2">
        <div className="flex-1 bg-input rounded-lg px-3 py-2">
          <span>{panel.toToken?.symbol}</span>
          <NumericInput value={panel.price} onChange={panel.onChange} />
          <span className="text-xs">${panel.usd}</span>
        </div>
        <div className="w-24 bg-input rounded-lg px-3 py-2">
          <NumericInput value={panel.percentage} onChange={panel.onPercentageChange} />%
        </div>
      </div>
    </div>
  );
}
```

## Submit Order
```tsx
function SubmitOrderSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { address, chainId } = useAccount();
  const partnerChains = usePartnerChains();
  const submitPanel = useSubmitOrderPanel();
  const submitButton = useSubmitOrderButton();

  if (!address) return <ConnectWalletButton />;
  if (!partnerChains?.includes(chainId)) return <SwitchNetworkButton />;

  return (
    <>
      <Button onClick={() => { submitPanel.onOpenModal(); setIsModalOpen(true); }} 
        disabled={submitButton.disabled}>{submitButton.text}</Button>
      <SubmitOrderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} submitPanel={submitPanel} />
    </>
  );
}
```

## Submit Modal (Full Screen)
Disclaimer and submit button go INSIDE reviewDetails:
```tsx
function SubmitOrderModal({ isOpen, onClose, submitPanel }) {
  const [accepted, setAccepted] = useState(false);
  if (!isOpen) return null;

  // Disclaimer + Submit button rendered inside reviewDetails
  const reviewDetails = (
    <>
      <DisclaimerAccept accepted={accepted} onAcceptedChange={setAccepted} />
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={onClose} disabled={submitPanel.isLoading}>Cancel</Button>
        <Button onClick={submitPanel.onSubmit} disabled={!accepted || submitPanel.isLoading}>
          {submitPanel.isLoading ? `${submitPanel.step}ing...` : "Confirm"}
        </Button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <Header title={submitPanel.isSuccess ? "Order Created!" : "Confirm Order"} onClose={onClose} />
      <div className="flex-1 overflow-auto p-4">
        {submitPanel.isSuccess ? <SuccessView onClose={onClose} /> : 
         submitPanel.parsedError ? <ErrorView message={submitPanel.parsedError.message} /> : (
          <Components.SubmitOrderPanel reviewDetails={reviewDetails} />
        )}
      </div>
    </div>
  );
}

// Disclaimer row: "Accept disclaimer" (link) | Switch
function DisclaimerAccept({ accepted, onAcceptedChange }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-card border">
      <span>Accept <a href="https://www.orbs.com/spot-disclaimer" className="text-primary underline">disclaimer</a></span>
      <Switch checked={accepted} onCheckedChange={onAcceptedChange} />
    </div>
  );
}
```

## Order History Modal
```tsx
function OrderHistorySection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const panel = useOrderHistoryPanel();
  return (
    <>
      <Button variant="outline" onClick={() => setIsModalOpen(true)}>
        Order History {panel.openOrdersCount > 0 && `(${panel.openOrdersCount})`}
      </Button>
      <OrderHistoryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} panel={panel} />
    </>
  );
}

function OrderHistoryModal({ isOpen, onClose, panel }) {
  if (!isOpen) return null;
  return (
    <Modal onClose={onClose}>
      <Header title={panel.selectedOrder ? "Order Details" : "Order History"} 
        onBack={panel.selectedOrder ? panel.onHideSelectedOrder : undefined} />
      {!panel.selectedOrder && <StatusTabs statuses={panel.statuses} onSelect={panel.onSelectStatus} />}
      <Components.Orders />
    </Modal>
  );
}
```

## Callbacks
```tsx
const callbacks = {
  onWrapSuccess: ({ txHash }) => toast.success("Wrapped"),
  onApproveSuccess: ({ txHash }) => toast.success("Approved"),
  onOrderCreated: (order) => toast.success("Order created"),
  onOrderFilled: (order) => toast.success("Order filled"),
  onSubmitOrderFailed: ({ message }) => toast.error(message),
  onCancelOrderSuccess: () => toast.success("Cancelled"),
};
```

## Price Protection
- Default 3%, NOT slippage
- When Spot active: hide DEX slippage, show only Price Protection
- Persist same way DEX stores slippage (zustand/redux/localStorage)

## Checklist
- [ ] Install @orbs-network/spot-react
- [ ] Pass required components: Button, Tooltip, TokenLogo, Spinner
- [ ] Pass typedInputAmount + resetTypedInputAmount from DEX state
- [ ] Token inputs use DEX components unchanged
- [ ] All panels display label + tooltip from hooks
- [ ] Duration/interval panels use Input + Select
- [ ] Submit modal with Components.SubmitOrderPanel + reviewDetails containing disclaimer + buttons
- [ ] Order history modal with Components.Orders
- [ ] Price Protection setting (persisted)
- [ ] Callbacks for toasts
