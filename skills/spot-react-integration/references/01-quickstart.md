# Quickstart

Protocol quotes and orders use ERC-20 input addresses. Required wallet callbacks `shouldWrap()` and `shouldApprove(request)` return a boolean or a promise of one from captured input and live allowance state. False skips the corresponding write. When invoked, `wrapNativeToken` and `approveToken` return a transaction hash only after a successful receipt; they throw on failure and never return undefined to skip. Advanced React forms normalize native execution to `wrappedNativeToken`; provider-free swap hosts supply the wrapped protocol address themselves. Users review before execution. `ApprovalRequest.amount` remains the exact required input; compare live allowance only with that value. `approvalAmount` is a suggested cap, defaulting to the maximum uint256. The approval write may follow that suggestion, approve the exact amount, or apply host policy without mutating the immutable request.

If there is no DEX, start with [Starting without a DEX](08-starting-without-dex.md). An existing React app keeps its stack and components; build its missing trading services. Scaffold a minimal application only when no app exists, then return to the provider path below.

## Discover the host before asking

Inspect the repository and installed dependencies first:

1. Read the manifest/lockfile for React, Spot, progress UI, wallet/state/query libraries, package manager, and available build/typecheck commands. Prefer `node_modules/@orbs-network/spot-react/dist/integration-skill/SKILL.md` with its relative references/assets and confirm `manifest.json.sdkVersion` matches the installed package version. Reading documentation under `dist` is allowed; SDK code imports remain package-root-only. For an older package without bundled docs, use the repository skill from a matching release/checkout, checked against `packages/spot-react/package.json`. Verify actual installed root exports/types and React peer requirements; source-checkout examples can be newer than the host package.
2. Find the existing swap form, navigation, amount/token controls, review/progress modal, error surfaces, formatting, and translations. Add only the Spot behavior requested by the user.
3. Locate the host source of truth for selected tokens, typed amount, quote request identity/cancellation, raw balances, USD totals/unit prices, connected account/chain, and callbacks.
4. Inspect the wallet's allowance, wrapping, approval, signing, cancellation, and confirmed-receipt methods, adapting only those needed for the chosen path.
5. Find the host's chain registry, wrapped-native token, explorer metadata, and existing partner/config evidence. Distinguish a local partner filter or old installed package from missing server activation.

Derive technical choices from those findings. Ask the user only about unresolved product scope or an external activation that cannot be completed locally. Do not ask them to identify hook names, choose SDK functions, supply raw-unit conversions, or design a state architecture.

## Select scope and dependencies

`AdvancedOrdersProvider` supports only `TWAP`, `LIMIT`, `STOP_LOSS`, and
`TAKE_PROFIT`. Swaps call the public SDK client without a provider; use the
host's state and optional `swap-ui` presentation.

| Request | Path |
| --- | --- |
| Build trading in a new or non-DEX React app | [Starting without a DEX](08-starting-without-dex.md), then the requested provider/form path |
| Add Spot to an existing route selector/wallet flow | Public SDK helpers from `spot-react`, without a provider or replacement form; read [Swap and migration](07-swap-and-migration.md) |
| Add advanced-order forms or tabs | `AdvancedOrdersProvider`, focused form hooks, and the requested review/progress UI |
| Add advanced price/TWAP controls | Relevant [Panels](03-panels.md) sections, retaining the existing form/state |
| Add account history/cancellation | Relevant history sections, within provider scope or a context-preserving portal |
| Migrate Liquidity Hub | Replace its quote, spender, signature, and execution contract while preserving the host form/router |

A swap integration does not require tabs, a provider, or account history. An
advanced form integration does not imply every supported module. Use one
advanced-order provider for the requested advanced tabs; independent advanced
forms can have independent provider instances. Keep the Swap tab outside it.

Install only missing dependencies with the host package manager. Select a concrete release compatible with the existing React/wallet stack after inspecting published exports and peer requirements. Preserve user-selected versions and the lockfile. Never blindly install `@latest` or remove an old package until its replacement paths work and remaining imports have been checked.

`@orbs-network/spot-react` includes `spot-ui` and re-exports its SDK API, so a separate core install is unnecessary. Existing React 18/19 applications must still verify the selected package's peer range. No wallet library or host React Query provider is required. Add `@orbs-network/swap-ui` only when adopting the documented progress flow, after checking its actual exports and adapting its appearance.

## Client execution without a provider

Create one session with `client.createSwapExecution({ quote, account,
walletInteractions, signal })`, then await `execution.run({ onProgress })` for a
completed `Order`. Advanced forms use `createOrderExecution` with form and
protocol token addresses; their `run()` returns acceptance. Constructors validate
and snapshot synchronously without wallet work. They can throw during capture.

The host can instead await `wrap()`, `approve()`, `sign()`, `submit()`, and
`waitForCompletion()` on the same session. Signing prepares late and retains the
exact payload/signature; submission takes no arguments. Read accepted/latest
`execution.order`, prepared payload, signature, and transaction hashes from the
session. Only `run({ onProgress })` accepts a progress observer
(`ExecutionRunOptions<T>`); constructors, explicit steps, and `waitForCompletion()`
accept none. Run observers report shared execution updates and cannot stop the
engine through exceptions/rejected promises. Keep the host loading/duplicate
guard until completion or reconciliation; do not start a second settlement poller.

## Provider path

Read [Provider](02-provider.md) and only the relevant [Panels](03-panels.md) sections.

1. Keep editable/source values in the DEX's existing state. Build small adapters for token shape, raw balances, current quotes, and wallet methods; share them through a local DEX context only when multiple components need them.
2. Pass the actual partner, connected account/chain, tokens, host wrapped-native token, amount, balance, separate unit USD prices, quote bridge, callbacks, and wallet adapter directly to `AdvancedOrdersProvider`. Stabilize objects/functions with the host's React patterns. The provider loads protocol configuration itself.
3. Supply only optional `quotedOutputAmountRaw`, `isLoading`, and `noLiquidity` through `marketQuote`. Map SDK `netAmountOut` to the raw output in the host adapter when using SDK quotes. Withhold stale amounts and show loading until the request matches current inputs. The provider derives the market rate from the current raw quote pair and USD values from separate unit-price props. Swaps use the quote-only client flow.
4. Use the focused public hooks to render the requested controls, errors, and submit gating through existing DEX components. Do not silently reset selected TWAP trade counts when a smaller amount makes them invalid.
5. Adapt `walletInteractions`: required `shouldWrap`, `shouldApprove`, `wrapNativeToken`, `approveToken`, `signOrder`, and React `cancelOrder`. Decision callbacks return booleans or promises from captured native input and live host allowance. False skips the corresponding write; transaction callbacks wait for successful receipts and return hashes, throwing on failure. There is no SDK `getAllowance` callback. Signing returns the original bytes. Balance/funds checks stay private to the host decision and transaction callbacks.
6. Use `useExecution` and `useSubmitButton` for advanced-order review/progress, duplicate prevention, and disabled/loading behavior. Pause obsolete quotes for the visible attempt. `startNewOrder()` can release the form while retaining active or unconfirmed execution for independent recovery; keep the provider mounted. Creation succeeds at acceptance and submission remains disabled with `order-completed` until reset. `checkOrderStatus()` checks retained attempts without resubmitting them; expose `hasUnconfirmedExecutions` and `isCheckingOrderStatus` in background recovery UI.
7. Refetch balances through lifecycle callbacks. Preserve the host input on failure/rejection; clear it after success or after an explicit new-order action successfully detaches active or unconfirmed execution. Keep provider ownership stable across transient controls.
8. Add requested history/cancellation under the same provider or a context-preserving portal. Use `order.historyKey` for identity and the SDK's configured history/cancellation APIs.

## Provider-free router sessions

Keep route competition and UI in the host. Create one swap session with the
reviewed quote/account and existing wallet callbacks. Choose `run()` or control
the individual methods. `sign()` verifies wrapping/approval prerequisites and
reuses the reviewed quote when its local receipt age is zero to 20 seconds,
inclusive. Older quotes or invalid/future receipt times trigger a refresh for the
exact original request; a refreshed minimum below the reviewed floor requires
fresh review. Signing prepares fresh nonce/timestamps from the selected quote.
Estimates may remain live through wrap/approval; freeze
displayed output/minimum from `preparedOrder.quote` before signing. Preserve the
original signature bytes; `submit()` sends the session's stored pair once.

Validate captured account/chain, spendable balance, gas, and product policy before
wallet work and submission. Keep the session outside transient modals. Preserve
`execution.order` or settlement error `order`/`orderId` on uncertainty. Check known
IDs through ordinary `client.getOrder` reads, or reconcile exact original signed
identity through configured history. The host owns any further polling;
constructors accept new reviewed input only.
See [Swap and migration](07-swap-and-migration.md) for the full step contract.

## Missing partner or chain activation

Check the installed runtime, existing partner identifier/filters, connected-chain support, and the read-only `createClient` result before concluding activation is absent. The provider normally owns initialization; use public SDK diagnostics rather than adding a parallel host configuration fetch. Never borrow another DEX's partner or hard-code protocol addresses.

Finish independent adapters/UI and make unavailable submission understandable. Give the user this ready-to-forward draft populated from discovered facts:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. We use [package and resolved version]. Read-only initialization returned [SDK code, HTTP status, service code, sanitized short message]. We verified [host support and package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, credentials/private URLs, and unrelated logs. Include the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup), but do not contact it automatically. External activation should not halt independent work.

## Verify completion

Run available build/typechecks and relevant existing checks. Verify the affected UI in a browser when available: loading/unavailable configuration, field validation, requested module navigation, review/progress, and history only if in scope. Use read-only partner/chain/quote checks; live signing, submission, or cancellation requires explicit authorization. Respect the host user's constraints on new files and tests; prefer relevant existing checks.

Hand off what now works, the checks actually run, and any specific blocker or action. Describe user-visible results in plain language instead of handing technical integration decisions back to a nondeveloper.
