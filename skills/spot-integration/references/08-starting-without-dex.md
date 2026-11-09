# Starting without a DEX

Use this path when the user wants a Spot trading experience but has no DEX, or has an app without trading services. Spot provides quotes, calculations, and order execution APIs; it does not provide a token catalog, RPC service, account balances, wallet connection, or a rendered trading app. Build the missing host layer as part of the integration.

## Establish the smallest product

Inspect the project once and classify each service below as present, missing, or externally blocked. Preserve an existing application's framework, design system, wallet, and data libraries. If no app exists, scaffold a minimal app using the user's chosen stack or a suitable small default; explain that choice without asking the user to design the architecture. For a React form, prefer the companion React skill when available.

Resolve only product decisions that change the deliverable: requested order types, networks, and any token restrictions. Infer them from the request or existing project where possible. Do not assume every module, a multi-venue router, history, charts, bridging, or a backend is required. Discover technical integration details from the SDK, chain, wallet, and data services' current official documentation.

The integration still needs its real Spot partner and supported chains. Follow [Quickstart's activation workflow](01-quickstart.md#missing-partner-or-chain); do not use another DEX's partner to make a demo appear executable. Finish independent host services and clearly identify any activation blocker. Examples contain DEX placeholders and sample partners: replace them with implemented adapters and the actual partner; copying a skeleton does not complete those services.

## Build the missing host services

| Service | Actions and contract |
| --- | --- |
| Network registry and read client | Configure selected chain IDs, RPC access, native currency, explorer, and verified wrapped-native token metadata. Use one registry for wallet, reads, selectors, and links. Verify the RPC chain ID and actual browser access. Keep private service credentials server-side if the selected service requires them. |
| Wallet connection | Connect/disconnect, expose the active account and chain, handle account/network changes, and provide the requested flow's signing, transaction, and receipt methods. Use one compatible wallet/read stack if none exists; Spot does not choose one. A disconnected preview account must never be used for signing. |
| Token catalog and selector | Load a maintained chain-specific list or a small verified curated set. Validate chain/address/decimals, deduplicate by chain plus normalized address, and support search/selection. Preserve correct decimals for non-18-decimal tokens; never identify tokens by symbol alone or default missing decimals to 18. Add the native asset separately with an SDK-supported native sentinel; keep its wrapped ERC-20 metadata distinct. Show loading/error/empty states with retry. Custom-token import is optional scope. |
| Balances | Read native balance through the chain client and ERC-20 `balanceOf(account)` for selected tokens; obtain decimals from verified metadata or the token contract. Keep raw integer strings for execution and format separately for display. Key reads by account, chain, and token. A confirmed zero is `"0"`; disconnected/loading/failed reads are unavailable, never fabricated zero. Refresh after confirmed wallet writes and relevant order lifecycle events. |
| Editable state and amounts | Own selected tokens, typed decimal amount, slippage, and requested navigation once in host state. Use the chosen wallet/numeric stack's exact decimal conversion or `calculateOrder` for forms; avoid JavaScript floating-point arithmetic for raw amounts. Invalidate dependent resources on account, chain, pair, or amount changes. |
| Quotes | With no existing router, use installed `client.getQuote` directly; no other DEX quote or aggregator is required. Convert the complete input to raw units, normalize native input to its verified wrapped token, and use the real partner/chain. Omit `dexMinAmountOut` when there is no competing DEX quote; the SDK defaults it to `"-1"`. Cache by the full request identity, cancel/ignore obsolete results, and provide loading, no-liquidity, retry, and refresh behavior. |
| USD valuation | For calculated forms, preserve current quote USD totals when supplied; otherwise fetch positive, finite one-token USD prices from a source covering the selected chain/tokens. Keep unavailable prices unavailable; never assume a token is worth $1 or derive executable output from a USD ratio. Input valuation is needed by form readiness/minimum-trade policy. The raw `refreshAndPrepareSwap` path itself needs neither decimals nor USD inputs; its UI and host policies may still need them. |
| Review and execution UI | Render selected tokens, input/output, exact protected minimum, applicable settings/disclaimers, wallet/network actions, validation, and pending/success/failure states. Keep submission unavailable while prerequisites are missing, and retain input on failure. Include only the requested price/schedule controls and history. |

Token-list availability does not prove RPC, balance, quote, or price coverage. Verify each service through the actual app. For more detail on native assets and network setup, read [Chain integration](06-chain-integration.md).

## Connect the services to Spot

1. Initialize a reusable client for the actual partner/chain; let it load protocol configuration. Approval spender and order contracts come from the client, not the token list or host constants.
2. For forms, derive `calculateOrder` from the host inputs and current quote, including available USD totals/prices. Display `form.errors` and, when exported, `form.notReadyReason`; require `form.canSubmit`. For a direct swap, keep the original quote/request and its exact `minimumAmountOut` for review and signing.
3. Implement the selected execution path in [Client and execution](03-client-and-execution.md) or [Swap and migration](07-swap-and-migration.md): confirm wrapping/approval and allowance, prepare immediately before signing, submit once, and track settlement. Native input needs both spendable native funds and gas; use the wallet's fee/estimation policy rather than spending its entire balance on wrapping.
4. Recheck the live account/chain before wallet writes and submission, lock duplicate starts, and reconcile uncertain outcomes. Refresh balances from relevant confirmed lifecycle events. Do not clear input or show a swap as complete on submission acceptance alone.

## Verify and hand off

Run the new host's build/typechecks and relevant existing checks; respect the user's constraints on new files/tests. In a browser verify disconnected preview, connect/switch-network controls, token-list loading/failure, a real zero balance versus an RPC failure, amount precision for different decimals, stale-resource invalidation, and requested module controls. Check quote/minimum mapping and missing USD/configuration states. Use mocks for unavailable interactions and label them; signing, submission, and cancellation need explicit authorization for live verification.

Report which host services now work, which read-only/live checks ran, and any remaining external activation or service configuration. A mocked token list, balance, or quote is a prototype, not a live integration. Give the user one concrete next action for each real blocker without asking them to implement technical adapters.
