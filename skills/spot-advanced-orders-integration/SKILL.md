---
name: spot-advanced-orders-integration
description: Integrate framework-neutral Spot advanced orders with @orbs-network/spot-ui. Use for TypeScript TWAP, Limit, Stop-Loss, and Take-Profit forms, calculation, wallet execution, history, and cancellation.
---

# Spot Advanced Orders — TypeScript

Implement the requested advanced-order integration in the host application. Discover the installed API and existing architecture before asking the user for technical details. Keep the requested order types and surfaces as the scope; create only the missing host services needed for them.

## Discover and choose the path

Prefer the installed version-matched skill at `node_modules/@orbs-network/spot-ui/dist/integration-skills/spot-advanced-orders-integration/SKILL.md`; verify its `manifest.json.sdkVersion` matches the installed package version. Read [Quickstart](references/01-quickstart.md), then inspect the host manifest/lockfile, installed root exports/types, wallet services, form/source state, quote lifecycle, token/chain metadata, reusable components, and real partner configuration. Inspect source/build resolution when a checkout differs from the installed package. Use the host package manager and existing state, wallet, and numeric libraries.

Ask only for an unresolved product choice or external partner activation that cannot be discovered locally. Continue independent work while an external dependency is pending.

For React provider and hook-driven forms, prefer `spot-advanced-orders-react-integration` when available. Swap quote/router integration belongs to `spot-swap-integration`; this skill implements the four advanced order types.

Load only the references needed:

| Requested work | Read next |
| --- | --- |
| Empty project or missing trading services | [Starting without a DEX](references/08-starting-without-dex.md), then the requested form/execution path |
| Form, price, or schedule controls | [Form calculation](references/02-form-calculation.md) |
| Preparation, signing, submission, progress, or recovery | [Client and execution](references/03-client-and-execution.md) |
| Account history or cancellation | [History and cancellation](references/04-history-and-cancellation.md) |
| New chain, missing partner, native tokens, balances, or prices | [Chain integration](references/06-chain-integration.md) |
| State/component integration | Relevant [Integration principles](references/05-integration-principles.md); adapt the [advanced-order example](assets/spot-advanced-orders-example.ts) after checking its imports against the installed API |

## Integration invariants

- Use public root exports from the installed `@orbs-network/spot-ui`. Never import private source or SDK code from `dist/*`, invent unavailable helpers, or blindly install `@latest`.
- Reuse the existing form, components, wallet flow, state/data primitives, and chain metadata. Build missing host services when necessary; avoid a second global store or parallel application.
- Initialize and reuse `createClient` for the real partner/chain. Let it load protocol configuration; do not substitute another partner or hard-code spender/cancellation contracts. Follow Quickstart's support-draft workflow if activation is unavailable.
- Own editable inputs once in the host and derive `calculateOrder` from current inputs and market data. It supplies defaults, validation, prices, trades, schedules, and raw execution values for TWAP, Limit, Stop-Loss, and Take-Profit. Gate with `form.canSubmit`; preserve explicit trade counts and show `MAX_TRADES` instead of silently clamping them.
- Use a current output quote for the entire typed input; withhold stale quotes. Supply one-token USD prices separately from raw token amounts, and keep raw integer execution values separate from display formatting.
- Protocol orders use ERC-20 input addresses. Normalize native input to the host's configured wrapped token. The host owns balances, allowance reads, wrapping, approvals, successful receipts, signing, progress, retries, and polling. Read allowance for `client.spenderAddress` before a wrap prompt and verify sufficient exact-input allowance after each approval receipt.
- `ApprovalRequest.amount` is the required input; `approvalAmount` is a suggested cap. The host may approve exactly or use its own sufficient cap policy. A confirmed hash alone does not prove sufficient allowance.
- Capture the reviewed form, tokens, account, chain, and client under one duplicate guard before wallet work. Keep attempt state outside transient controls, pause obsolete quotes, and validate live wallet scope before writes and submission.
- After confirmed prerequisites, call `client.prepareOrder({ form, account, inputTokenAddress, outputTokenAddress })` immediately before inline signing. Forward `signingRequest.typedData` unchanged and submit the exact prepared order/original EIP-712 signature through `client.submitOrder`. The core SDK takes no wallet adapter and has no execution session/progress contract.
- Submission returns acceptance. Retain prepared data, original signature, confirmed hashes, and accepted/latest order for recovery. Use host-owned `client.getOrder` reads to track fills; reconcile uncertain acceptance against the exact original signed identity in configured history before preparing a replacement.
- Add history only when requested. Use `order.historyKey` for list/cache identity and configured client history/cancellation methods. Refresh balances and history through the host lifecycle.

## Verify and hand off

Run the host's available build, typecheck, and relevant existing checks. Verify the affected UI in a browser when available, including loading, unavailable configuration, validation, and changed interactions. Keep wallet/network verification read-only unless live execution is explicitly authorized. Respect the host user's constraints on new files and tests.

Report what works, checks actually run, and any remaining blocker or user action. If activation is required, include a sanitized, ready-to-forward support draft without sending it automatically.

SDK builds bundle this skill, references/assets, and a version-stamped manifest under `dist/integration-skills/spot-advanced-orders-integration/`. Reading those documentation files is allowed; SDK code imports use the public package root. For an older release without it, use the [repository skill](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-advanced-orders-integration) from a matching release/checkout; do not assume repository main matches the installed release.
