# Integration Principles

## Existing App Components

- First locate the existing `App`, swap/order-form component, and the components already used for token input, settings, submission, dialogs, progress, and history.
- Extend that component tree in place. Reuse the app's component APIs, styling variants, responsive behavior, accessibility patterns, and translation/error surfaces.
- Do not create a new UI component file, parallel Spot application/page, replacement order form, wrapper component, or Spot-only design-system primitive. If code must be extracted, keep it non-visual: typed adapters, pure mappings, selectors, or service/state modules.
- Preserve the app's existing router, provider, wallet, modal, and error-boundary ownership. Insert Spot behavior at the established extension points rather than wrapping the application in another UI root.
- Do not funnel the entire Spot model through the root `App` as one large prop object. Connect each existing component to the smallest state slice it needs using the application's established pattern.

## Optimized State Management

Classify state before wiring it:

| Class | Examples | Treatment |
| --- | --- | --- |
| Editable source state | module, amount, price input, trade count, interval, duration | Store once in the existing local/global app state |
| External source state | quote, balances, USD prices, account, chain | Reuse existing data/wallet caches and freshness metadata |
| Pure derived state | `CalculatedOrderForm`, validation, display amounts | Memoized/computed selector over exact primitive dependencies; never mirror into writable state |
| Keyed resource | `SpotClient` | One shared promise/client per partner+chain, outside broad render subscriptions |
| Remote collection | order history | Cache by partner+chain+account+page+limit with visibility-aware, non-overlapping polling |
| Transient workflow | submitting, execution step, cancellation by `historyKey` | Small independent state machine; update atomically |

- Reuse the application's store/composable/service. Do not install or create another global state store for Spot.
- Subscribe existing components to narrow selectors and use the state library's shallow/field equality where applicable. A price-label update should not rerender history, and a history poll should not rerender the form.
- Build the calculation dependency key from primitive form/market values. Do not depend on freshly allocated aggregate objects if the framework would recompute on identity alone.
- Batch related source updates, such as a token-pair change and quote invalidation, so consumers never render a mixed snapshot.
- Keep callbacks stable where the framework or store subscription semantics depend on identity, while avoiding blanket memoization that adds no subscription benefit.
- Deduplicate client initialization, quote requests, allowance verification, and history polls by their natural keys. Cancel or ignore obsolete requests when account, chain, token pair, or input changes.
- Preserve structural sharing in history: retain unchanged order objects/rows by `historyKey` and replace only changed records.
- Keep execution progress local to the established progress/dialog surface and cancellation progress keyed by order. Do not put rapidly changing workflow state in the root app state unless multiple existing components truly consume it.
- Verify performance with the framework's profiler or render diagnostics when available; confirm that typing changes only the existing form consumers and that background history polling does not rerender the form.

## Architecture

- Keep the SDK adapter at the host's service/state boundary. Existing UI components should consume narrow host-owned state rather than call wallet and order APIs ad hoc.
- Keep one source of truth for selected module, tokens, amount, quote, price controls, schedule, account, and chain.
- Make the form calculation a pure derived value. Do not copy calculated raw execution values back into editable state.
- Keep configured operations on the `SpotClient`; do not expose RePermit internals throughout the application.
- Model client initialization, submission, cancellation, and history as distinct state machines so one failure does not unmount or erase the order form.
- Use the host's existing chain configuration and wallet abstraction. Spot should not become a second network registry or wallet stack.

## TypeScript Shape

- Use type-only imports for `SpotClient`, `CalculatedOrderForm`, request types, and `Order`.
- Give exported adapter methods explicit return types.
- Prefer a narrow host `SpotWalletPort` over leaking a wallet SDK's large client type into the integration.
- Treat caught values as `unknown`; narrow with `isTxRejected` and the host's error formatter.
- Use `satisfies` when defining constant calculation inputs or wallet ports so literal enum values remain precise.
- Exhaustively map `Module`, `OrderStatus`, and `InputErrors` when the host presents module-specific UI or translations.
- Do not cast UI decimal strings into raw values. Let `calculateOrderForm` perform decimal conversion and validation.

## Final Checklist

- [ ] `@orbs-network/spot-ui` is installed and every import comes from its package root.
- [ ] Spot is wired into the existing `App`/order-form component tree; no new UI component, page, form, wrapper, or design-system primitive was created.
- [ ] All controls, dialogs, progress views, history rows, loading states, errors, styling, and accessibility behavior reuse existing app components.
- [ ] The existing app state solution is reused; no second global store was added.
- [ ] Editable/external source state is stored once, and `CalculatedOrderForm` remains a memoized/computed derivation rather than mirrored state.
- [ ] Existing components subscribe to narrow fields with appropriate equality; client/wallet objects are kept outside broadly reactive state.
- [ ] History polling does not rerender the form, and form typing does not rerender unrelated history/progress surfaces.
- [ ] The partner/chain is returned by `getPartnerChains(partner)`; no protocol addresses are hard-coded.
- [ ] The connected wallet chain is the source of truth for client selection and transaction writes.
- [ ] The host provides the chain's wrapped-native token and explorer metadata.
- [ ] For new chains, the [chain integration checks](06-chain-integration.md) pass through the app's actual read client, token loader, and price adapter, including native-token balance and USD values; unavailable external checks are reported explicitly.
- [ ] A current raw output quote is passed for the complete current input amount; stale quotes are omitted.
- [ ] `inputTokenUsdPrice` and `outputTokenUsdPrice` are one-token USD prices, and `inputBalanceRaw` is raw.
- [ ] `minTradeSizeUsd`, `priceProtectionPercent`, and optional `displayFeePercent` use the documented units.
- [ ] All form defaults, validation, prices, trades, schedule, and raw execution values come from `calculateOrderForm`.
- [ ] Field errors and `form.errors.primary` are localized, and submission uses `form.canSubmit`.
- [ ] Explicit `tradeCount` is not silently clamped after amount changes.
- [ ] The client is reused per partner/chain, and rejected initialization can be retried.
- [ ] Native input is wrapped and normalized to the wrapped token before approval/signing.
- [ ] Allowance uses the normalized input token, exact raw input amount, and `client.spenderAddress`.
- [ ] Wallet writes wait for confirmed receipts; post-approval allowance is verified with a bounded retry.
- [ ] `prepareOrder` runs immediately before signing, after wrapping and approval.
- [ ] The signing adapter returns the original `0x` signature unchanged.
- [ ] Concurrent submission and cancellation prompts are prevented.
- [ ] Ambiguous submission failures are reconciled before another order is prepared.
- [ ] History is fetched through the configured client and keyed by `order.historyKey`.
- [ ] Cancellation uses `client.getCancelOrderRequest(order)` and refreshes normalized history after confirmation.
- [ ] Raw history and transaction values are never rendered without the correct token-decimal formatting.
