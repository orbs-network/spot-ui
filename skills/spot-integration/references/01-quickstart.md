# Quickstart

Protocol quotes and orders use ERC-20 input addresses. Required wallet callbacks `shouldWrap()` and `shouldApprove(request)` return a boolean or a promise of one from captured input and live allowance state. False skips the corresponding write. When invoked, `wrapNativeToken` and `approveToken` return a transaction hash only after a successful receipt; they throw on failure and never return undefined to skip. Advanced React forms normalize native execution to `wrappedNativeToken`; provider-free swap hosts supply the wrapped protocol address themselves. Users review before execution. `ApprovalRequest.amount` remains the exact required input; compare live allowance only with that value. `approvalAmount` is a suggested cap, defaulting to the maximum uint256. The approval write may follow that suggestion, approve the exact amount, or apply host policy without mutating the immutable request.

If the repository is empty or lacks a trading form/services, begin with [Starting without a DEX](08-starting-without-dex.md). Reuse any existing app, wallet, or data layer and build the missing pieces before following the execution path below.

## Establish the host and installed contract

Inspect these sources before asking the user for technical information:

- Manifest and lockfile: framework, package manager, installed/resolved Spot version, existing wallet/state/query/numeric libraries, and available build/typecheck commands.
- Installed documentation: prefer `node_modules/@orbs-network/spot-ui/dist/integration-skill/SKILL.md` and its relative references/assets; confirm `manifest.json.sdkVersion` equals the installed package version. Reading documentation under `dist` is allowed. For an older package without it, use the repository skill from a matching release/checkout, checked against `packages/spot-ui/package.json`.
- Installed package root exports and declarations: the API the host can actually import, including the two execution constructors, their reviewed creation inputs, session methods, and `calculateOrder`. Inspect installed declarations rather than inferring behavior from a similar method name. SDK code imports remain package-root-only; a repository's latest README/source may describe a newer release.
- Existing swap/order form and components: token selectors, amount inputs, review/progress UI, notifications, translations, and history if requested.
- Host wallet and source state: connected account/chain, typed amount, raw balances, allowance/receipt/signing methods, quote inputs and request cancellation.
- Chain and token registry: addresses, decimals, wrapped-native token, explorer metadata, and available USD totals/unit prices.
- Partner evidence: existing configuration/constants, supported chain filters, and a read-only `createClient(partner, chainId)` result or its structured error. Do not infer the partner from a similar DEX name.

Reuse existing dependencies. If Spot is absent, select a concrete compatible release using its published exports/peer requirements and install it with the host package manager. If a newer helper is needed, either use that version's matching guide or make a controlled compatible upgrade within the authorized task, then verify it. Preserve user-selected versions and lockfile conventions. Never use a blind `@latest` upgrade or private package imports to satisfy an example.

## Pick the path from the request

| Path | Minimum deliverable |
| --- | --- |
| New or non-DEX app | Missing host services from [Starting without a DEX](08-starting-without-dex.md), plus only the requested form/execution surface |
| Existing swap router/source | Quote candidate, host wrapping/approval/signing, protected preparation, single submission, and settlement tracking; no provider, new form, or account-history screen required |
| Advanced order | Requested form controls and validation from `calculateOrder`, configured client, wallet execution, and requested review/progress UI |
| History/cancellation | Existing account history surface, configured fetching, stable order identity, and confirmed cancellation |
| Liquidity Hub migration | Replace its quote/spender/signing/execution contracts using the swap path; preserve the host route selection and UI |

Do not add every module or history merely because the SDK supports them. Ask only when a product choice remains unresolved, such as which requested order types should be visible. Discover token/chain/wallet/API details yourself.

## Execution sessions

Create one session for a reviewed quote or calculated advanced-order form:

```ts
const execution = client.createSwapExecution({
  quote, account, walletInteractions, signal,
});
const order = await execution.run({ onProgress });
```

`createOrderExecution({ form, account, inputTokenAddress, outputTokenAddress,
walletInteractions, signal })` captures an advanced form instead.
Construction performs no wallet work. `run()` returns a completed `Order` for
swaps and an accepted `Order` for advanced orders.

For a host-controlled sequence, await `wrap()` → `approve()` → `sign()` →
`submit()` → `waitForCompletion()` on the same session. Wrapping and approval
skip unnecessary transactions; signing verifies prerequisites and prepares late.
Submission uses the session's stored exact payload and original signature once.
`execution.order` holds acceptance before the related run progress callback.
Only `run({ onProgress })` accepts an observer; individual steps and constructors
accept none.

1. Quote inside the host's existing route lifecycle, with full identity keys and obsolete request cancellation.
2. Reuse the configured client for the actual partner and chain; supply host wallet callbacks and wrapped-native metadata.
3. Review `quote.minimumAmountOut` unchanged. Preserve host gas, balance, and minimum-trade policy; gate unsupported route modes.
4. Capture quote/form and account/chain together, acquire the execution lock, and create the session. Constructor callbacks use that captured wallet context.
5. Choose `run()` or individual methods. After wrap/approval, swap signing reuses the reviewed quote when its local receipt age is zero to 20 seconds, inclusive; older quotes or invalid/future receipt times trigger a refresh for the unchanged request. A refreshed minimum must meet the original reviewed floor. Signing then prepares fresh nonce/timestamps. Live estimates may continue through prerequisites; freeze the displayed quote from `preparedOrder.quote` before signing.
6. Keep the session outside transient modals, retain accepted snapshots, and reconcile uncertain responses before any replacement. Check a known ID with ordinary `client.getOrder({ orderId, signal })`, or match the exact original signed payload through configured history. The host owns further polling; constructors never accept saved orders.

Read [Client and execution](03-client-and-execution.md) for exact step ordering,
progress, wallet adaptation, and recovery. When installed declarations differ,
use that release's version-matched guide or make an authorized upgrade; never
fake an unavailable constructor or import private source.

## Advanced-order additions

Read [Form calculation](02-form-calculation.md) and [Client and execution](03-client-and-execution.md) only for this path. Keep editable values in the host state and derive the authoritative form; withhold stale output quotes, display `form.errors`, and require `form.canSubmit`. Source USD valuation from available quote totals or token prices according to the installed API. Preserve explicit trade counts when the amount changes.

Capture form/tokens/account/chain/client together for each attempt. SDK-managed execution awaits the host's wrap/approval checks and any required confirmations, then prepares inside `sign()`. A host controlling step timing uses the same session methods. Never construct protocol order payloads manually. Add [History and cancellation](04-history-and-cancellation.md) only when requested; use `order.historyKey` for identity.

## Missing partner or chain

Use [Chain integration](06-chain-integration.md) to distinguish stale package resolution, host filters, unsupported wallet/read clients, and missing server activation. A successful SDK config lookup alone does not prove host chain support. Never use another partner's configuration or hard-code protocol addresses.

If activation is the remaining blocker, finish independent adapters/UI and keep submission clearly unavailable. Prepare this message with facts already discovered:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. The integration uses [package and resolved version]. Read-only initialization returned [sanitized SDK code, HTTP status, service code, and short message]. We verified [relevant host support/package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, private URLs/credentials, and unrelated logs. Give the draft to the user with the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup); do not send it automatically. Do not block independent work merely because activation is pending.

## Completion

Run available build/typechecks and relevant existing checks. Check the affected UI in a browser when available and perform read-only partner/chain/quote checks with public inputs where appropriate. Do not sign, submit, or cancel live orders as verification without explicit authorization. Respect the host user's constraints on new files and tests; prefer relevant existing checks.

Hand off what now works, what was actually verified, and the specific remaining blocker/action, if any. Do not ask a nondeveloper to resolve SDK method names, raw-unit conversions, or framework choices.
