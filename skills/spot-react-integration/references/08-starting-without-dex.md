# Starting without a DEX

Use this path for a new React trading app or an existing React app with no DEX services. `AdvancedOrdersProvider` manages advanced-order form/execution state; it does not connect wallets, supply token lists, read balances, fetch host quotes/prices, or render the application. Build those missing host services before wiring the provider.

## Establish scope and the host layer

Inspect the repository for an app, design system, wallet/read clients, chain/token registry, balances, quote/price resources, and source state. Keep every suitable existing piece. If the project is empty, scaffold a minimal React app with compatible dependencies using the user's chosen stack or a suitable small default. Add one wallet/read stack only when absent; Spot imposes no particular wallet or query library. Check current official documentation and peer requirements before selecting dependencies.

Infer the requested networks, order types, and token restrictions from the request/project, asking only unresolved product questions. Start with that scope; a new app does not automatically need every module, history, charts, bridging, multiple routing venues, or a backend. The real partner/chain must be activated: follow [Quickstart](01-quickstart.md#missing-partner-or-chain-activation) and finish independent work while activation is pending. Do not borrow another DEX's partner. Replace example partners and DEX placeholders in the bundled skeleton with actual configuration and implemented services.

Create focused host hooks/services for the missing capabilities; do not put wallet reads, token loading, quoting, and all UI into one provider component:

| Capability | What the agent implements |
| --- | --- |
| Chains and RPC | One registry for chain IDs, RPC/read clients, native symbol/decimals, verified wrapped-native tokens, and explorer links. Share it with wallet/network controls; verify actual RPC chain IDs and browser access. Private service credentials stay server-side when required. |
| Wallet | Connect/disconnect, active account/chain, network switching, receipt-confirmed writes, and the installed `walletInteractions` methods. Inspect the installed contract rather than inventing wallet methods. The advanced provider requires a cancellation adapter even when history UI is out of scope. Provider-free swaps use the host wallet services directly, with no core SDK adapter; neither path requires adding a history screen. A preview address is only for quoting. |
| Token list | A maintained chain-specific list or verified curated set, searchable selectors, and loading/error/retry states. Validate addresses/decimals and key by chain plus normalized address. Keep non-18 decimals intact; never use symbols as identity or guess 18 decimals. Add the native sentinel separately from its wrapped ERC-20 token. Custom-token import is optional. |
| Balances | Native balance and ERC-20 `balanceOf(account)` for selected tokens, keyed by account/chain/token and held as raw integer strings. Disconnected/loading/error is unavailable; a confirmed zero is `"0"`. Track a visible read error separately, and refresh after relevant confirmed writes and order events. Account/chain/token changes invalidate old balances. |
| Host state | Selected tokens, typed amount, slippage, and requested navigation in one small state layer. Local state can be enough; do not add a global store just for Spot. Let focused Spot hooks own their price/schedule/execution state rather than mirroring it in the host. |
| Quote resource | Use the installed SDK `getQuote`/`client.getQuote` when no router exists; another venue is unnecessary. Quote the complete raw ERC-20 input with the actual partner/chain. For advanced-provider execution, supply its required `WalletInteractions` decision and confirmed-transaction callbacks; provider-free swaps own those steps in host code; Advanced forms normalize native input to `wrappedNativeToken`; direct swap hosts quote the wrapped address themselves. Omit `dexMinAmountOut` without a competing quote. Debounce/refresh as appropriate, key by the full request, and cancel/ignore obsolete responses. Expose loading, no-liquidity, error, and retry state. |
| USD data | Fetch positive, finite one-token USD prices for the separate provider price props. Verify chain/token coverage independently of the token list. Direct swap previews may display SDK quote USD totals. Do not invent prices or substitute a USD ratio for the executable quote. Missing input valuation keeps calculated forms unready. |
| UI | Amount/token controls, connect/switch-network actions, requested Spot controls, review/disclaimer, execution progress, validation, and recoverable service errors. Use the app's primitives; when none exist, create a small consistent set. Optional `swap-ui` components can supply the documented progress flow after verifying compatibility. |

Scope source values and caches to their identities so changing the account, chain, pair, or amount cannot render old data as current. Spot `Token` objects contain address, symbol, decimals, and optional logo, but no chain ID; retain chain identity in the host registry and caches.

## Wire the provider after the services exist

Read [Provider setup](02-provider.md) and the relevant [Panels](03-panels.md). Pass actual selected tokens, `wrappedNativeToken`, `inputAmountUi`, connected account/chain, raw `inputBalanceRaw`, available USD prices, and a stable wallet adapter into `AdvancedOrdersProvider`.

Advanced forms receive a plain `MarketQuote` with exactly three optional fields:
`quotedOutputAmountRaw`, `isLoading`, and `noLiquidity`. If the host quotes through
the SDK, map the current result in its adapter outside the provider:

| SDK quote field | `marketQuote` field |
| --- | --- |
| `netAmountOut` | `quotedOutputAmountRaw` |

Use `isLoading`/`noLiquidity` for the corresponding resource states and expose
quote errors in the host UI. Withhold stale quote fields while replacing requests.
Supply one-token USD prices through `inputTokenUsdPrice` and `outputTokenUsdPrice`.
The swap UI displays output/minimum amounts and USD totals directly from its
quote, outside the advanced provider.

Use `useOrderForm()` and `useSubmitButton()` for advanced validation/readiness,
and `useExecution()` for advanced creation. Keep the provider mounted through the
attempt, pause obsolete quotes, confirm wrapping/approval receipts, and return
the original signature unchanged. Retain input on rejection/failure and follow
the installed reset/unconfirmed status-check contract. History/cancellation UI remains
optional and belongs inside advanced-provider scope or a context-preserving portal.

## Add swaps without a provider

Keep the host's swap form and its execution state outside `AdvancedOrdersProvider`.
Retain the reviewed SDK quote and confirm host wrapping/approval. Call
`client.prepareSwap({ quote, account, signal })`, publish its final quote,
sign its typed data inline, and submit the same order/original signature through
`client.submitSwap`. No advanced pricing/scheduling props or calculated swap
form is needed. Keep attempt state outside transient controls, own progress and
one status poller through `client.getOrder`, and preserve original signed identity
and accepted/latest order for reconciliation. Show completion only after a fill.
Use existing progress UI or compatible `swap-ui` presentation.
