# Integration Principles

For a new or non-DEX app, first use [Starting without a DEX](08-starting-without-dex.md) to create the missing host services and a small set of UI primitives. References to existing DEX controls/state below mean reuse them when present; otherwise use the host layer just established.

## Rules

1. **Token Inputs = Exact DEX Copy** — Must look exactly like the DEX swap UI.
2. **Module Navigation** — Add only the requested modules through the DEX's existing router/query navigation. A single-module request does not imply every Spot tab.
3. **Use DEX Components As-Is** — Don't modify DEX components. If one doesn't exist (e.g. Select, Switch), create a new one using DEX styles. Never use generic web components.
4. **Review and Progress** — Reuse the requested host review/progress flow and its modal shell when applicable. If adopting the documented `@orbs-network/swap-ui` flow, first verify its installed exports and adapt its appearance to the DEX.
5. **Use Portals for Context** — If rendering elements outside AdvancedOrdersProvider scope, use Portal to maintain context access.
6. **Hooks in Components, Context for Shared Props** — Each component calls the focused Spot hook it needs or the DEX-owned Spot adapter hook directly. Never pass values to a child when that child can get them from a hook. If many props are passed through children, create a focused local context/hook for the shared DEX adapter state, callbacks, formatting helpers, or UI state.
7. **Verify Before Using** — Always check: types are correct, components exist in DEX, imports from spot-react are valid.
8. **Never Import from dist** — Always `@orbs-network/spot-react`, never `@orbs-network/spot-react/dist/*`.
9. **Layout Placement** — When adding requested Spot tabs, use the DEX's existing swap container and navigation. A router-source integration does not require a new form or tabs.
10. **Format Display Values** — Convert raw Spot amounts into the DEX's native amount type when possible, then display with the DEX formatter or `.toSignificant()` / `.toExact()`.
11. **Only Needed Dependencies** — Inspect the installed SDK/React versions and public exports before changing packages. Install only missing, compatible dependencies with the host package manager; preserve existing versions and the lockfile. Add `@orbs-network/swap-ui` only when adopting its progress flow. Import SDK helpers from `@orbs-network/spot-react`; no separate core install is needed. Spot requires no particular wallet, query, or numeric library, but a new host still needs wallet/read capabilities and exact amount conversion.
12. **Don't Recreate Error Boundary** — spot-react includes its own ErrorBoundary. Don't add another one around it.
13. **Form Always Visible** — If no chainId/account, still render the form. Only the submit area shows Connect Wallet or Switch Chain using DEX's existing flow.
14. **Split Big Files** — A tiny integration can start in one file, but production integrations should split large files into focused `components`, `hooks`, `context`, and `utils` files. Do not leave one giant file that mixes provider setup, wallet adapters, form sections, modals, history rows, formatting, and transaction helpers.
15. **Balance Refetch via Callbacks** — Wire `refetchBalances` into the supported lifecycle callbacks relevant to the implemented flow. Add progress/cancellation refresh only when those features are in scope.
16. **Input Reset in onClose** — Ignore close/reset requests while `isExecuting` is true. Clear the DEX input only when `isSuccess` is true inside the modal's `onClose` callback. On success call `startNewOrder()`; on failed/rejected submissions keep the input and call `returnToOrderForm()` (see [02-provider.md](02-provider.md)).
17. **Translations** — The SDK returns string keys for disclaimers and errors. Resolve via your own i18n system. Register all disclaimer defaults from [03-panels.md](03-panels.md#disclaimer-panel) and fall back to the English copy when a translation is missing, empty, or returns the key.
18. **Direct Provider Props** — Pass values directly to `AdvancedOrdersProvider`. Do not create `useAdvancedOrdersProviderProps()` wrappers that hide simple prop wiring.
19. **DEX Swap State Context** — Keep selected tokens, typed amount, balances, USD amounts, and quote state in the DEX swap form context/store. If Spot components need shared access or the same props are passed to multiple children, expose a small Spot adapter context rather than prop-drilling.
20. **Connected Chain Source** — Use the connected account/wallet chain id for Spot config, provider props, token conversion, and history links. Do not mix it with quote/router chain sources.
21. **Token Selector Lock** — If reusing the DEX token selector, hide chain selection for Spot. Network changes should go through the DEX network control.
22. **Submit Progress Mode** — Once `useExecution().status` is set and `isPreparingOrder` is false, hide review details, submit button, and secondary modal footer close/cancel actions. The progress/success/failure content owns the modal.
23. **Order Created Toast** — Avoid a toast on `onOrderCreated` unless explicitly requested. Refetch balances silently; keep toasts for fills, cancellation, copy, and errors.
24. **Requested History** — Add history/cancellation only when requested. For large lists use existing virtualization when available and store the selected order's stable `historyKey`, not the selected order object or collision-prone v1 numeric id.
25. **No Hidden Unsupported Chain** — Spot never substitutes another chain. Its client and submission remain disabled until the connected wallet is on a supported chain; show the host DEX's switch-network control.
26. **Visual References Are Structural** — Use [05-ui-reference.md](05-ui-reference.md) and the bundled screenshots for layout, hierarchy, density, and flow states. Adapt colors, backgrounds, radii, typography, and token-logo rendering to the integrated DEX.
27. **Shared Spot Client** — Let `spot-react` initialize the keyed `spot-ui` client. Do not add a DEX-owned `/config` request or pass RePermit configuration through local context; the SDK client owns all configuration-derived order and transaction-request values, while `calculateOrder` keeps defaults, validation, preview/display amounts, and order construction aligned.
28. **Configuration Boundary** — Inspect the installed `useClient()` loading/error state rather than treating every missing client as loading. Keep submission disabled while unavailable and give `AdvancedOrdersProvider` a DEX-native `clientErrorFallback`. The fallback receives `error`, `retry`, and `isRetrying`, keeping failures recoverable without recreating configuration state in child contexts.
29. **Trusted Configuration Boundary** — The SDK rejects chain mismatches and malformed or zero RePermit/adapter addresses, then uses the remaining `/config` contract values for approvals, cancellation, and order construction. It does not verify deployed bytecode or contract identity, so only use the trusted Orbs endpoint over TLS.
30. **Preserve Wallet Signatures** — Return the wallet's original `0x`-prefixed value from `signOrder`. Spot submits it unchanged; do not split it into `{ v, r, s }`, rewrite `v`, or normalize its bytes.

31. **Tooltip Defaults** — Include tooltips on the corresponding Spot controls and detail rows using [06-tooltips.md](06-tooltips.md). Use the reference app's default copy through the DEX tooltip/i18n components, including a non-empty English fallback.

## Module Navigation

Use the DEX navigation pattern. Render the Swap tab with the provider-free client
flow; only advanced tabs enter `AdvancedOrdersProvider`. Map those tabs to the
exported `AdvancedOrderModule`:

```tsx
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Module, type AdvancedOrderModule } from "@orbs-network/spot-react";

// DEX-owned view mounted only for advanced-order tabs; Swap has its own view.
function AdvancedOrdersTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const module = useMemo<AdvancedOrderModule>(() => {
    const tab = searchParams.get("tab");
    if (tab === "limit") return Module.LIMIT;
    if (tab === "stop-loss") return Module.STOP_LOSS;
    if (tab === "take-profit") return Module.TAKE_PROFIT;
    return Module.TWAP;
  }, [searchParams]);

  const handleModuleChange = useCallback((next: AdvancedOrderModule) => {
    const tabs = {
      [Module.TWAP]: "twap",
      [Module.LIMIT]: "limit",
      [Module.STOP_LOSS]: "stop-loss",
      [Module.TAKE_PROFIT]: "take-profit",
    };
    router.push(`?tab=${tabs[next]}`, { scroll: false });
  }, [router]);

  return <AdvancedOrdersForm module={module} onModuleChange={handleModuleChange} />;
}
```

`AdvancedOrdersForm` is a DEX-owned component containing the provider and its
requested panels, not an SDK export. Keep that provider mounted across advanced
tab changes and while an execution is active.


## Portals

If rendering elements outside AdvancedOrdersProvider scope (modals, tooltips), use Portal:

```tsx
import { createPortal } from "react-dom";

function OrderHistoryWithPortal() {
  const { data } = useOrders(); // Must be inside AdvancedOrdersProvider
  const orders = data?.all ?? [];
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

| Panel | SWAP | TWAP | LIMIT | STOP_LOSS | TAKE_PROFIT |
| --- | --- | --- | --- | --- | --- |
| Trades amount | — | Yes | — | — | — |
| Fill delay | — | Yes | — | — | — |
| Duration | — (fixed 3 min) | — | Yes | Yes | Yes |
| Limit price | — | Yes (toggle) | Yes (always on) | Yes (toggle) | Yes (toggle) |
| Trigger price | — | — | — | Yes | Yes |
| Setting | UI Slippage | Price Protection | Price Protection | Price Protection | Price Protection |

Swap submit review hides limit price and expiration. Its loading state lasts through settlement. See [Swap and Migration](07-swap-and-migration.md).

## File Structure

Start simple, then split when the file is getting large or sections need their
own hooks/state. Follow the host DEX folder conventions. This is one possible
shape for a full integration; omit unrequested modules/history and unnecessary
context or utility files:

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

Keep focused Spot hook calls in the component that renders the data whenever possible. Use context for DEX-owned values/actions that many children need: selected currencies, typed amount setters, DEX balance/quote formatting, modal open state, token selector actions, copied-to-clipboard feedback, and DEX-specific callbacks. Do not create context just to re-export every Spot panel.

## Final Checklist

Apply only the checks relevant to the requested integration. Inspect the
installed API before copying a method, type, or component from these references;
use [Quickstart](01-quickstart.md) for compatible-version fallbacks.

- [ ] Requested submit review follows the applicable [03-panels.md](03-panels.md) rows and states, using DEX formatting and the relevant disclaimer

- [ ] Implemented controls use the relevant tooltip defaults from [06-tooltips.md](06-tooltips.md), including fallback text for missing or empty translations

- [ ] The installed `@orbs-network/spot-react` release and React peers are compatible; only necessary package changes were made, preserving selected versions and the host lockfile
- [ ] If adopting `@orbs-network/swap-ui`, its installed exports are verified and adapted to the host progress UI; no dependency was added solely because it appears in an example
- [ ] For provider execution, `walletInteractions` satisfies the installed contract; write methods wait for successful receipts and `signOrder` returns the wallet signature unchanged
- [ ] For a form integration, `inputAmountUi` comes from DEX state
- [ ] Existing host state/hooks are reused; a new local adapter context exists only where multiple components need shared host values/actions
- [ ] Shared dependencies stay focused; small prop lists do not trigger an unnecessary context or second global store
- [ ] Substantial integration files are split where complexity warrants it, without creating empty or unneeded architecture for a narrow task
- [ ] Advanced form quotes match the current full input and can use flat raw/USD fields or an optional SDK quote for valuation. Swaps pass the original reviewed `SwapQuote` directly to the client. Balances use raw units and unit USD prices describe one token
- [ ] For swaps, obsolete quotes pause/cancel during execution, and success appears only after a fill; account history is not required for settlement
- [ ] Requested swap review hides limit price and expiration; UI Slippage remains separate from fixed 500 bps signed protection
- [ ] Provider/native-input integrations use the DEX's chain configuration for `wrappedNativeToken`
- [ ] Quote freshness handled so stale output is not shown after input amount changes
- [ ] `chainId` comes from connected account/wallet state everywhere Spot uses it
- [ ] Submit area blocks unsupported/missing connected chains with the DEX switch-network flow
- [ ] Provider modal close/reset is blocked during active execution; unconfirmed dismissal preserves the snapshot and blocks reset/new submission. Definitive outcomes follow the installed reset/dismissal contract
- [ ] Relevant lifecycle callbacks refresh balances; history progress/cancellation callbacks are included only when implemented
- [ ] Token inputs use DEX components unchanged
- [ ] Token selector chain switching hidden/disabled for Spot
- [ ] Requested duration/interval panels use the DEX's controls with supported `TimeUnit` options
- [ ] Raw panel/history amounts converted into DEX amount objects before display when possible
- [ ] Provider review/progress uses the installed `useExecution()`/`useOrderForm()` contract; router-only work retains the host wallet/progress flow
- [ ] If the documented `@orbs-network/swap-ui` flow is adopted, its progress/success/failure states are wired using verified installed exports
- [ ] Implemented provider progress hides review/duplicate-submit actions while execution owns the modal, with explicit unconfirmed recovery
- [ ] Provider configuration failures use a localized, DEX-native `clientErrorFallback` with retry
- [ ] Submit remains disabled while RePermit configuration is loading or unavailable
- [ ] If cancellation is requested, it uses installed `useCancelOrder(order)`
- [ ] If history is requested, it uses installed `useOrders()`/`useHistoryOrder()`, stable `historyKey` identity, and existing virtualization for large lists
- [ ] DEX styles are applied to the implemented form/progress/history surfaces
- [ ] Implemented swap/advanced settings persist through the existing host settings store
- [ ] Callbacks wired for balance refetch; no order-created toast unless explicitly requested
- [ ] Only requested modules/tabs were added, using existing navigation and placement
- [ ] Applicable disclaimer defaults from [03-panels.md](03-panels.md#disclaimer-panel) are registered in i18n, with non-empty fallbacks and the required link
- [ ] Powered-by-Orbs attribution/link included if required by the integration agreement, using DEX-native styling
- [ ] Changed UI was checked against the applicable [UI references](05-ui-reference.md), preserving the host DEX theme and the requested scope
