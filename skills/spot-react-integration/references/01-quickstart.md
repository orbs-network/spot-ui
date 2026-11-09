# Quickstart

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

| Request | Path |
| --- | --- |
| Build trading in a new or non-DEX React app | [Starting without a DEX](08-starting-without-dex.md), then the requested provider/form path |
| Add Spot to an existing route selector/wallet flow | Public SDK helpers from `spot-react`, without a provider or replacement form; read [Swap and migration](07-swap-and-migration.md) |
| Add a calculated React form or requested tabs | `SpotProvider`, focused form hooks, and the requested review/progress UI |
| Add advanced price/TWAP controls | Relevant [Panels](03-panels.md) sections, retaining the existing form/state |
| Add account history/cancellation | Relevant history sections, within provider scope or a context-preserving portal |
| Migrate Liquidity Hub | Replace its quote, spender, signature, and execution contract while preserving the host form/router |

A router integration does not require tabs or history. A form integration does not imply every supported module. Use one provider API for `Module.SWAP` and advanced modules; independent forms can have independent provider instances.

Install only missing dependencies with the host package manager. Select a concrete release compatible with the existing React/wallet stack after inspecting published exports and peer requirements. Preserve user-selected versions and the lockfile. Never blindly install `@latest` or remove an old package until its replacement paths work and remaining imports have been checked.

`@orbs-network/spot-react` includes `spot-ui` and re-exports its SDK API, so a separate core install is unnecessary. Existing React 18/19 applications must still verify the selected package's peer range. No wallet library or host React Query provider is required. Add `@orbs-network/swap-ui` only when adopting the documented progress flow, after checking its actual exports and adapting its appearance.

## Provider path

Read [Provider](02-provider.md) and only the relevant [Panels](03-panels.md) sections.

1. Keep editable/source values in the DEX's existing state. Build small adapters for token shape, raw balances, current quotes, and wallet methods; share them through a local DEX context only when multiple components need them.
2. Pass the actual partner, connected account/chain, tokens, host wrapped-native token, amount, balance, available USD valuation, quote, callbacks, and wallet adapter directly to `SpotProvider`. Stabilize objects/functions with the host's React patterns. The provider loads protocol configuration itself.
3. For swaps, pass the original SDK quote as `marketQuote: { quote, isLoading, noLiquidity }`; the provider derives output/minimum/USD fields and preserves the exact request. Advanced adapters may keep flat `quotedOutputAmountRaw` and USD fields. Withhold stale quotes/amounts and show loading until the request matches current inputs. Swap execution checks the captured quote against the reviewed form before wallet writes, then calls `client.refreshAndPrepareSwap` after approval without a second preparation.
4. Use the focused public hooks to render the requested controls, errors, and submit gating through existing DEX components. Do not silently reset selected TWAP trade counts when a smaller amount makes them invalid.
5. Adapt the installed `walletInteractions` contract to the host wallet. The common methods are `getAllowance`, `wrapNativeToken`, `approveToken`, `signOrder`, and `cancelOrder`; write methods wait for successful receipts, and signing returns the original signature bytes. Implement extra methods only when required by the installed execution/retry path.
6. Use `useExecution` and `useSubmitButton` for review/progress state, duplicate prevention, and disabled/loading behavior. Pause obsolete quote requests through execution. Show swaps as successful only after fill; preserve and reconcile unknown attempts before another submission.
7. Refetch balances through lifecycle callbacks. Preserve the host input on failure/rejection; clear it only after success and use the installed reset/dismissal methods. Keep provider ownership stable across transient controls.
8. Add requested history/cancellation under the same provider or a context-preserving portal. Use `order.historyKey` for identity and the SDK's configured history/cancellation APIs.

## Provider-less router preparation

Use this path when the host already owns route competition and wallet orchestration. Validate the installed re-exports, then keep wrapping/approval/signing in that flow. After confirmed wallet steps and bounded allowance verification, prefer:

```ts
const prepared = await client.refreshAndPrepareSwap({ quote, account, signal });
```

Use this call only if the installed client actually exports it. Current builds check age internally: a quote up to 20 seconds old skips HTTP; otherwise the helper replays the original request, including preview `user`, slippage, and `dexMinAmountOut`, and compares refreshed `minimumAmountOut` against the reviewed minimum. A lower minimum throws `QUOTE_MINIMUM_DECREASED` and requires fresh review. Both paths retain the reviewed minimum and prepare new signing timestamps/nonce. Direct callers can set finite, non-negative `maxQuoteAgeMillis` (`0` forces refresh) when the installed API supports it. `isQuoteFresh` remains optional for host UI/cache policy, not an extra preparation step.

If the helper is absent, choose a compatible upgrade within the authorized task or implement the verified older API's explicit manual flow: retain an immutable reviewed snapshot, re-quote its exact original request after wallet steps, and compare integer `fresh.minimumAmountOut` with the reviewed minimum. Stop for fresh review if lower. Otherwise call the installed pure `client.prepareSwap(reviewedQuote, account)` immediately before signing. Do not substitute a `netAmountOut` comparison, silently accept a new reviewed minimum, or fabricate an SDK error code on an older release.

Validate live account/chain and host balance/minimum-trade policy before wallet writes and submission. The execution account supplies signer/recipient separately from the quote's preview user. Submit the original prepared order/signature once and track the accepted order with installed `waitForOrder`/`watchOrder` at a scope that survives modal closure. Pure `prepareSwap` alone performs no refresh check.

## Missing partner or chain activation

Check the installed runtime, existing partner identifier/filters, connected-chain support, and the read-only `createClient` result before concluding activation is absent. The provider normally owns initialization; use public SDK diagnostics rather than adding a parallel host configuration fetch. Never borrow another DEX's partner or hard-code protocol addresses.

Finish independent adapters/UI and make unavailable submission understandable. Give the user this ready-to-forward draft populated from discovered facts:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. We use [package and resolved version]. Read-only initialization returned [SDK code, HTTP status, service code, sanitized short message]. We verified [host support and package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, credentials/private URLs, and unrelated logs. Include the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup), but do not contact it automatically. External activation should not halt independent work.

## Verify completion

Run available build/typechecks and relevant existing checks. Verify the affected UI in a browser when available: loading/unavailable configuration, field validation, requested module navigation, review/progress, and history only if in scope. Use read-only partner/chain/quote checks; live signing, submission, or cancellation requires explicit authorization. Respect the host user's constraints on new files and tests; prefer relevant existing checks.

Hand off what now works, the checks actually run, and any specific blocker or action. Describe user-visible results in plain language instead of handing technical integration decisions back to a nondeveloper.
