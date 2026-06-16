# Integration Principles

## Rules

1. **Token Inputs = Exact DEX Copy** — Must look exactly like the DEX swap UI.
2. **4 Module Tabs** — TWAP, Limit, Stop-Loss, Take-Profit. Use router/query params for navigation (same pattern as DEX).
3. **Use DEX Components As-Is** — Don't modify DEX components. If one doesn't exist (e.g. Select, Switch), create a new one using DEX styles. Never use generic web components.
4. **Modals Required** — Submit order in a modal. Use `@orbs-network/swap-ui` for the order creation/progress flow content, wrapped in the same modal shell the DEX uses for token select or settings when possible.
5. **Use Portals for Context** — If rendering elements outside SpotProvider scope, use Portal to maintain context access.
6. **Hooks in Components, Context for Shared Props** — Each component calls `useSpot()` or the DEX-owned Spot adapter hook directly. Never pass values to a child when that child can get them from a hook. If many props are passed through children, create a focused local context/hook for the shared DEX adapter state, callbacks, formatting helpers, or UI state.
7. **Verify Before Using** — Always check: types are correct, components exist in DEX, imports from spot-react are valid.
8. **Never Import from dist** — Always `@orbs-network/spot-react`, never `@orbs-network/spot-react/dist/*`.
9. **Layout Placement** — Spot form next to the swap panel. Spot tabs and swap tab in the same container (e.g. Swap | TWAP | Limit | Stop-Loss | Take-Profit).
10. **Format Display Values** — Convert raw Spot amounts into the DEX's native amount type when possible, then display with the DEX formatter or `.toSignificant()` / `.toExact()`.
11. **No Extra Packages Beyond Spot UI Needs** — Install only `@orbs-network/spot-react`, `@orbs-network/swap-ui`, and `spot-react` peer dependencies. Use what the DEX already has for everything else.
12. **Don't Recreate Error Boundary** — spot-react includes its own ErrorBoundary. Don't add another one around it.
13. **Form Always Visible** — If no chainId/account, still render the form. Only the submit area shows Connect Wallet or Switch Chain using DEX's existing flow.
14. **Split Big Files** — A tiny integration can start in one file, but production integrations should split large files into focused `components`, `hooks`, `context`, and `utils` files. Do not leave one giant file that mixes provider setup, wallet adapters, form sections, modals, history rows, formatting, and transaction helpers.
15. **Balance Refetch via Callbacks** — Wire `refetchBalances` into `onWrapSuccess`, `onOrderCreated`, `onOrderFilled`, `onOrdersProgressUpdate`, and `onCancelOrderSuccess`. Do not pass it as a prop.
16. **Input Reset in onClose** — Clear the DEX input only when `isSuccess` is true inside the modal's `onClose` callback. On success call `resetState()`; on failed/rejected submissions keep the input and call `resetCurrentSwap()` (see [02-provider.md](02-provider.md)).
17. **Translations** — The SDK returns string keys for disclaimers and errors. Resolve via your own i18n system.
18. **Direct Provider Props** — Pass values directly to `SpotProvider`. Do not create `useSpotProviderProps()` wrappers that hide simple prop wiring.
19. **DEX Swap State Context** — Keep selected tokens, typed amount, balances, USD amounts, and quote state in the DEX swap form context/store. If Spot components need shared access or the same props are passed to multiple children, expose a small Spot adapter context rather than prop-drilling.
20. **Connected Chain Source** — Use the connected account/wallet chain id for Spot config, provider props, token conversion, and history links. Do not mix it with quote/router chain sources.
21. **Token Selector Lock** — If reusing the DEX token selector, hide chain selection for Spot. Network changes should go through the DEX network control.
22. **Submit Progress Mode** — Once `orderExecutionPanel.status` is set, hide review details, submit button, and secondary modal footer close/cancel actions. The progress/success/failure content owns the modal.
23. **Order Created Toast** — Avoid a toast on `onOrderCreated` unless explicitly requested. Refetch balances silently; keep toasts for fills, cancellation, copy, and errors.
24. **Virtualized History** — Use existing virtualization for order history and fills lists when available. Store selected order id, not the selected order object.
25. **No Hidden Unsupported Chain** — Because Spot can fall back internally to a supported partner chain for config, the host DEX must visibly block submission until the connected wallet is on a supported chain.
26. **Visual References Are Structural** — Use [05-ui-reference.md](05-ui-reference.md) and the bundled screenshots for layout, hierarchy, density, and flow states. Adapt colors, backgrounds, radii, typography, and token-logo rendering to the integrated DEX.

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

Start simple, then split when the file is getting large or when sections need their own hooks/state. Follow the host DEX folder conventions, but prefer a shape like:

```txt
components/spot/
  spot-form.tsx              # provider composition, module routing, top-level layout
  context.tsx                # DEX adapter context for shared DEX state/actions
  hooks.ts                   # DEX adapter hooks and derived helpers
  utils.ts                   # pure formatting/conversion helpers
  token-inputs-section.tsx
  price-config-section.tsx
  duration-section.tsx
  trade-size-section.tsx
  trade-interval-section.tsx
  submit-order-section.tsx
  submit-order-modal.tsx
  orders-modal.tsx
  orders-list.tsx
  order-details.tsx
  order-fills.tsx
```

Keep `useSpot()` calls in the component that renders the data whenever possible. Use context for DEX-owned values/actions that many children need: selected currencies, typed amount setters, DEX balance/quote formatting, modal open state, token selector actions, copied-to-clipboard feedback, and DEX-specific callbacks. Do not create context just to re-export every `useSpot()` panel.

## Final Checklist

- [ ] `@orbs-network/spot-react@latest` installed with all peer dependencies (no viem required)
- [ ] `@orbs-network/swap-ui@latest` installed and used for order creation/progress modal content
- [ ] `walletInteractions` provided with all 5 methods (`wrapNativeToken`, `approveToken`, `cancelOrder`, `signOrder`, `getAllowance`) and write methods wait for receipts
- [ ] `typedInputAmount` from DEX state
- [ ] DEX swap state exposed through local context/hook where needed; no prop drilling of hook-returned values
- [ ] Long child prop lists replaced with a focused local context/hook
- [ ] Large integration files split into focused components, hooks, context, and utils files
- [ ] `marketReferencePrice.value` uses the DEX quote output for the current input amount, and balances/USD prices are passed as raw wei / one-token USD values
- [ ] Quote freshness handled so stale output is not shown after input amount changes
- [ ] `chainId` comes from connected account/wallet state everywhere Spot uses it
- [ ] Submit area blocks unsupported/missing connected chains with the DEX switch-network flow
- [ ] Input reset handled in modal `onClose`: clear input and call `resetState()` on success; keep input and call `resetCurrentSwap()` after failed/rejected submissions
- [ ] Balance refetch handled via callbacks: wrap success, order created, order filled, order progress update, cancellation success
- [ ] Token inputs use DEX components unchanged
- [ ] Token selector chain switching hidden/disabled for Spot
- [ ] Duration/interval panels use Input + Select with `TimeUnit` options
- [ ] Raw panel/history amounts converted into DEX amount objects before display when possible
- [ ] Submit modal built using `useSpot().orderExecutionPanel` and `useSpot().derivedFormData`
- [ ] Submit modal progress/success/failure states rendered with `@orbs-network/swap-ui`
- [ ] Submit modal hides review details and submit/footer buttons while `orderExecutionPanel.status` is set
- [ ] Order cancellation uses `useCancelOrder(order)` hook
- [ ] Order history built using `useSpot().orderHistoryPanel` and `useDerivedHistoryOrder()`
- [ ] Order history and order fills virtualized for large lists; selected order stored by id
- [ ] DEX styles applied to orders list, selected order view, submit order content
- [ ] Price Protection setting persisted
- [ ] Callbacks wired for balance refetch; no order-created toast unless explicitly requested
- [ ] Spot tabs in same container as Swap tab
- [ ] Disclaimer keys resolved through i18n
- [ ] Powered-by-Orbs attribution/link included if required by the integration agreement, using DEX-native styling
- [ ] UI checked against [05-ui-reference.md](05-ui-reference.md), with the reference structure preserved and the host DEX theme applied
