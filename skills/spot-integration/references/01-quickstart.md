# Quickstart

Protocol quotes and orders use ERC-20 input addresses. SDK-managed execution calls the required `walletInteractions.shouldWrap()` once before allowance reads or wallet writes, awaits its boolean result, and calls `wrapNativeToken` only when true. React can display native input and its native balance while normalizing execution to the configured `wrappedNativeToken`. The host implements the wrapping transaction and waits for its successful receipt; users can review before wrapping.

If the repository is empty or lacks a trading form/services, begin with [Starting without a DEX](08-starting-without-dex.md). Reuse any existing app, wallet, or data layer and build the missing pieces before following the execution path below.

## Establish the host and installed contract

Inspect these sources before asking the user for technical information:

- Manifest and lockfile: framework, package manager, installed/resolved Spot version, existing wallet/state/query/numeric libraries, and available build/typecheck commands.
- Installed documentation: prefer `node_modules/@orbs-network/spot-ui/dist/integration-skill/SKILL.md` and its relative references/assets; confirm `manifest.json.sdkVersion` equals the installed package version. Reading documentation under `dist` is allowed. For an older package without it, use the repository skill from a matching release/checkout, checked against `packages/spot-ui/package.json`.
- Installed package root exports and declarations: the API the host can actually import, including preparation parameters/return type, `calculateOrder`, execution, and tracking helpers. Current `prepareSwap` accepts an object and returns a promise; older versions used the same name for sync positional preparation. Inspect its declaration rather than detecting it by name or presence. SDK code imports remain package-root-only; a repository's latest README/source may describe a newer release.
- Existing swap/order form and components: token selectors, amount inputs, review/progress UI, notifications, translations, and history if requested.
- Host wallet and source state: connected account/chain, typed amount, raw balances, allowance/receipt/signing methods, quote inputs and request cancellation.
- Chain and token registry: addresses, decimals, wrapped-native token, explorer metadata, and available USD totals/unit prices.
- Partner evidence: existing configuration/constants, supported chain filters, and a read-only `createClient(partner, chainId)` result or its structured error. Do not infer the partner from a similar DEX name.

Reuse existing dependencies. If Spot is absent, select a concrete compatible release using its published exports/peer requirements and install it with the host package manager. If a newer helper is needed, either use the older-version path below or make a controlled compatible upgrade within the authorized task, then verify it. Preserve user-selected versions and lockfile conventions. Never use a blind `@latest` upgrade or private package imports to satisfy an example.

## Pick the path from the request

| Path | Minimum deliverable |
| --- | --- |
| New or non-DEX app | Missing host services from [Starting without a DEX](08-starting-without-dex.md), plus only the requested form/execution surface |
| Existing swap router/source | Quote candidate, host wrapping/approval/signing, protected preparation, single submission, and settlement tracking; no provider, new form, or account-history screen required |
| Advanced order | Requested form controls and validation from `calculateOrder`, configured client, wallet execution, and requested review/progress UI |
| History/cancellation | Existing account history surface, configured fetching, stable order identity, and confirmed cancellation |
| Liquidity Hub migration | Replace its quote/spender/signing/execution contracts using the swap path; preserve the host route selection and UI |

Do not add every module or history merely because the SDK supports them. Ask only when a product choice remains unresolved, such as which requested order types should be visible. Discover token/chain/wallet/API details yourself.

## Default client execution

Use the configured client's execution methods when the SDK should coordinate
wallet steps through the host's `OrderWalletInteractions` adapter:

```ts
const completed = await client.executeSwap({
  quote, account, walletInteractions, signal,
});
// completed.order is filled; completed.status is "completed".
```

For calculated forms, call `client.executeOrder` with `form`, `account`,
`inputTokenAddress`, `outputTokenAddress`, and `walletInteractions`, with optional
`signal`. It prepares from the form's reviewed amounts/minimum;
use `client.executeSwap` for quote-age refresh and protected-minimum comparison.
The client awaits `shouldWrap`, confirms any wrapping and approval, then prepares internally; there is
no preparation callback or `client` argument.
Swaps resolve after a confirmed fill; limit, TWAP, and other advanced orders resolve
at acceptance. Settlement is internal, so do not start another poller. Keep the
host execution lock until the method resolves or an uncertain outcome is reconciled,
and use `account` consistently for execution.

## Advanced router lifecycle

1. Add Spot inside the existing quote/source lifecycle. Keep all request identity fields in the cache key, cancel obsolete requests, and reject results for older amount/pair/chain/partner/slippage inputs.
2. Initialize and reuse `createClient(partner, chainId)` through the host's normal resource lifecycle. The SDK owns protocol configuration; the host owns partner selection, chain support, wallet state, wrapped-native tokens, and explorer URLs.
3. Display and compare the reviewed `quote.minimumAmountOut` in output-token base units. Preserve host balance, gas, and minimum-trade policy; gate exact-output or alternate-recipient requests using installed capabilities.
4. Capture the reviewed quote and live execution account/chain, acquire the execution lock, and perform native wrapping, confirmed approval, and bounded allowance verification through the host wallet.
5. After verifying the installed async object-based signature, call `await client.prepareSwap({ quote, account, signal })` immediately before signing. Current builds reuse a quote up to 20 seconds old or refresh/check its original request, then always prepare new signing timestamps/nonce. No separate `isQuoteFresh` call is needed. Direct callers can force a request with `maxQuoteAgeMillis: 0` when supported by the installed API. Sign `prepared.signingRequest` with the host wallet and return its original signature unchanged. For older declarations, use the matching path below.
6. Submit exactly once with installed `client.submitSignedSwap(prepared, signature, { signal })`; it waits internally and returns the completed `Order`. Keep the operation at app/store scope when it must survive closing a modal. Preserve an uncertain error's `orderId` and optional `order`; resume an accepted snapshot with `client.executeOrder({ order, signal })`, which performs no signing or submission. Reconcile an uncertain submission instead of automatically resending.

### Preparation across installed versions

Inspect the installed declaration's parameters and return type:

- Current `prepareSwap({ quote, account, ... }): Promise<PreparedSwap>` owns freshness and minimum comparison. Use the awaited call above.
- When the installed release has the older sync `prepareSwap(quote, userAddress): PreparedSwap`, use the manual flow below or make an authorized compatible upgrade. The name `prepareSwap` alone does not identify its behavior.

For that verified older synchronous API:

1. Keep an immutable reviewed quote/request snapshot.
2. After wrapping/confirmed approval, re-quote the **same original request**, preserving its chain, partner, input/output tokens, raw input amount, preview `user`, slippage, and `dexMinAmountOut`; add the execution's abort signal. Use the configured client when supported, or the installed package-level quote API with those exact fields.
3. Compare integer `fresh.minimumAmountOut` against `reviewed.minimumAmountOut`. If lower, stop before signing and require the user to review a replacement quote. Do not compare `netAmountOut` as a substitute for this minimum check.
4. If equal or higher, call the version-verified sync `client.prepareSwap(reviewedQuote, account)` immediately before signing. Keep the original minimum unchanged. Validate the live wallet context again before submission.

That older synchronous method performs no refresh/minimum check. Do not fake an unavailable export with `any`, silently replace the reviewed quote with the fresh one, or claim an old package emits `QUOTE_MINIMUM_DECREASED`; use the host's existing review-required error surface for this fallback. When the installed async API emits that SDK code, handle it directly.

## Advanced-order additions

Read [Form calculation](02-form-calculation.md) and [Client and execution](03-client-and-execution.md) only for this path. Keep editable values in the host state and derive the authoritative form; withhold stale output quotes, display `form.errors`, and require `form.canSubmit`. Source USD valuation from available quote totals or token prices according to the installed API. Preserve explicit trade counts when the amount changes.

Capture form/tokens/account/chain/client together for each attempt. SDK-managed execution awaits `shouldWrap`, confirms any requested wrapping and approval, then prepares immediately before signing. Manual host flows must complete wrapping and approval themselves. Never construct protocol order payloads manually. Add [History and cancellation](04-history-and-cancellation.md) only when requested; use `order.historyKey` for identity.

## Missing partner or chain

Use [Chain integration](06-chain-integration.md) to distinguish stale package resolution, host filters, unsupported wallet/read clients, and missing server activation. A successful SDK config lookup alone does not prove host chain support. Never use another partner's configuration or hard-code protocol addresses.

If activation is the remaining blocker, finish independent adapters/UI and keep submission clearly unavailable. Prepare this message with facts already discovered:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. The integration uses [package and resolved version]. Read-only initialization returned [sanitized SDK code, HTTP status, service code, and short message]. We verified [relevant host support/package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, private URLs/credentials, and unrelated logs. Give the draft to the user with the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup); do not send it automatically. Do not block independent work merely because activation is pending.

## Completion

Run available build/typechecks and relevant existing checks. Check the affected UI in a browser when available and perform read-only partner/chain/quote checks with public inputs where appropriate. Do not sign, submit, or cancel live orders as verification without explicit authorization. Respect the host user's constraints on new files and tests; prefer relevant existing checks.

Hand off what now works, what was actually verified, and the specific remaining blocker/action, if any. Do not ask a nondeveloper to resolve SDK method names, raw-unit conversions, or framework choices.
