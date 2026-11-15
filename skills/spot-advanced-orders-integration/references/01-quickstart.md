# Advanced Orders Quickstart

Protocol orders use ERC-20 input addresses. The host owns allowance reads, native wrapping, approvals, successful receipts, signing, progress, and retries. Read allowance for `client.spenderAddress` before a wrap prompt, then verify sufficient exact-input allowance after each confirmed approval. Prepare after those prerequisites and preserve the exact order/original signature.

If trading services are absent, begin with [Starting without a DEX](08-starting-without-dex.md). Build only the missing services needed for the requested advanced-order form or history surface.

## Establish the host and installed contract

Inspect these sources before asking for technical information:

- Manifest and lockfile: framework, package manager, installed Spot version, wallet/state/query/numeric libraries, and build/typecheck commands.
- Installed documentation: prefer `node_modules/@orbs-network/spot-ui/dist/integration-skills/spot-advanced-orders-integration/SKILL.md` and its references/assets; confirm `manifest.json.sdkVersion` matches the installed package. For an older package without it, use a matching release/checkout rather than assuming repository main is compatible.
- Root exports/declarations: available calculation, preparation, signing, submission, history, and cancellation types. SDK code imports remain package-root-only.
- Existing order form/components: token selectors, amount and price inputs, schedule controls, review/progress UI, notifications, translations, and requested history.
- Host wallet and source state: account/chain, typed amount, balances, allowance/receipt/signing methods, current market quotes, and cancellation of obsolete requests.
- Chain/token registry: verified addresses, decimals, wrapped-native token, explorer metadata, and USD prices.
- Partner evidence: configuration/constants, supported-chain filters, and a read-only `createClient(partner, chainId)` result or structured error. Do not infer the partner from a similar DEX name.

Reuse existing dependencies. If Spot is absent, select a concrete compatible release using its public contract and the host package manager. Preserve user-selected versions and lockfile conventions; avoid blind `@latest` upgrades and private imports.

## Choose the requested surface

| Path | Minimum deliverable |
| --- | --- |
| New or non-trading app | Missing host services, plus the requested advanced-order form/execution surface |
| Advanced-order form | Requested controls, `calculateOrder` derivation/validation, configured client, and host-owned execution |
| History/cancellation | Existing account history surface, configured fetching, stable order identity, and confirmed cancellation |

Do not add every order type or history merely because the SDK supports it. Ask only about unresolved product choices that materially change the deliverable.

## Calculate the form

Read [Form calculation](02-form-calculation.md). Keep editable inputs and external market data in host state and derive the authoritative `CalculatedOrderForm`. Pass a current raw output quote for the complete input, withhold stale values, and supply one-token USD prices separately. Display `form.errors`, require `form.canSubmit`, and preserve explicit trade counts across amount edits.

## Prepare, sign, and submit

Read [Client and execution](03-client-and-execution.md). After the host has confirmed wrapping and sufficient allowance:

```ts
const prepared = client.prepareOrder({
  form, account, inputTokenAddress, outputTokenAddress,
});
const { signerAddress, typedData } = prepared.signingRequest;
const signature = await walletClient.signTypedData({ ...typedData, account: signerAddress });
const acceptedOrder = await client.submitOrder(prepared.order, signature, { signal });
```

1. Reuse the client for the actual partner/chain. Use `client.spenderAddress` for allowance and approval; native input uses the verified wrapped ERC-20 address.
2. Capture form, tokens, account, chain, and client under one host duplicate guard. Pause obsolete quote requests and recheck live wallet scope before writes/submission.
3. Read allowance before a wrap prompt, confirm required wrapping/approval receipts, and verify allowance covers the exact reviewed input. `approvalAmount` is a suggested cap; exact sufficient approval is valid.
4. Call `prepareOrder` immediately before signing to obtain the correct nonce and timestamps. Sign the returned typed data unchanged, then submit its exact prepared order/original signature once.
5. Retain prepared data, signature, hashes, and accepted/latest order outside transient dialogs. Submission returns acceptance; use `client.getOrder({ orderId, signal })` in a host-owned polling lifecycle when fill tracking is needed.
6. Reconcile uncertain acceptance against the exact original signed identity in configured history before preparing a replacement. Never rebuild protocol payloads manually or blindly repeat an uncertain POST.

Add [History and cancellation](04-history-and-cancellation.md) only when requested. Use `order.historyKey` for list/cache identity and client-generated cancellation requests.

## Missing partner or chain

Use [Chain integration](06-chain-integration.md) to distinguish package resolution, host network support, and missing server activation. A successful SDK config lookup alone does not establish host chain support. Do not substitute another partner or hard-code protocol addresses.

If activation is the remaining blocker, finish independent adapters/UI and keep submission unavailable. Prepare this message with facts already discovered:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. The integration uses [package and resolved version]. Read-only initialization returned [sanitized SDK code, HTTP status, service code, and short message]. We verified [relevant host support/package resolution]. Please confirm the supported partner identifier and activation status.

Remove wallet addresses, signatures, signed orders, private URLs/credentials, and unrelated logs. Give the draft to the user with the support destination [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup); do not send it automatically or stop independent work while activation is pending.

## Completion

Run available build/typechecks and relevant existing checks. Verify affected UI in a browser when available and perform appropriate read-only partner/chain/quote checks. Live signing, submission, or cancellation requires explicit authorization. Report what works, what was actually checked, and any remaining blocker/action.
