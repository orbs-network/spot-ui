# Starting without a DEX

Use this path for a new React trading app or an existing React app with no DEX services. `SpotProvider` manages Spot form/execution state; it does not connect wallets, supply token lists, read balances, fetch host quotes/prices, or render the application. Build those missing host services before wiring the provider.

## Establish scope and the host layer

Inspect the repository for an app, design system, wallet/read clients, chain/token registry, balances, quote/price resources, and source state. Keep every suitable existing piece. If the project is empty, scaffold a minimal React app with compatible dependencies using the user's chosen stack or a suitable small default. Add one wallet/read stack only when absent; Spot imposes no particular wallet or query library. Check current official documentation and peer requirements before selecting dependencies.

Infer the requested networks, order types, and token restrictions from the request/project, asking only unresolved product questions. Start with that scope; a new app does not automatically need every module, history, charts, bridging, multiple routing venues, or a backend. The real partner/chain must be activated: follow [Quickstart](01-quickstart.md#missing-partner-or-chain-activation) and finish independent work while activation is pending. Do not borrow another DEX's partner. Replace example partners and DEX placeholders in the bundled skeleton with actual configuration and implemented services.

Create focused host hooks/services for the missing capabilities; do not put wallet reads, token loading, quoting, and all UI into one provider component:

| Capability | What the agent implements |
| --- | --- |
| Chains and RPC | One registry for chain IDs, RPC/read clients, native symbol/decimals, verified wrapped-native tokens, and explorer links. Share it with wallet/network controls; verify actual RPC chain IDs and browser access. Private service credentials stay server-side when required. |
| Wallet | Connect/disconnect, active account/chain, network switching, receipt-confirmed writes, and the installed `walletInteractions` methods. Inspect the installed contract rather than inventing wallet methods. The current contract requires a cancellation adapter even when cancellation UI is out of scope; that does not require adding a history screen. A preview address is only for quoting. |
| Token list | A maintained chain-specific list or verified curated set, searchable selectors, and loading/error/retry states. Validate addresses/decimals and key by chain plus normalized address. Keep non-18 decimals intact; never use symbols as identity or guess 18 decimals. Add the native sentinel separately from its wrapped ERC-20 token. Custom-token import is optional. |
| Balances | Native balance and ERC-20 `balanceOf(account)` for selected tokens, keyed by account/chain/token and held as raw integer strings. Disconnected/loading/error is unavailable; a confirmed zero is `"0"`. Track a visible read error separately, and refresh after relevant confirmed writes and order events. Account/chain/token changes invalidate old balances. |
| Host state | Selected tokens, typed amount, slippage, and requested navigation in one small state layer. Local state can be enough; do not add a global store just for Spot. Let focused Spot hooks own their price/schedule/execution state rather than mirroring it in the host. |
| Quote resource | Use the installed SDK `getQuote`/`client.getQuote` when no router exists; another venue is unnecessary. Quote the complete raw input with the actual partner/chain, using the wrapped token for native input. Omit `dexMinAmountOut` without a competing quote. Debounce/refresh as appropriate, key by the full request, and cancel/ignore obsolete responses. Expose loading, no-liquidity, error, and retry state. |
| USD data | Preserve current quote USD totals and fetch positive, finite one-token USD prices when those totals are insufficient for calculation/display. Verify chain/token coverage independently of the token list. Do not invent prices or substitute a USD ratio for the executable quote. Missing input valuation keeps calculated forms unready. |
| UI | Amount/token controls, connect/switch-network actions, requested Spot controls, review/disclaimer, execution progress, validation, and recoverable service errors. Use the app's primitives; when none exist, create a small consistent set. Optional `swap-ui` components can supply the documented progress flow after verifying compatibility. |

Scope source values and caches to their identities so changing the account, chain, pair, or amount cannot render old data as current. Spot `Token` objects contain address, symbol, decimals, and optional logo, but no chain ID; retain chain identity in the host registry and caches.

## Wire the provider after the services exist

Read [Provider setup](02-provider.md) and the relevant [Panels](03-panels.md). Pass actual selected tokens, `wrappedNativeToken`, `inputAmountUi`, connected account/chain, raw `inputBalanceRaw`, available USD prices, and a stable wallet adapter into `SpotProvider`.

For swaps, retain the complete SDK quote and pass
`marketQuote={{ quote: currentQuote, isLoading, noLiquidity }}`. The provider
derives amount/USD fields and uses the original request for refresh before
signing. A flat amount-only adapter cannot supply that request. For advanced
adapters, these flat mappings remain available in the installed API:

| SDK quote field | `marketQuote` field |
| --- | --- |
| `netAmountOut` | `quotedOutputAmountRaw` |
| `minimumAmountOut` | `minimumOutputAmountRaw` (unchanged when used) |
| `inputAmountUsd` | `inputAmountUsd` |
| `netAmountOutUsd` | `quotedOutputAmountUsd` |
| `minimumAmountOutUsd` | `minimumOutputAmountUsd` |

Use `isLoading`/`noLiquidity` for the corresponding resource states; expose quote errors in the host UI. Withhold stale quote objects/fields during replacement requests. Swap execution validates the captured quote against the form before wallet writes, then calls `client.refreshAndPrepareSwap` after approval. The helper reuses quotes up to 20 seconds old or refreshes the original request and compares protected minima; a decrease requires fresh review. Both paths prepare new signing timestamps/nonce, so the agent need not add a separate age check. Quote USD totals describe the complete quoted amount; `inputTokenUsdPrice`/`outputTokenUsdPrice` describe one whole token.

Use `useOrderForm()` and `useSubmitButton()` for validation/readiness; inspect installed `form.notReadyReason` and `disabledReason` when available. The host still renders connect/switch-network actions and owns wallet/balance policy. Use `useExecution()` for provider execution, pause obsolete quotes during execution, and keep the provider mounted while tracking is needed. Confirm native wrapping/approval receipts, preserve native gas funds using wallet estimation, and return the original wallet signature unchanged.

Wire relevant callbacks to balance refresh. Retain input on rejection/failure, wait for a fill before swap success, and follow the installed reset/unconfirmed-recovery contract. Add history/cancellation only if requested, within provider scope or a context-preserving portal.

## Verify and explain completion

Run build/typechecks and relevant existing checks; respect the user's constraints on new files/tests. Check the actual app at desktop/mobile sizes: disconnected preview, wallet/network controls, token loading/error/retry, real zero balances versus RPC errors, decimal precision, invalidation on context changes, and requested controls. Verify exact quote/minimum/USD mapping and understandable missing-config/price states. Label mocked checks and do not sign, submit, or cancel live orders without explicit authorization.

Hand off the working host services and requested UI, the checks actually run, and a concrete next action for each external blocker. Mock token lists, balances, or quotes establish a prototype; do not present them as live services or ask a nondeveloper to write the missing adapters.
