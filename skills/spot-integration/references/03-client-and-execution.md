# Client and Execution

## Client resource

Reuse `createClient(partner, chainId, options?)` through the host's existing
resource/cache pattern. The client owns validated protocol configuration,
spender, signing data, history, and cancellation requests. Partner/chain selection,
wrapped-native metadata, wallet state, and UI belong to the host. Failed client
initialization remains retryable. Do not mirror protocol configuration into a
second host store or create another client for each history poll.

Core preparation exposes `Eip712TypedData`, `OrderSigningRequest`, and
`ApprovalRequest` so direct DEX integrations can use their existing wallet code.
The React adapter's `WalletInteractions`, `AllowanceRequest`, and
`WalletInteractionError` are exported only by `@orbs-network/spot-react`.
Core `SpotErrorCode` describes protocol/preparation/submission/read failures;
handle host wallet errors through the host's own wallet contract.

Keep the client promise and host attempt state in non-reactive service fields or
focused host state. Subscribe UI only to the progress fields it renders. The
[adapter example](../assets/spot-integration-example.ts) illustrates advanced
orders; the [router example](../assets/spot-router-swap-example.ts) illustrates swaps.

## Inline wallet signing

For a host that already controls wallet steps, use `client.spenderAddress` for
ERC-20 allowance reads and approvals, then prepare and sign directly. Confirm
wrapping and enough allowance for the exact input before preparation. Neither
preparation nor direct submission performs wallet checks or sends transactions.

```ts
const prepared = await client.prepareSwap({ quote, account, signal });
const { signerAddress, typedData } = prepared.signingRequest;
const signature = await walletClient.signTypedData({
  ...typedData,
  account: signerAddress,
});
const acceptedOrder = await client.submitSwap(prepared.order, signature, { signal });
```

For an advanced order, replace the preparation call with
`client.prepareOrder({ form, account, inputTokenAddress, outputTokenAddress })`
and submit its inline signature through `client.submitOrder()`.
`PrepareSwapParams`, `PrepareOrderParams`, `SubmitSwapOptions`, and `SubmitOrderOptions`
are public types. These methods need no `walletInteractions`. `signingRequest.typedData`
exposes the EIP-712 `domain`, `types`, `primaryType`, and `message`;
`approvalRequest` exposes the token, spender, exact input, and suggested approval
cap. Prepare after confirmed wallet prerequisites, immediately before signing,
to obtain a fresh nonce and timestamps. Swap preparation applies the same quote
freshness and protected-minimum checks described below.

Forward the data unchanged to the host signer, then submit that exact
`prepared.order` with the original hex signature. Validate the current wallet
account/chain and preserve the reviewed intent through both calls. Direct
`submitSwap` and `submitOrder` both resolve at acceptance. They share the same
validated submission transport; `submitSwap` names the swap path clearly. Read known IDs with
`client.getOrder({ orderId: acceptedOrder.id, signal })` to check fills. The host
owns further polling and duplicate-submission guards; do not automatically retry
an uncertain POST or create another signed intent before reconciling it in history.

## Host wallet prerequisites and progress

The core SDK takes no wallet adapter and has no execution session. The DEX owns
its allowance reads, native wrapping, approval transactions, receipt confirmation,
wallet scope checks, progress, duplicate guard, retries, and status polling.
Use the host's existing wallet/read services instead of introducing a second
wallet abstraction for Spot.

1. Capture the confirmed quote/form, account, chain, token pair, raw input, and slippage under one host execution lock.
2. Read allowance for the ERC-20 input and `client.spenderAddress` before the wrap prompt. Keep the review button disabled with its loader while this read is pending.
3. Wrap native input only when needed, using the host-configured wrapped token and confirmed receipt. Protocol quotes/orders always use the wrapped ERC-20 address.
4. Approve only when allowance is below the exact reviewed input. Wait for a successful receipt and read allowance again. If a wallet lowers the cap, stop or retry according to host policy before signing. Read failures and wallet rejections stop the attempt.
5. Prepare after those confirmed prerequisites. Show the returned quote/order unchanged before signing, then forward `signingRequest.typedData` and `signerAddress` to the host signer.
6. Keep the exact prepared order, original signature, confirmed hashes, and accepted/latest order in host state for progress and recovery. Submit once with `client.submitSwap()` for swaps or `client.submitOrder()` for advanced orders.

`ApprovalRequest.amount` is the required input in integer base units.
`approvalAmount` is only a suggested cap, defaulting to maximum uint256; the host
can approve the exact amount or apply its own policy. A confirmed approval hash
alone does not prove enough allowance. Do not split `{ v, r, s }`, rewrite recovery
bytes, or normalize the signature returned by the wallet.

Viem signers can spread the returned typed data and set `account: signerAddress`.
Ethers signers pass the same domain, struct types, and message through the host's
supported signing API. Use `client.getCancelOrderRequest()` separately for
on-chain cancellation; aborting local work cannot cancel an accepted order.

## Quote freshness and failure handling

After confirmed host prerequisites, `client.prepareSwap()` reuses the reviewed
quote when its local receipt age is between zero and 20 seconds, inclusive. Older
quotes, invalid receipt times, and future receipt times refresh the exact original
request. A refreshed protected minimum below the reviewed floor rejects with
`QUOTE_MINIMUM_DECREASED`; otherwise the selected quote becomes the prepared order.
Estimates may remain live through wrap/approval, then freeze displayed output and
minimum from `prepared.quote` before opening the wallet signature prompt. Keep
input amount, tokens, account, chain, and slippage fixed from the confirmed review.

Preparation creates fresh nonce/timestamps immediately before signing. Swaps
expire three minutes from preparation and sign fixed 500 bps oracle protection;
advanced orders use the reviewed calculator values. Never construct protocol
payloads by hand or replace the prepared order after signing.

Submission sends one POST with a thirty-second timeout and returns acceptance
for every order kind. Preserve the exact original signed identity if a response
is lost or times out. A known ID can be checked with
`client.getOrder({ orderId, signal })`; otherwise query configured account history
and match the original signed payload before replacing an intent. Missing status
may reflect indexing delay. The host owns one cancellable polling lifecycle with
bounded retries and visibility rules. Show swap completion only at
`OrderStatus.Completed`, and treat cancelled/expired status according to host UI.

Normal status/history reads never sign or resubmit. A stopped read or wallet-scope
change does not undo a confirmed transaction or establish order failure. Do not
automatically repeat a POST, open another signing prompt, or run a DEX fallback
while acceptance remains unresolved. Keep user inputs after failure and offer a
deliberate retry after reconciliation. `SpotError` codes, `QuoteError`, wallet
errors, and aborts retain their specific contracts.
