# Integration Principles

## Rules

1. **Token Inputs = Exact DEX Copy** — Must look exactly like the DEX swap UI.
2. **4 Module Tabs** — TWAP, Limit, Stop-Loss, Take-Profit. Use router/query params for navigation (same pattern as DEX).
3. **Use DEX Components As-Is** — Don't modify DEX components. If one doesn't exist (e.g. Select, Switch), create a new one using DEX styles. Never use generic web components.
4. **Modals Required** — Submit order in a modal. Use the same modal component DEX uses for token select or settings.
5. **Use Portals for Context** — If rendering elements outside SpotProvider scope, use Portal to maintain context access.
6. **Hooks in Components, Props When Needed** — Each component calls `useSpot()` directly. Pass functions/data as props only when hook rules prevent calling the hook there.
7. **Verify Before Using** — Always check: types are correct, components exist in DEX, imports from spot-react are valid.
8. **Never Import from dist** — Always `@orbs-network/spot-react`, never `@orbs-network/spot-react/dist/*`.
9. **Layout Placement** — Spot form next to the swap panel. Spot tabs and swap tab in the same container (e.g. Swap | TWAP | Limit | Stop-Loss | Take-Profit).
10. **Format Display Values** — Use DEX's formatting function or helper hooks from spot-react.
11. **No Extra Packages** — Only install `@orbs-network/spot-react` and its peer dependencies. Use what the DEX already has.
12. **Don't Recreate Error Boundary** — spot-react includes its own ErrorBoundary. Don't add another one around it.
13. **Form Always Visible** — If no chainId/account, still render the form. Only the submit area shows Connect Wallet or Switch Chain using DEX's existing flow.
14. **Single File Structure** — All spot-related components and hooks can live in one file. Order by type: imports, types/constants, section components, main export.
15. **Balance Refetch via Callbacks** — Wire `refetchBalances` into `onWrapSuccess` and `onOrdersProgressUpdate` callbacks. Do not pass it as a prop.
16. **Input Reset in onClose** — Clear the DEX input only when `isSuccess` is true inside the modal's `onClose` callback. On success call `resetState()`; on failed/rejected submissions keep the input and call `resetCurrentSwap()` (see [02-provider.md](02-provider.md)).
17. **Translations** — The SDK returns string keys for disclaimers and errors. Resolve via your own i18n system.

## Module Navigation

Use the same navigation pattern as the DEX (router or query params):

```tsx
import { useRouter, useSearchParams } from "next/navigation";

const module = useMemo(() => {
  const tab = searchParams.get("tab");
  if (tab === "limit") return Module.LIMIT;
  if (tab === "stop-loss") return Module.STOP_LOSS;
  if (tab === "take-profit") return Module.TAKE_PROFIT;
  return Module.TWAP;
}, [searchParams]);

const handleModuleChange = useCallback((newModule: Module) => {
  const tabMap = {
    [Module.TWAP]: "twap",
    [Module.LIMIT]: "limit",
    [Module.STOP_LOSS]: "stop-loss",
    [Module.TAKE_PROFIT]: "take-profit",
  };
  router.push(`?tab=${tabMap[newModule]}`, { scroll: false });
}, [router]);
```

## Portals

If rendering elements outside SpotProvider scope (modals, tooltips), use Portal:

```tsx
import { createPortal } from "react-dom";

function OrderHistoryWithPortal() {
  const { orders } = useSpot().orderHistoryPanel; // Must be inside SpotProvider
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById("spot-modal-root") || document.body);
  }, []);

  return isOpen && container
    ? createPortal(<OrderHistoryModal orders={orders} />, container)
    : null;
}
```

## Panel Visibility by Module

| Panel | TWAP | LIMIT | STOP_LOSS | TAKE_PROFIT |
| --- | --- | --- | --- | --- |
| Trades amount | Yes | — | — | — |
| Fill delay | Yes | — | — | — |
| Duration | — | Yes | Yes | Yes |
| Limit price | Yes (toggle) | Yes (always on) | Yes (toggle) | Yes (toggle) |
| Trigger price | — | — | Yes | Yes |

## File Structure

```tsx
// ============ Imports ============
import { SpotProvider, Module, useSpot, ... } from "@orbs-network/spot-react";

// ============ Types / constants ============
const DURATION_OPTIONS = [
  { text: "Minutes", value: TimeUnit.Minutes },
  { text: "Hours", value: TimeUnit.Hours },
  { text: "Days", value: TimeUnit.Days },
];

// ============ Section components ============
function TokenInputsSection() { ... }
function PriceConfigSection() { ... }
function DurationSection() { ... }
function TradeSizeSection() { ... }
function TradeIntervalSection() { ... }
function SubmitOrderSection() { ... }

// ============ Main export ============
export function SpotForm({ swapType }) { ... }
```

## Final Checklist

- [ ] `@orbs-network/spot-react@latest` installed with all peer dependencies (no viem required)
- [ ] `walletInteractions` provided with all 5 methods (`wrapNativeToken`, `approveToken`, `cancelOrder`, `signOrder`, `getAllowance`) and write methods wait for receipts
- [ ] `typedInputAmount` from DEX state
- [ ] `marketReferencePrice.value` uses the DEX quote output for the current input amount, and balances/USD prices are passed as raw wei / one-token USD values
- [ ] Input reset handled in modal `onClose`: clear input and call `resetState()` on success; keep input and call `resetCurrentSwap()` after failed/rejected submissions
- [ ] Balance refetch handled via `onWrapSuccess` and `onOrdersProgressUpdate` callbacks
- [ ] Token inputs use DEX components unchanged
- [ ] Duration/interval panels use Input + Select with `TimeUnit` options
- [ ] Submit modal built using `useSpot().orderExecutionPanel` and `useSpot().derivedFormData`
- [ ] Order cancellation uses `useCancelOrder(order)` hook
- [ ] Order history built using `useSpot().orderHistoryPanel` and `useDerivedHistoryOrder()`
- [ ] DEX styles applied to orders list, selected order view, submit order content
- [ ] Price Protection setting persisted
- [ ] Callbacks wired for toasts and balance refetch
- [ ] Spot tabs in same container as Swap tab
- [ ] Disclaimer keys resolved through i18n
