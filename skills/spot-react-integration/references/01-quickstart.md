# Quickstart

Protocol quotes and orders use ERC-20 input addresses. SDK-managed execution calls the required `walletInteractions.shouldWrap()` once before allowance reads or wallet writes, awaits its boolean result, and calls `wrapNativeToken` only when true. Advanced React forms can display native input and its native balance while normalizing execution to `wrappedNativeToken`. Provider-free swap hosts supply the wrapped protocol input address themselves. The host implements the wrapping transaction and waits for its successful receipt; users can review before wrapping.

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

Use `client.executeSwap({ quote, account, walletInteractions, signal })` for a
reviewed quote. For calculated forms, use `client.executeOrder` with `form`,
`inputTokenAddress`, `outputTokenAddress`, `account`, and `walletInteractions`;
its only optional execution input is `signal`. It prepares
from the form's reviewed amounts/minimum directly; use `executeSwap` for
quote-aware refresh checks. The configured client owns late
preparation, allowance verification, signing, and submission through the host
wallet callbacks. Swaps resolve after a fill; advanced orders resolve at acceptance.
The client owns settlement, so keep the host's loading state until it resolves
and do not start a second poller. No execution function or preparation callback
needs to be imported.

The separate preparation and signed-submission path below remains available for
advanced integrations that control wallet steps independently.

## Provider path

Read [Provider](02-provider.md) and only the relevant [Panels](03-panels.md) sections.

1. Keep editable/source values in the DEX's existing state. Build small adapters for token shape, raw balances, current quotes, and wallet methods; share them through a local DEX context only when multiple components need them.
2. Pass the actual partner, connected account/chain, tokens, host wrapped-native token, amount, balance, available USD valuation, quote, callbacks, and wallet adapter directly to `AdvancedOrdersProvider`. Stabilize objects/functions with the host's React patterns. The provider loads protocol configuration itself.
3. Supply current advanced-order valuation through `marketQuote`: flat `quotedOutputAmountRaw`/USD fields or an optional original SDK quote. Withhold stale values and show loading until the request matches current inputs. The provider derives amounts and valuation; it never executes `Module.SWAP`.
4. Use the focused public hooks to render the requested controls, errors, and submit gating through existing DEX components. Do not silently reset selected TWAP trade counts when a smaller amount makes them invalid.
5. Adapt the installed `walletInteractions` contract: `shouldWrap`, `wrapNativeToken`, `getAllowance`, `approveToken`, `signOrder`, and `cancelOrder`. The no-argument predicate decides from the DEX's captured input/account/chain context, may be async, and must return a boolean. Return true for native selections. Write methods wait for successful receipts; signing returns the original bytes. Implement `getTokenBalance` for completed-wrap retries.
6. Use `useExecution` and `useSubmitButton` for advanced-order review/progress, duplicate prevention, and disabled/loading behavior. Pause obsolete quote requests through execution. Creation succeeds at acceptance; preserve and reconcile unknown attempts before another submission.
7. Refetch balances through lifecycle callbacks. Preserve the host input on failure/rejection; clear it only after success and use the installed reset/dismissal methods. Keep provider ownership stable across transient controls.
8. Add requested history/cancellation under the same provider or a context-preserving portal. Use `order.historyKey` for identity and the SDK's configured history/cancellation APIs.

## Provider-less router preparation

Use this path when the host already owns route competition and wallet orchestration. Inspect the installed preparation declaration's parameters and return type; the name alone cannot distinguish current async preparation from older sync positional preparation. Keep wrapping/approval/signing in the DEX flow. With the current async object-based API, after confirmed wallet steps and bounded allowance verification, call:

```ts
const prepared = await client.prepareSwap({ quote, account, signal });
```

Use this call only after verifying that object/promise signature. Current builds check age internally: a quote up to 20 seconds old skips HTTP; otherwise the helper replays the original request, including preview `user`, slippage, and `dexMinAmountOut`, and compares refreshed `minimumAmountOut` against the reviewed minimum. A lower minimum throws `QUOTE_MINIMUM_DECREASED` and requires fresh review. Both paths retain the reviewed minimum and prepare new signing timestamps/nonce. Direct callers can set finite, non-negative `maxQuoteAgeMillis` (`0` forces refresh) when the installed API supports it. `isQuoteFresh` remains optional for host UI/cache policy, not an extra preparation step.

If the installed release has the older sync `prepareSwap(quote, userAddress): PreparedSwap`, choose an authorized compatible upgrade or implement its explicit manual flow: retain an immutable reviewed snapshot, re-quote its exact original request after wallet steps, and compare integer `fresh.minimumAmountOut` with the reviewed minimum. Stop for fresh review if lower. Otherwise call that version-verified sync `client.prepareSwap(reviewedQuote, account)` immediately before signing. That older method performs no refresh/minimum check. Do not substitute a `netAmountOut` comparison, silently accept a new reviewed minimum, or fabricate an SDK error code on an older release.

Validate live account/chain and host balance/minimum-trade policy before wallet writes and submission. The execution account supplies signer/recipient separately from the quote's preview user. Submit once with installed `client.submitSignedSwap(prepared, signature, { signal })`. It waits internally and returns the completed `Order`. Keep the operation at a scope that survives modal closure. Preserve `OrderSettlementError.orderId` and its optional `order` on uncertain outcomes; resume a saved snapshot with `client.executeOrder({ order, signal })` without signing or submitting again.

## Missing partner or chain activation

Check the installed runtime, existing partner identifier/filters, connected-chain support, and the read-only `createClient` result before concluding activation is absent. The provider normally owns initialization; use public SDK diagnostics rather than adding a parallel host configuration fetch. Never borrow another DEX's partner or hard-code protocol addresses.

Finish independent adapters/UI and make unavailable submission understandable. Give the user this ready-to-forward draft populated from discovered facts:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. We use [package and resolved version]. Read-only initialization returned [SDK code, HTTP status, service code, sanitized short message]. We verified [host support and package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, credentials/private URLs, and unrelated logs. Include the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup), but do not contact it automatically. External activation should not halt independent work.

## Verify completion

Run available build/typechecks and relevant existing checks. Verify the affected UI in a browser when available: loading/unavailable configuration, field validation, requested module navigation, review/progress, and history only if in scope. Use read-only partner/chain/quote checks; live signing, submission, or cancellation requires explicit authorization. Respect the host user's constraints on new files and tests; prefer relevant existing checks.

Hand off what now works, the checks actually run, and any specific blocker or action. Describe user-visible results in plain language instead of handing technical integration decisions back to a nondeveloper.
