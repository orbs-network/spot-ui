---
name: spot-swap-integration
description: Integrate Spot swaps into a TypeScript application or DEX router using quotes and host-owned wallet execution. Applies to React apps too; swaps use the public client without a provider.
---

# Spot Swap Integration

Implement the requested swap flow using the framework-neutral `@orbs-network/spot-ui` client. Reuse the host's route selection, wallet, source state, token inputs, review, and progress UI. Build missing host services when starting from an empty or non-trading app.

## Discover and choose the path

Prefer the installed, version-matched skill at `node_modules/@orbs-network/spot-ui/dist/integration-skills/spot-swap-integration/SKILL.md`; check `manifest.json.sdkVersion` against the installed package. Read [Quickstart](references/01-quickstart.md), then inspect installed root exports/types, package resolution, wallet/read services, quote lifecycle, chain/token metadata, and partner evidence. Discover technical choices from the repository; ask only about unresolved product scope or external activation.

Load the references needed for the request:

| Requested work | Read next |
| --- | --- |
| Add a source to an existing router | [Swap flow](references/02-swap-flow.md), then adapt the [router example](assets/spot-router-swap-example.ts) after checking installed imports |
| Build a standalone swap form | [Swap flow](references/02-swap-flow.md); use existing host inputs and review UI |
| Automatic/custom slippage or USD display | [Slippage and pricing](references/03-slippage-and-pricing.md) |
| Start without trading services, add a chain, or fix native tokens/balances | [Host services](references/04-host-services.md), then the swap flow |

React applications use this same client flow without `AdvancedOrdersProvider`. If the host already imports `@orbs-network/spot-react`, its public core re-exports are available without a second core install. For TWAP, Limit, Stop-Loss, or Take-Profit forms, select `spot-advanced-orders-integration` or `spot-advanced-orders-react-integration` instead.

For an existing `@orbs-network/liquidity-hub-sdk` swap integration, begin with [Liquidity Hub to Spot swap migration](../liquidity-hub-to-spot-swap-migration/SKILL.md) for the legacy API mapping and cutover workflow.

## Swap invariants

- Import only public package-root APIs from the installed release. Inspect compatibility before changing dependencies; do not install `@latest` blindly or import private source/`dist/*` code. Reading bundled documentation under `dist` is allowed.
- Reuse a host-managed `createClient(partner, chainId)` resource for the real partner/chain. Let the client load protocol configuration and `spenderAddress`; never substitute another partner or hard-code protocol contracts. Initialization failures remain retryable.
- Protocol input addresses are ERC-20 addresses. A native selection uses the host's verified wrapped token in quotes and protocol orders. The host owns wallet connection, balances, wrapping, allowance reads, approvals, confirmed receipts, signing, progress, and retries; the core SDK takes no wallet adapter.
- Quote the actual token pair with exactly one positive integer base-unit `inAmount` or `outAmount`. Each call makes one server request. An output target resolves to the fixed spend in `quote.request.inAmount`, with the target retained in `quote.requestedOutAmount`; never reverse the pair or search client-side.
- Slippage uses percentages (`0.5` means 0.5%). Preserve `quote.minimumAmountOut` exactly and do not apply slippage twice. `dexMinAmountOut` is an optional input-only local comparison threshold, never a wire field. Keep automatic/custom policy and USD unit prices in the host as described in [Slippage and pricing](references/03-slippage-and-pricing.md).
- Opening review reuses the current quote. Capture that quote, resolved input, account, chain, tokens, and slippage under the host's duplicate guard. Keep attempt state outside transient controls and check live wallet scope before each prompt and submission.
- Read allowance for `client.spenderAddress` before wrapping. Confirm each required transaction and verify sufficient exact-input allowance after approval. `ApprovalRequest.amount` is the required input; `approvalAmount` is a suggested cap, and the host may approve exactly or apply its own sufficient-cap policy.
- After confirmed prerequisites, call `client.prepareSwap({ quote, account, signal })`. Preparation reuses quotes aged zero to 20 seconds inclusive or refreshes the resolved fixed input. It never increases spending; a minimum below the reviewed floor rejects with `QUOTE_MINIMUM_DECREASED`. Publish and freeze `prepared.quote` before signing.
- Sign `prepared.signingRequest.typedData` unchanged for its `signerAddress`, then call `client.submitSwap(prepared.order, originalSignature, options?)`. Preserve the protocol payload and original hex signature; do not split, normalize, or rewrite its bytes. Swaps sign one limit trade and a three-minute lifetime. The reviewed DEX percentage is converted to basis points in `witness.slippage`; the quoted minimum is preserved unchanged in `witness.output.limit`.
- Submission means acceptance. Retain the prepared payload, original signature, confirmed hashes, and accepted/latest order. Own one cancellable `client.getOrder` polling lifecycle and show success only at `OrderStatus.Completed`. Reconcile uncertain acceptance against the exact original signed identity in configured history before replacement, resubmission, or another route.

## Verify and hand off

Run the host's available build, typecheck, and relevant existing checks. Verify the affected UI in a browser when available, including loading/error states, token/chain changes, review minimum and percentage, and progress through settlement. Keep live wallet execution out of verification unless explicitly authorized. Report actual checks and any remaining service or activation blocker; complete independent work before handing back.

SDK builds bundle this skill, references/assets, and a version-stamped manifest under `dist/integration-skills/spot-swap-integration/`. For a release without the bundle, use the [repository skill](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-swap-integration) from a matching checkout/release and verify the package version.
