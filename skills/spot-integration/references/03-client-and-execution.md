# Client and Execution

## Client Lifecycle

`createClient(partner, chainId)` validates the supported partner/chain, fetches RePermit configuration, validates its chain and addresses, and returns a new frozen `SpotClient`. It has no global cache.

Key the host resource by both partner and chain. Reuse an in-flight promise to deduplicate initialization, and remove a rejected promise so a deliberate retry can initialize again. Invalidate the old resource when either key changes. Keep the previous form mounted while initialization loads or retries; the host should show its own retryable error state.

Keep the client promise, wallet adapter, and in-flight locks in a non-reactive service/module field or framework equivalent. Reactive state should expose only the small status/error data the existing app components render. Storing the client or wallet object in broadly subscribed state causes unnecessary updates and unstable dependency chains.

Do not separately fetch RePermit configuration or copy its addresses into application configuration. Use:

- `client.spenderAddress` for allowance and approval;
- `client.exchangeAddress` through configured history;
- `client.prepareOrder` for the exact protocol order, signing payload, and approval payload;
- `client.getCancelOrderRequest` for version-aware cancellation.

## Wallet Port

Adapt the host wallet instead of making Spot depend on a wallet library:

```ts
import type {
  AllowanceRequest,
  ApprovalRequest,
  CancelOrderRequest,
  OrderSigningRequest,
} from "@orbs-network/spot-ui";

interface SpotWalletPort {
  getAllowance(request: AllowanceRequest): Promise<string>;
  wrapNativeToken(amountRaw: string): Promise<`0x${string}`>;
  approveToken(request: ApprovalRequest): Promise<`0x${string}`>;
  signOrder(request: OrderSigningRequest): Promise<`0x${string}`>;
  cancelOrder(request: CancelOrderRequest): Promise<`0x${string}`>;
}
```

Write methods must resolve only after the transaction receipt is confirmed. The signing method receives framework-neutral EIP-712 data:

- Viem adapters can pass `typedData.domain`, `typedData.types`, `typedData.primaryType`, and `typedData.message`, mapping `signerAddress` to `account`.
- Ethers adapters can pass the domain, types, and message to the signer using the host's supported Ethers version.

Return the original `0x`-prefixed signature. Do not transform it.

## Submission Sequence

Treat one click as one immutable attempt and reject concurrent attempts:

1. Capture the calculated form, tokens, account, partner, chain, and client.
2. Stop if `form.canSubmit` is false or the current wallet context no longer matches the captured account/chain.
3. Normalize native input to the wrapped-native token from the host chain configuration.
4. Read allowance for `{ tokenAddress, spenderAddress: client.spenderAddress }` against `form.inputAmount.raw`.
5. If input is native, wrap `form.inputAmount.raw` and wait for confirmation.
6. If the allowance was insufficient, approve the exact raw amount and wait for confirmation.
7. Re-read allowance with a small bounded retry to tolerate RPC indexing lag. Stop if it is still insufficient.
8. Call `client.prepareOrder` with the captured form, normalized ERC-20 input address, output token address, and account.
9. Call `wallet.signOrder(preparedOrder.signingRequest)`.
10. Call `client.submitOrder(preparedOrder, signature)` once.
11. Refresh balances and history on success.

`prepareOrder` must run late in the sequence because it stamps `currentTimeMillis`, `deadlineMillis`, and a nonce. It does not recalculate the form and rejects `form.canSubmit === false`. Keep its returned `form` snapshot for the review/progress UI so the user sees the values that were signed.

The returned `preparedOrder.approvalRequest` documents the same token, amount, and spender embedded in the prepared order. If the host pre-checks allowance before preparation to keep timestamps fresh, construct the check from the normalized token, `form.inputAmount.raw`, and `client.spenderAddress`, then confirm it matches the returned approval request.

## Failure Semantics

- Use `isTxRejected(error)` to distinguish user rejection from operational failures.
- Preserve the form after rejection or failure so the user can retry deliberately.
- A rejected approval or signing request is safe to retry after a new user action.
- Do not recursively or automatically repeat wallet prompts.
- If submission fails before receiving a definitive response, do not immediately prepare and sign another order. First reconcile recent history for the captured account/chain or present a retry decision; an ambiguous request may have reached the service.
- If account, chain, token pair, or input changes during an attempt, finish or cancel the captured attempt without mixing new state into it.

Every new submission attempt should calculate/validate a current form and call `prepareOrder` again. Never reuse an old `PreparedOrder` after its deadline context is stale.
