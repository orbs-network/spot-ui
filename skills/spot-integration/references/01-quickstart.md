# Quickstart

If the repository is empty or lacks a trading form/services, begin with [Starting without a DEX](08-starting-without-dex.md). Reuse any existing app, wallet, or data layer and build the missing pieces before following the execution path below.

## Establish the host and installed contract

Inspect these sources before asking the user for technical information:

- Manifest and lockfile: framework, package manager, installed/resolved Spot version, existing wallet/state/query/numeric libraries, and available build/typecheck commands.
- Installed documentation: prefer `node_modules/@orbs-network/spot-ui/dist/integration-skill/SKILL.md` and its relative references/assets; confirm `manifest.json.sdkVersion` equals the installed package version. Reading documentation under `dist` is allowed. For an older package without it, use the repository skill from a matching release/checkout, checked against `packages/spot-ui/package.json`.
- Installed package root exports and declarations: the API the host can actually import, including `refreshAndPrepareSwap`, `calculateOrder`, execution, and tracking helpers. SDK code imports remain package-root-only; a repository's latest README/source may describe a newer release.
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

## Existing router lifecycle

1. Add Spot inside the existing quote/source lifecycle. Keep all request identity fields in the cache key, cancel obsolete requests, and reject results for older amount/pair/chain/partner/slippage inputs.
2. Initialize and reuse `createClient(partner, chainId)` through the host's normal resource lifecycle. The SDK owns protocol configuration; the host owns partner selection, chain support, wallet state, wrapped-native tokens, and explorer URLs.
3. Display and compare the reviewed `quote.minimumAmountOut` in output-token base units. Preserve host balance, gas, and minimum-trade policy; gate exact-output or alternate-recipient requests using installed capabilities.
4. Capture the reviewed quote and live execution account/chain, acquire the execution lock, and perform native wrapping, confirmed approval, and bounded allowance verification through the host wallet.
5. When exported by the installed client, call `await client.refreshAndPrepareSwap({ quote, account, signal })` immediately before signing. Current builds reuse a quote up to 20 seconds old or refresh/check its original request, then always prepare new signing timestamps/nonce. No separate `isQuoteFresh` call is needed. Direct callers can force a request with `maxQuoteAgeMillis: 0` when supported by the installed API. Sign `prepared.signingRequest` with the host wallet and return its original signature unchanged.
6. Submit exactly once with `client.submitOrder(prepared.order, signature)`. Retain the accepted order and keep swap execution pending until the installed `waitForOrder`/`watchOrder` API confirms the fill. Put tracking at app/store scope when it must survive closing a modal. Reconcile an uncertain submission instead of automatically resending.

### Older-version preparation fallback

If `refreshAndPrepareSwap` is absent and a compatible upgrade is not appropriate, verify and use the installed quote/preparation methods:

1. Keep an immutable reviewed quote/request snapshot.
2. After wrapping/confirmed approval, re-quote the **same original request**, preserving its chain, partner, input/output tokens, raw input amount, preview `user`, slippage, and `dexMinAmountOut`; add the execution's abort signal. Use the configured client when supported, or the installed package-level quote API with those exact fields.
3. Compare integer `fresh.minimumAmountOut` against `reviewed.minimumAmountOut`. If lower, stop before signing and require the user to review a replacement quote. Do not compare `netAmountOut` as a substitute for this minimum check.
4. If equal or higher, call the installed pure `client.prepareSwap(reviewedQuote, account)` immediately before signing. Keep the original minimum unchanged. Validate the live wallet context again before submission.

Pure `prepareSwap` alone does not refresh/check the price. Do not fake an unavailable export with `any`, silently replace the reviewed quote with the fresh one, or claim an old package emits `QUOTE_MINIMUM_DECREASED`; use the host's existing review-required error surface for the fallback. When the helper exists, handle that SDK code directly.

## Advanced-order additions

Read [Form calculation](02-form-calculation.md) and [Client and execution](03-client-and-execution.md) only for this path. Keep editable values in the host state and derive the authoritative form; withhold stale output quotes, display `form.errors`, and require `form.canSubmit`. Source USD valuation from available quote totals or token prices according to the installed API. Preserve explicit trade counts when the amount changes.

Capture form/tokens/account/chain/client together for each attempt. Normalize native input to the host wrapped token, complete wallet steps, then prepare immediately before signing. Never construct protocol order payloads manually. Add [History and cancellation](04-history-and-cancellation.md) only when requested; use `order.historyKey` for identity.

## Missing partner or chain

Use [Chain integration](06-chain-integration.md) to distinguish stale package resolution, host filters, unsupported wallet/read clients, and missing server activation. A successful SDK config lookup alone does not prove host chain support. Never use another partner's configuration or hard-code protocol addresses.

If activation is the remaining blocker, finish independent adapters/UI and keep submission clearly unavailable. Prepare this message with facts already discovered:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. The integration uses [package and resolved version]. Read-only initialization returned [sanitized SDK code, HTTP status, service code, and short message]. We verified [relevant host support/package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, private URLs/credentials, and unrelated logs. Give the draft to the user with the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup); do not send it automatically. Do not block independent work merely because activation is pending.

## Completion

Run available build/typechecks and relevant existing checks. Check the affected UI in a browser when available and perform read-only partner/chain/quote checks with public inputs where appropriate. Do not sign, submit, or cancel live orders as verification without explicit authorization. Respect the host user's constraints on new files and tests; prefer relevant existing checks.

Hand off what now works, what was actually verified, and the specific remaining blocker/action, if any. Do not ask a nondeveloper to resolve SDK method names, raw-unit conversions, or framework choices.
