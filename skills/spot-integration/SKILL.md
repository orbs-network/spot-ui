---
name: spot-integration
description: Integrate the framework-neutral @orbs-network/spot-ui SDK into an existing DEX or build the missing trading services in a new or non-DEX app. Covers swap routing, advanced orders, history, and Liquidity Hub migration. Use spot-react-integration for a React provider and hook-driven form.
---

# Spot TypeScript Integration

Implement the requested Spot integration. Treat these instructions as work for the agent: discover technical details from the repository instead of asking the user to supply them. Keep the user's requested modules and existing architecture as the scope. When trading infrastructure is absent, create only the host services needed for that scope.

## Discover before asking

Prefer the installed version-matched skill at `node_modules/@orbs-network/spot-ui/dist/integration-skill/SKILL.md`; verify its `manifest.json.sdkVersion` matches the installed package version. Read [Quickstart](references/01-quickstart.md), then inspect the host manifest, lockfile, installed root exports/types, existing wallet adapter, swap state, quote flow, chain/token metadata, reusable components, and partner configuration evidence. Inspect source/build resolution when the checkout and installed package differ. Use the host package manager and existing state/wallet libraries.

Infer the implementation path from that evidence and the request. Ask only for an unresolved product decision or external partner activation that cannot be determined locally. Explain product choices in plain language; do not ask the user to choose hooks, SDK methods, raw units, or state architecture. Continue independent implementation while an external dependency is pending.

## Choose the smallest path

If there is no DEX, or the app has no wallet, token registry, balances, or quotes, read [Starting without a DEX](references/08-starting-without-dex.md) first. Inventory what exists and implement the missing host layer; do not keep searching for nonexistent DEX hooks or assume Spot supplies those services. An existing non-trading app keeps its framework and components; an empty project needs a minimal application as well.

Load only the references needed for the selected work:

| Requested work | Read next |
| --- | --- |
| Start without a DEX or add trading to a non-DEX app | [Starting without a DEX](references/08-starting-without-dex.md), then the requested execution/form path |
| Add Spot as a source in an existing swap router | [Swap and migration](references/07-swap-and-migration.md); use [router example](assets/spot-router-swap-example.ts) after checking its imports against the installed API |
| Advanced-order form or edited price/schedule controls | [Form calculation](references/02-form-calculation.md) and [Client and execution](references/03-client-and-execution.md) |
| Account history or cancellation | [History and cancellation](references/04-history-and-cancellation.md) |
| New chain, missing partner, balances, native tokens, or USD data | [Chain integration](references/06-chain-integration.md) |
| Substantial state/component integration | Relevant sections of [Integration principles](references/05-integration-principles.md); adapt [form example](assets/spot-integration-example.ts) only if useful |

A router source needs neither a new form nor account-history UI. Add only requested advanced modules. For a React provider/form request, use the companion `spot-react-integration` skill when available. For Liquidity Hub migration, replace its quote, spender, signing, and execution contracts; its old quotes/signatures cannot be submitted as Spot orders.

## Protocol invariants

- Protocol quotes and orders use ERC-20 input addresses. Required wallet callbacks `shouldWrap()` and `shouldApprove(request)` return a boolean or a promise of one from captured input and live allowance state. False skips the corresponding write. When invoked, `wrapNativeToken` and `approveToken` return a transaction hash only after a successful receipt; they throw on failure and never return undefined to skip. After each confirmed approval, the SDK rechecks live allowance and retries approval once if necessary; continued insufficiency rejects with `INSUFFICIENT_ALLOWANCE` before signing. Advanced React forms normalize native execution to `wrappedNativeToken`; provider-free swap hosts supply the wrapped protocol address themselves. Users review before execution. `ApprovalRequest.amount` remains the exact required input; compare live allowance only with that value. `approvalAmount` is a suggested cap, defaulting to the maximum uint256. The approval write may follow that suggestion, approve the exact amount, or apply host policy without mutating the immutable request.

- Use public root exports from the installed `@orbs-network/spot-ui`; never import private source or `dist/*`. Inspect compatibility before installing/upgrading; do not blindly install `@latest` or invent unavailable exports.
- Reuse the existing app/order form, wallet flow, state/data primitives, chain metadata, and components. Create missing host services through the no-DEX path; do not build a parallel application or second global store when these already exist.
- Validate the real partner/chain with `createClient`; reuse the host-managed client resource and let the SDK load protocol configuration. Never substitute another partner or hard-code approval/cancellation contracts. Prepare a support draft as described in Quickstart when activation is missing.
- Raw token amounts are integer strings. Preserve the quote's `minimumAmountOut` exactly; do not apply slippage twice. Quote slippage uses percentages (`0.5` means 0.5%); signed swap oracle protection and the three-minute prepared lifetime are SDK rules.
- For router execution, inspect the installed `createSwapExecution` constructor and session methods. Capture the reviewed quote and host wallet callbacks once. Choose `run()` or the same session's `wrap()`/`approve()`/`sign()`/`submit()`/`waitForCompletion()` sequence; do not use detached preparation or signed-submission calls. After confirmed prerequisites, signing reuses the reviewed quote when its local receipt age is zero to 20 seconds, inclusive; older quotes or invalid/future receipt times trigger a refresh for the unchanged request. A refreshed minimum must meet the original reviewed floor; `QUOTE_MINIMUM_DECREASED` requires fresh review. Display quotes may remain live through wrap/approval; freeze output and minimum from `preparedOrder.quote` before the wallet signature request.
- For UI previews, call zero-argument `execution.shouldWrap()` and `execution.shouldApprove()` (`Promise<boolean>`). They use the host decision callbacks with captured request data, without writes, preparation, progress, start, or lock. Pending checks are fresh and completed own steps return false. Actual methods recheck; use `run()` or the documented conditional step sequence.
- Create quote sessions with `client.createSwapExecution({ quote, account, walletInteractions, signal })`; create advanced sessions with `client.createOrderExecution({ form, inputTokenAddress, outputTokenAddress, account, walletInteractions, signal })`. Constructors validate/snapshot synchronously and perform no wallet work. Progress belongs only to `run({ onProgress })` (`ExecutionRunOptions<T>`); constructors and individual step methods accept no observer. `run()` returns the completed swap `Order` or accepted advanced `Order`. Read prepared payloads, hashes, signature, and accepted/latest order from the session.
- For host-controlled steps, use one session and await the required steps in order. `sign()` verifies confirmed prerequisites and stores the exact prepared order and unchanged signature. `submit()` takes no arguments and submits that pair once; `waitForCompletion()` tracks fills. Invalid ordering rejects. An externally completed prerequisite must be reflected by the wallet decision callbacks; `shouldApprove(request)` reads live host allowance.
- The connected account supplies signer/recipient separately from quote-request metadata. Validate live account/chain, balances, and host minimum-trade policy before wallet writes and submission. Use the wrapped ERC-20 address for native protocol input and let the host's `shouldWrap`/`shouldApprove` callbacks decide prerequisites before the corresponding confirmed transaction callbacks; approval targets `client.spenderAddress`.
- Use `calculateOrder` for form defaults, derived values, schedules, and validation. Recalculate from current inputs, withhold stale quote amounts, and gate with `form.canSubmit`. Preserve explicit trade counts; show `MAX_TRADES` rather than silently clamping an invalid selection.
- Advanced preparation belongs to session `sign()` after confirmed prerequisites, immediately before wallet signing. Return the original wallet EIP-712 signature unchanged. Wallet writes wait for successful receipts.
- Capture one execution session per reviewed intent and guard duplicate submission of that intent before wallet work. Independent sessions may run concurrently for the same account/client; repeated calls within one session share its promises. Pause obsolete quotes, keep the session outside transient controls, and reconcile uncertain acceptance before replacing an intent. `submit()` sets accepted `execution.order`; during `run()`, this happens before the corresponding progress event. Swap `run()`/`waitForCompletion()` owns one settlement poller; advanced `run()` ends at acceptance. Preserve error `orderId`/`order` and check known IDs with ordinary `client.getOrder` reads; reconcile unknown acceptance against exact original signed identity in configured history. The host owns further polling. Constructors accept new reviewed input only.
- For requested history, use `order.historyKey` for cache/list identity and configured client history/cancellation methods. Refresh balances through the host lifecycle. Keep raw execution values separate from formatted display values.


## Verify and hand off

Run the host's available build, typecheck, and relevant existing checks. Verify the affected UI in a browser when available, including loading, unavailable configuration, validation, and the changed interaction; keep wallet/network verification read-only unless live execution is explicitly authorized. Respect the host user's constraints on new files and tests; prefer relevant existing checks. Report checks actually run and any verification limitation.

Complete the authorized independent work before handing back. Use plain language to say what works, what was verified, and any remaining blocker or user action. If partner activation is required, include a sanitized, ready-to-forward support draft; do not send it automatically.

Current SDK builds bundle this skill, its references/assets, and a version-stamped manifest under `dist/integration-skill/`. Reading those documentation files is allowed; SDK code imports still use only the public package root. If an older package has no bundled skill, use the [repository skill](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration) from a matching release/checkout and check `packages/spot-ui/package.json`; do not assume repository main matches the installed release.
