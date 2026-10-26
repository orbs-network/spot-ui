# DEX SDK readiness and QuickSwap compatibility

Reviewed on 25 October 2026. Scope: the staged changes across spot-ui, spot-react, the demo, the deprecated Liquidity Hub package, and integration guides. The QuickSwap checkout was inspected as an integration reference and was not changed.

**Verdict:** the supported SDK flows are ready for QuickSwap integration after the fixes below. Production sign-off still needs a real wallet swap and cancellation on the deployment's target network. No real order was signed, submitted, or cancelled during this review, and no package was published.

## Findings fixed

1. **Settlement lookup failed against the live QuickSwap service.** `exchange=quick` returns HTTP 400 (`unknown exchange key "quick"`). Settlement now requests only the full signed order hash and chain, then verifies exact ID and chain locally. The hash already binds the exchange. This also avoids legacy exchange aliases hiding orders submitted through the current Spot adapter.
2. **QuickSwap history needed current and legacy adapter filters.** History maps `Partners.Quick` to the service's `quickswap` key and includes `client.exchangeAddress` alongside legacy adapters. Both configured history methods forward this adapter. Live requests confirmed the service expands the combined filter correctly.
3. **Existing calculator imports would break.** Both packages retain `calculateOrderForm` as a deprecated alias of `calculateOrder`. Runtime export tests and a CommonJS package smoke check verify the alias and all 39 SDK exports through spot-react.
4. **Source imports broke the Next.js production build.** The spot-react source entry now declares `"use client"`, matching its published bundle. The production demo build passes.
5. **A completion callback could be missed when indexed progress was unchanged.** History notifications now consider status changes. A transition to Completed fires `onOrderFilled` once, including when progress is still zero; a later progress update does not fire completion again.
6. **Late acceptance could enter another account's history.** The React cache insertion callback is scoped to the account, chain, partner, and adapter captured for that attempt. A late submission cannot enter a newly configured history resource. The original acceptance callback still receives the order ID.
7. **Same-token raw swaps were not rejected before wallet work.** Raw swap validation now rejects equal input and output addresses, ignoring case.
8. **Documentation contradicted implementation.** Corrected swap deadline margins, required minimum output, swap versus advanced-order protection settings, settlement phases, completion wording, polling ownership, history filters, and the raw DEX-router migration path. The shared allowance error now refers to submitting an order rather than only swapping.

Added regression coverage for the full QuickSwap-owned quote → prepare → submit original signature → settle path, both configured history methods, history resource changes, status-only completion, calculator compatibility, and same-token rejection.

## Functions a DEX needs

The SDK APIs below are available from both `@orbs-network/spot-ui` and `@orbs-network/spot-react`. A React application can install only spot-react and import these functions from it.

| DEX requirement | SDK support / host responsibility |
| --- | --- |
| Chain and partner configuration | `createClient(partner, chainId)` validates configuration; reuse the client |
| Quote candidate | `getQuote` carries request identity, receipt time, cancellation, and typed `QuoteError` classification |
| Slippage-adjusted minimum | `getMinimumOutputAmount`, using exact integer arithmetic and percentage units |
| Quote freshness | `isQuoteFresh` and optional `prepareSwap.maxQuoteAgeMillis`; the host chooses the age policy |
| Route eligibility | `isSwapSupported` and `SWAP_CAPABILITIES` gate unsupported requests |
| Native input | Host supplies the chain's wrapped token and confirms wrapping; optional `submitSwap` / `executeOrder` orchestration is available |
| Approval | `client.spenderAddress`, `prepared.approvalRequest`, and the host's confirmed allowance check; optional executor handles bounded allowance retries |
| Fresh signing payload | `client.prepareSwap` for raw router flows, or `calculateOrder` → `client.prepareOrder` for forms |
| EIP-712 signing | Host signs `prepared.signingRequest`; forward the wallet's original signature |
| Submission | `client.submitOrder` returns an accepted intent; `submitSwap` is the optional wallet orchestrator |
| Settlement | `waitForOrder({ order, signal })`: derives ID, chain, and deadline from the order; serial polling, abort support, indexing grace, and typed terminal/uncertain errors; no client needed |
| Order history | `client.getAccountOrders`, `client.getAccountOrdersResult`, and standalone `getOrders`; use configured client history for current and legacy adapters |
| Cancellation | `client.getCancelOrderRequest`; the host sends the contract call and confirms its receipt |
| Advanced orders | Calculation, preparation, execution, history, and cancellation remain available for TWAP, limit, stop-loss, and take-profit |
| React lifecycle and UI state | `SpotProvider`, `useOrderForm`, `useExecution`, `useSubmitButton`, `useOrders`, and `useCancelOrder` |
| Route competition | Host ranks matching input/pair/account/chain quotes and preserves its own gas and fee policy |
| Product preflight | Host owns balances, supported network selection, minimum trade policy, token metadata, and wallet context checks |
| Durable notifications | Host persists accepted order snapshots and passes the order to `waitForOrder` at app/store scope if a modal may unmount; its ID and deadline are derived from the order |

The router path needs no SpotProvider, form model, token decimals, USD prices, or wallet callback object. Use `getQuote` → `client.prepareSwap` → DEX signing → `client.submitOrder` → `waitForOrder`. The optional executor and React provider share wallet execution and settlement implementations.

The 26 October API cleanup removes redundant tracking arguments: `waitForOrder`
and the shared `watchOrder` stream accept only `order` and optional `signal`.
React consumes the stream for cache updates rather than injecting a client.
The router tracking helper also drops its client argument, and React execution
validates `chainId` directly rather than forwarding `hasChainId` separately.
Follow-up verification: 311 workspace tests pass, SDK builds and consumer/skill
typechecks pass, and all 40 SDK runtime exports are available through spot-react.
The verification table below records the original 25 October review.

The 26 October documentation pass adds consumer-facing JSDoc to all seven
`SpotClient` methods, client configuration fields, and the core quote, swap,
execution, tracking, calculation, conversion, and history helpers. Hovers explain
parameters, units, results, wallet responsibilities, and accepted versus filled
orders. Built-package TypeScript language-service checks confirm 84 documented
hover targets through both `spot-ui` and `spot-react` imports, including inherited
history filters and normalized order fields. SDK builds, typed examples, and the
published-package consumer typecheck pass. This pass changes documentation only.

## QuickSwap migration boundary

The existing QuickSwap app still uses `@orbs-network/liquidity-hub-sdk@1.0.97` for swaps and `@orbs-network/spot-react@2.1.16` for advanced orders. Its app migration is outside this review's scope.

During migration, replace the quote adapter, fixed Permit2 spender, quote-carried signing payload, and transaction-hash settlement record. Spot uses the configured spender, a freshly prepared order, and an order ID plus deadline. Keep QuickSwap's existing route competition, wallet steps, confirmation UI, gas policy, and app-level notification ownership.

Spot currently supports **exact input and signer-as-recipient**. Gate exact-output and alternate-recipient requests before wallet work and select another source. There is no Liquidity Hub-style DEX fallback calldata argument on Spot submission. Never start a fallback automatically after an accepted or ambiguously submitted intent; reconcile history first.

For form-based swaps, the minimum must come from the reviewed net quote and UI slippage. Swaps sign separate 500 bps oracle protection and expire after exactly 15 minutes. The form-based path still requires a positive input USD price for readiness and minimum-trade validation; the raw router path leaves that product policy to the host.

## Verification

| Check | Result |
| --- | --- |
| spot-ui tests | 159 passed |
| spot-react tests | 89 passed |
| Liquidity Hub compatibility tests | 21 passed |
| Demo tests | 21 passed |
| Publish-script tests | 25 passed |
| All three SDK builds and typed SDK examples | Passed |
| Published-package consumer typecheck (`typecheck:dist`) | Passed |
| Integration skill/example typecheck | Passed |
| Demo source typecheck | Passed |
| Next.js production build | Passed |
| Demo lint | No errors; three existing warnings in unchanged files |
| CommonJS package smoke | All 39 spot-ui runtime exports available through spot-react; calculator alias preserved |
| Skill manifests and router example synchronization | Passed |
| Live Polygon / QuickSwap configuration and preview quote | Passed |
| Live raw preparation | Exact reviewed minimum, 500 bps signed protection, 900-second duration |
| Live SDK single-order lookup | Passed; an unknown full ID returns `undefined` |
| Live configured history APIs | Both passed for a preview account with empty history |
| Browser check | QuickSwap selection, disconnected/unsupported-network state, mobile slippage settings, Escape dismissal, and responsive layout checked; no console errors and no mobile horizontal overflow |

Browser coverage did not include connected-wallet approval, signing, fill, or cancellation. The development wallet dependency emits a Lit development-mode warning. Rollup warns that it ignores the source client directive during bundling; the explicit output banner preserves that directive, and the production build passes.

## Before production release

- Run one real exact-input swap through the DEX adapter and confirm its filled order and balance refresh, including native wrapping where supported.
- Confirm rejection, expiry, and cancellation UX on the target deployment. A preview quote and mocked submission do not prove live settlement.
- Publish the new spot-ui version before spot-react, then update the DEX dependency. The existing publisher enforces registry availability of the SDK dependency.
- When retiring Liquidity Hub, run the explicit npm deprecation command after migration readiness is established. The manifest's `deprecated` field alone does not mark published npm versions deprecated.

The review fixes are left as local changes on top of the original staged work for inspection. No commit or publish was performed.
