---
name: liquidity-hub-to-spot-swap-migration
description: Migrate an existing Liquidity Hub swap or DEX router integration from @orbs-network/liquidity-hub-sdk to Spot, including quotes, approvals, signing, submission, and settlement. Applies to TypeScript and React hosts.
---

# Liquidity Hub to Spot Swap Migration

Replace the host's existing Liquidity Hub swap path with the public Spot client while preserving its route selection, wallet services, token inputs, slippage policy, review, and progress UI. This is a protocol migration: changing package names alone leaves incompatible approvals, signatures, and completion handling.

## Discover the existing integration

Prefer this skill from the installed `@orbs-network/spot-ui/dist/integration-skills/liquidity-hub-to-spot-swap-migration/` and verify its `manifest.json.sdkVersion` against the resolved package. Inspect the host manifest/lockfile, installed public root exports/types, and any locally copied Liquidity Hub adapter, hook, proxy, or request implementation. Match repository documentation to the installed release before using its APIs.

Find legacy package imports, `LiquidityHubClient`, `permit2Address`, `signQuote`, `isFreshQuote`, `isLiquidityHubBetter`, `sdk.swap`, `dexRouterData`, `lhOverrideApiUrl`, and analytics callbacks. Trace their callers through quote caching, route comparison, allowance/wrapping, signing, receipt waiting, notifications, explorer links, retries, and pending-attempt storage. Identify any existing in-flight legacy swaps before changing their recovery path.

Read the [legacy API map](references/legacy-api-map.md) and the sibling [Spot swap flow](../spot-swap-integration/references/02-swap-flow.md). Use the sibling [quickstart](../spot-swap-integration/references/01-quickstart.md) for client/configuration discovery or missing partner activation. These sibling guides ship in the same core SDK bundle.

Choose a compatible concrete package version using the host package manager. Use `@orbs-network/spot-ui` for a framework-neutral client; a React host can use an existing `@orbs-network/spot-react` installation's public core re-exports. Swaps need no provider, `calculateOrder`, or advanced-order hooks. New swap integrations without a Liquidity Hub path belong to [Spot swap integration](../spot-swap-integration/SKILL.md).

## Replace the full swap path

1. **Client and configuration.** Replace synchronous legacy construction with a reusable `await createClient(partner, chainId, options)` resource. Discover the actual supported `Partners` value and chain configuration; a legacy partner string does not prove Spot activation. Keep initialization failures retryable. Map `blockAnalytics` to `disableAnalytics` at creation. Do not carry a Hub endpoint, relative proxy, or browser-storage override into Spot automatically. Continue independent work if external activation is unavailable; use the quickstart's support-draft workflow without sending it.

2. **Quote and route state.** Request a new `SwapQuote` through `client.getQuote` using `inToken`, `outToken`, required `user`, percentage slippage, and exactly one positive base-unit `inAmount` or `outAmount`. Invalidate legacy quote caches and discard legacy signing material. Use `quote.request.inAmount` as the executable fixed input, including for output targets. Preserve `minimumAmountOut` exactly for comparison and review; do not subtract slippage again or equate every old gas-adjusted field with the new output fields. Keep the host's route/gas/fee and balance policies. Opening review reuses the current quote.

3. **Wallet prerequisites.** Capture the reviewed quote, account, chain, tokens, and slippage under the host's duplicate guard before wallet work. Use the host's verified wrapped ERC-20 input for native selections. Replace Permit2 allowance/approval with reads and approvals for `client.spenderAddress`; prior Permit2 allowance does not cover Spot. Read allowance before wrapping, confirm every required wrap/approval receipt, and reread allowance after approval to verify it covers the exact fixed input. Keep the host's exact-or-sufficient-cap approval policy; `ApprovalRequest.amount` is required input and `approvalAmount` is a suggested cap.

4. **Prepare and sign.** After confirmed prerequisites, call `client.prepareSwap({ quote: reviewedQuote, account, signal })`. Do not sign `quote.eip712` or rebuild Permit2 data. Preparation reuses quotes aged zero to twenty seconds inclusive or refreshes the resolved fixed input; it never increases spending. A decreased protected minimum rejects with `QUOTE_MINIMUM_DECREASED` and requires fresh review. Publish and freeze `prepared.quote` before the signature prompt. Sign `prepared.signingRequest.typedData` unchanged for its `signerAddress`; keep the wallet's original hex signature without splitting or rewriting bytes. Recheck live account/chain and captured scope before each wallet prompt and submission.

5. **Submit and track.** Replace `sdk.swap(quote, signature, dexRouterData)` with `client.submitSwap(prepared.order, originalSignature, { signal })`. It returns an accepted `Order`, not a transaction hash or proof of fill. Retain the prepared payload, original signature, confirmed hashes, and accepted/latest order outside transient UI. Own one cancellable `client.getOrder({ orderId: accepted.id, signal })` polling lifecycle and show success only at `OrderStatus.Completed`. Distinguish cancelled/expired results and any partial fills. Use available fill transaction hashes for explorer links rather than treating the order ID as a transaction hash.

6. **Recovery and cutover.** A missing lookup or local timeout does not prove failure. Reconcile uncertain submission against the exact original signed identity in configured account history before resubmitting, signing a replacement, or running another route. Spot takes no `dexRouterData` fallback argument and supplies no core execution lock or automatic fill polling. Preserve host recovery for any pending legacy attempt using its original protocol identity; never feed a legacy session or transaction hash into Spot order lookups. Remove obsolete imports, callbacks, adapters, dependencies, and lockfile entries only after their remaining consumers are handled. Keep unrelated advanced-order integrations outside this migration's scope.

Adapt the existing [typed router example](../spot-swap-integration/assets/spot-router-swap-example.ts) after checking its imports against the installed release. For automatic/custom slippage and USD display, read [Slippage and pricing](../spot-swap-integration/references/03-slippage-and-pricing.md); for missing native-token, allowance, or wallet services, read [Host services](../spot-swap-integration/references/04-host-services.md).

## Verify the migration

Run the host's available typecheck/build and relevant existing checks. Verify the affected UI in a browser when available. Cover the changed boundaries: stale quote cancellation, token/account/chain changes during wallet work, existing Permit2 allowance with insufficient Spot allowance, confirmed but insufficient approval, refreshed minimum requiring review, accepted-but-open orders, delayed indexing, and uncertain submission without duplicate execution. Use existing mocks or read-only verification; live wallet execution requires explicit authorization.

Search the migrated path again for legacy imports, spender constants, quote-signing fields, session polling, hash-based success assumptions, and analytics callbacks. Explain any intentional remaining legacy consumer. Report the implemented path, actual checks, and any unresolved partner/chain activation; do not label migration complete while its required execution or settlement path is still missing.
