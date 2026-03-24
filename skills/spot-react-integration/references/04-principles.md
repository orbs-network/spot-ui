# Integration Principles

## Rules

1. **Token Inputs = Exact DEX Copy** — Must look exactly like the DEX swap UI.
2. **4 Module Tabs** — TWAP, Limit, Stop-Loss, Take-Profit. Use router/query params for navigation (same pattern as DEX).
3. **Use DEX Components As-Is** — Don't modify DEX components. If one doesn't exist (e.g. Select), create a new one using DEX styles. Never use generic web components. Apply DEX styles to orders list, selected order view, and submit order components.
4. **Modals Required** — Submit order and order history in modals. Use the same modal component DEX uses for token select or settings.
5. **Use Portals for Context** — If rendering elements outside SpotProvider scope, use Portal to maintain context access.
6. **Hooks in Components, Props When Needed** — Each component renders the hook it needs. Pass functions/data as props only when hook rules prevent calling the hook there.
7. **All Panels Use label + tooltip** — Every panel has label and tooltip props to display.
8. **Verify Before Using** — Always check: types are correct, components exist in DEX, imports from spot-react are valid.
9. **Never Import from dist** — Always `@orbs-network/spot-react`, never `@orbs-network/spot-react/dist/*`.
10. **Layout Placement** — Spot form next to the swap panel. Spot tabs and swap tab in the same container (e.g. Swap | TWAP | Limit | Stop-Loss | Take-Profit).
11. **Format Display Values** — Use DEX's formatting function or `useFormatNumber` from spot-react.
12. **No Extra Packages** — Only install `@orbs-network/spot-react`. Use what the DEX already has.
13. **Don't Recreate Error Boundary** — Use the DEX's existing error boundary.
14. **Form Always Visible** — If no chainId/account, still render the form. Only the submit area shows Connect Wallet or Switch Chain using DEX's existing flow.
15. **Single File Structure** — All spot-related components and hooks can live in one file. Order by type: imports, types/constants, component wrappers, small UI, section components, main export.

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
  const panel = useOrderHistoryPanel();  // Must be inside SpotProvider
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById("spot-modal-root") || document.body);
  }, []);

  return isOpen && container
    ? createPortal(<OrderHistoryModal panel={panel} />, container)
    : null;
}
```

## File Structure

```tsx
// ============ Imports ============
import { SpotProvider, Module, ... } from "@orbs-network/spot-react";

// ============ Types / constants ============
const MODULE_TABS = [ ... ];

// ============ Component wrappers ============
const TwapButton = (props: ButtonProps) => <Button {...props} />;
const TwapTooltip = (props: TooltipProps) => <Tooltip {...props} />;

// ============ Small UI / helpers ============
function LabelWithTooltip({ label, tooltip }) { ... }

// ============ Section components ============
function TokenInputsSection() { ... }
function DurationSection() { ... }
function PriceConfigSection({ module }) { ... }
function SubmitOrderSection() { ... }
function OrderHistorySection() { ... }

// ============ Main export ============
export function SpotForm({ swapType }) { ... }
```

## Final Checklist

- [ ] `@orbs-network/spot-react@latest` installed (no other packages)
- [ ] Components passed: Button, Tooltip, TokenLogo, Spinner
- [ ] `typedInputAmount` + `resetTypedInputAmount` from DEX state
- [ ] `useToken` hook returns `{ address, symbol, decimals, logoUrl }`
- [ ] `refetchBalances` function passed
- [ ] Token inputs use DEX components unchanged
- [ ] All panels display label + tooltip from hooks
- [ ] Duration/interval panels use Input + Select
- [ ] Submit modal uses `Components.SubmitOrderPanel` + `reviewDetails` with disclaimer + buttons
- [ ] Order history modal uses `Components.Orders`
- [ ] DEX styles applied to orders list, selected order view, submit order content
- [ ] Price Protection setting persisted
- [ ] Callbacks wired for toasts
- [ ] Spot tabs in same container as Swap tab
