# Quickstart

Protocol quotes and orders use ERC-20 input addresses. The DEX owns allowance reads, native wrapping, approval transactions, successful receipts, signing, progress, and retries. Read allowance for `client.spenderAddress` before a wrap prompt, then verify sufficient exact-input allowance after every confirmed approval. Native selections use the host-configured wrapped token as protocol input. Prepare after confirmed prerequisites, sign the returned data unchanged, and submit the exact order/original signature. `ApprovalRequest.amount` is the required input; `approvalAmount` is a suggested maximum cap, while the host may approve exactly or apply its own sufficient cap policy.

If the repository is empty or lacks a trading form/services, begin with [Starting without a DEX](08-starting-without-dex.md). Reuse any existing app, wallet, or data layer and build the missing pieces before following the execution path below.

## Establish the host and installed contract

Inspect these sources before asking the user for technical information:

- Manifest and lockfile: framework, package manager, installed/resolved Spot version, existing wallet/state/query/numeric libraries, and available build/typecheck commands.
- Installed documentation: prefer `node_modules/@orbs-network/spot-ui/dist/integration-skill/SKILL.md` and its relative references/assets; confirm `manifest.json.sdkVersion` equals the installed package version. Reading documentation under `dist` is allowed. For an older package without it, use the repository skill from a matching release/checkout, checked against `packages/spot-ui/package.json`.
- Installed package root exports and declarations: the API the host can actually import, including public preparation/submission, their reviewed input types, signing data, and `calculateOrder`. Inspect installed declarations rather than inferring behavior from a similar method name. SDK code imports remain package-root-only; a repository's latest README/source may describe a newer release.
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

## Host-owned execution

The DEX owns allowance reads, wrapping, approval, confirmed receipts, progress,
retries, and duplicate guards. After those prerequisites, prepare and sign:

```ts
const prepared = await client.prepareSwap({ quote, account, signal });
const { signerAddress, typedData } = prepared.signingRequest;
const signature = await walletClient.signTypedData({ ...typedData, account: signerAddress });
const acceptedOrder = await client.submitSwap(prepared.order, signature, { signal });
```

For advanced forms use
`client.prepareOrder({ form, account, inputTokenAddress, outputTokenAddress })`.
Both preparation methods return the protocol order and signing/approval data
without wallet callbacks. Submission resolves at acceptance for all order kinds.

1. Quote in the host's route lifecycle, with full identity keys and obsolete-request cancellation.
2. Reuse the client for the actual partner/chain and use its `spenderAddress` for allowance and approval. Supply host wrapped-native metadata.
3. Review `quote.minimumAmountOut` unchanged. Preserve host gas, balance, and minimum-trade policy; gate unsupported route modes.
4. Capture quote/form and account/chain under the host execution lock. Read allowance before opening a wrap prompt, then confirm required wrapping and approval. Verify sufficient allowance after each approval receipt.
5. Prepare after confirmations. Swap preparation reuses quotes aged zero to 20 seconds inclusive or refreshes the unchanged request, requiring the refreshed minimum to meet the reviewed floor. Freeze `prepared.quote` before signing; preparation stamps fresh nonce/timestamps.
6. Sign the exact typed data and submit its unchanged order/original signature once. Keep accepted/latest order, prepared payload, signature, and hashes in host state outside transient modals.
7. Check accepted IDs with `client.getOrder({ orderId, signal })` and own one cancellable status poller. Reconcile uncertain responses against exact original signed identity in account history before a replacement or fallback. Show swap completion only after a fill.

Read [Client and execution](03-client-and-execution.md) for ordering, progress,
and recovery. When installed declarations differ, use that release's matching
guide or make an authorized upgrade; never fake unavailable APIs or import private source.

## Advanced-order additions

Read [Form calculation](02-form-calculation.md) and [Client and execution](03-client-and-execution.md) only for this path. Keep editable values in the host state and derive the authoritative form; withhold stale output quotes, display `form.errors`, and require `form.canSubmit`. Source USD valuation from available quote totals or token prices according to the installed API. Preserve explicit trade counts when the amount changes.

Capture form/tokens/account/chain/client together for each attempt. Confirm host wrapping and approval, then call `client.prepareOrder`, sign inline, and submit as described in [Client and execution](03-client-and-execution.md). Never construct protocol order payloads manually. Add [History and cancellation](04-history-and-cancellation.md) only when requested; use `order.historyKey` for identity.

## Missing partner or chain

Use [Chain integration](06-chain-integration.md) to distinguish stale package resolution, host filters, unsupported wallet/read clients, and missing server activation. A successful SDK config lookup alone does not prove host chain support. Never use another partner's configuration or hard-code protocol addresses.

If activation is the remaining blocker, finish independent adapters/UI and keep submission clearly unavailable. Prepare this message with facts already discovered:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. The integration uses [package and resolved version]. Read-only initialization returned [sanitized SDK code, HTTP status, service code, and short message]. We verified [relevant host support/package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, private URLs/credentials, and unrelated logs. Give the draft to the user with the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup); do not send it automatically. Do not block independent work merely because activation is pending.

## Completion

Run available build/typechecks and relevant existing checks. Check the affected UI in a browser when available and perform read-only partner/chain/quote checks with public inputs where appropriate. Do not sign, submit, or cancel live orders as verification without explicit authorization. Respect the host user's constraints on new files and tests; prefer relevant existing checks.

Hand off what now works, what was actually verified, and the specific remaining blocker/action, if any. Do not ask a nondeveloper to resolve SDK method names, raw-unit conversions, or framework choices.
