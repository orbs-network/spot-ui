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
| Inline wallet signing without an adapter | [Client and execution](references/03-client-and-execution.md), inline wallet signing section |
| New chain, missing partner, balances, native tokens, or USD data | [Chain integration](references/06-chain-integration.md) |
| Substantial state/component integration | Relevant sections of [Integration principles](references/05-integration-principles.md); adapt [form example](assets/spot-integration-example.ts) only if useful |

A router source needs neither a new form nor account-history UI. Add only requested advanced modules. For a React provider/form request, use the companion `spot-react-integration` skill when available. For Liquidity Hub migration, replace its quote, spender, signing, and execution contracts; its old quotes/signatures cannot be submitted as Spot orders.

## Protocol invariants

- Protocol quotes and orders use ERC-20 input addresses. The DEX owns native wrapping, allowance reads, approvals, receipt confirmation, signing, progress, retries, and status polling. Read allowance for `client.spenderAddress` before a wrap prompt; verify sufficient exact-input allowance after every confirmed approval. `ApprovalRequest.amount` is the required input; `approvalAmount` is a suggested maximum cap, and the host may approve exactly or use its own sufficient cap policy. Prepare only after confirmed prerequisites and sign the returned data unchanged.

- Use public root exports from the installed `@orbs-network/spot-ui`; never import private source or `dist/*`. Inspect compatibility before installing/upgrading; do not blindly install `@latest` or invent unavailable exports.
- Reuse the existing app/order form, wallet flow, state/data primitives, chain metadata, and components. Create missing host services through the no-DEX path; do not build a parallel application or second global store when these already exist.
- Validate the real partner/chain with `createClient`; reuse the host-managed client resource and let the SDK load protocol configuration. Never substitute another partner or hard-code approval/cancellation contracts. Prepare a support draft as described in Quickstart when activation is missing.
- Raw token amounts are integer strings. Preserve the quote's `minimumAmountOut` exactly; do not apply slippage twice. Quote slippage uses percentages (`0.5` means 0.5%); signed swap oracle protection and the three-minute prepared lifetime are SDK rules.
- For router execution, capture the reviewed quote and account/chain under the host lock. After host wrapping/approval, call `client.prepareSwap`, sign its `signingRequest.typedData` inline, and call `client.submitSwap` with the same prepared order and original signature. Preparation reuses quotes aged zero to 20 seconds inclusive or refreshes the unchanged request, rejecting a minimum below the reviewed floor with `QUOTE_MINIMUM_DECREASED`. Freeze `prepared.quote` before the signature prompt.
- For UI previews, read allowance and wrapping requirements through existing DEX wallet/read services. Show host loading/progress and never treat a preview or confirmed hash alone as proof of sufficient allowance.
- Use `client.prepareOrder({ form, account, inputTokenAddress, outputTokenAddress })` for advanced forms and `client.prepareSwap({ quote, account, signal })` for swaps. Both return signing/approval data without wallet callbacks. Submit swaps through `client.submitSwap(order, signature, options?)` and advanced orders through `client.submitOrder(order, signature, options?)`; both return acceptance; use `client.getOrder` for fills. Preserve prepared data, original signature, hashes, and accepted/latest order for recovery. The core SDK has no execution factory, wallet adapter, or session/progress contract.
- Keep wallet steps in the DEX and confirm their receipts before preparation. After each approval receipt, verify allowance covers the exact reviewed input before opening the signature prompt. A wallet-edited cap can require another approval according to host policy.
- The connected account supplies signer/recipient separately from quote-request metadata. Validate live account/chain, balances, and host minimum-trade policy before wallet writes and submission. Use the wrapped ERC-20 address for native protocol input and let the host's `shouldWrap`/`shouldApprove` callbacks decide prerequisites before the corresponding confirmed transaction callbacks; approval targets `client.spenderAddress`.
- Use `calculateOrder` for form defaults, derived values, schedules, and validation. Recalculate from current inputs, withhold stale quote amounts, and gate with `form.canSubmit`. Preserve explicit trade counts; show `MAX_TRADES` rather than silently clamping an invalid selection.
- Prepare advanced orders with `client.prepareOrder` after confirmed host prerequisites, immediately before inline signing. Preserve the exact prepared order and original EIP-712 signature unchanged.
- Capture one host attempt per reviewed intent and acquire its duplicate guard before wallet work. Keep attempt state outside transient controls and pause obsolete quotes. Submission returns acceptance for all kinds; the host owns a single `client.getOrder` poller for fills. Preserve accepted/latest order, prepared payload, signature, and hashes, and reconcile uncertain acceptance against exact original signed identity in configured history before a replacement or fallback.
- For requested history, use `order.historyKey` for cache/list identity and configured client history/cancellation methods. Refresh balances through the host lifecycle. Keep raw execution values separate from formatted display values.


## Verify and hand off

Run the host's available build, typecheck, and relevant existing checks. Verify the affected UI in a browser when available, including loading, unavailable configuration, validation, and the changed interaction; keep wallet/network verification read-only unless live execution is explicitly authorized. Respect the host user's constraints on new files and tests; prefer relevant existing checks. Report checks actually run and any verification limitation.

Complete the authorized independent work before handing back. Use plain language to say what works, what was verified, and any remaining blocker or user action. If partner activation is required, include a sanitized, ready-to-forward support draft; do not send it automatically.

Current SDK builds bundle this skill, its references/assets, and a version-stamped manifest under `dist/integration-skill/`. Reading those documentation files is allowed; SDK code imports still use only the public package root. If an older package has no bundled skill, use the [repository skill](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration) from a matching release/checkout and check `packages/spot-ui/package.json`; do not assume repository main matches the installed release.
