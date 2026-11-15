# Client and Execution

## Client resource

Reuse `createClient(partner, chainId, options?)` through the host's existing
resource/cache pattern. The client owns validated protocol configuration,
spender, signing data, history, and cancellation requests. Partner/chain selection,
wrapped-native metadata, wallet state, and UI belong to the host. Failed client
initialization remains retryable. Do not mirror protocol configuration into a
second host store or create another client for each history poll.

Read a token's USD unit price with standalone
`getTokenUsd({ tokenAddress, chainId, cacheSeconds: 30, signal })`. It needs no client or
configuration load. Supply the active chain explicitly; `cacheSeconds` and
`signal` are optional.
Prices always use the default production service, independently of client
`apiUrl` or the web demo's `devApi` flag. The function accepts no endpoint option
and does not infer configuration from browser or environment settings.
The decimal string is USD per whole token, normalized from the service's
18-decimal raw price, independently of token decimals. Use decimal arithmetic
when multiplying by input units; do not use the rounded display price.
Within the same loaded SDK instance, `getTokenUsd` calls share pending requests
and a 128-entry in-memory LRU cache keyed by chain and lowercase token.
There is no persistence or timer polling.

`cacheSeconds` is an optional nonnegative safe integer in seconds, defaulting
to `30`. Policies share the same chain/token cache and pending work. Each
call checks freshness against the successful response time; a shorter policy
cannot reuse an older price retained for a longer policy.
A longer policy may extend retention from that original response time, without
restarting the clock on reads. `cacheSeconds: 0` refreshes completed prices but
still shares an in-flight lookup for the same chain/token. Invalid values throw
`INVALID_ARGUMENT`; failures are not cached.

A caller's abort signal stops only its wait while
shared pricing can finish and warm the cache. Direct `getTokenUsd` throws for
failed or malformed responses; the host owns fallback policy for those calls.

Core preparation exposes `Eip712TypedData`, `OrderSigningRequest`, and
`ApprovalRequest` so direct DEX integrations can use their existing wallet code.
The React adapter's `WalletInteractions`, `AllowanceRequest`, and
`WalletInteractionError` are exported only by `@orbs-network/spot-react`.
Core `SpotErrorCode` describes protocol/preparation/submission/read failures;
handle host wallet errors through the host's own wallet contract.

Keep the client promise and host attempt state in non-reactive service fields or
focused host state. Subscribe UI only to the progress fields it renders. The
[advanced-order example](../assets/spot-advanced-orders-example.ts) illustrates the
host-owned calculation, wallet, submission, and cancellation boundary.

## Inline wallet signing

For a host that already controls wallet steps, use `client.spenderAddress` for
ERC-20 allowance reads and approvals, then prepare and sign directly. Confirm
wrapping and enough allowance for the exact input before preparation. Neither
preparation nor direct submission performs wallet checks or sends transactions.

```ts
const prepared = client.prepareOrder({
  form, account, inputTokenAddress, outputTokenAddress,
});
const { signerAddress, typedData } = prepared.signingRequest;
const signature = await walletClient.signTypedData({
  ...typedData,
  account: signerAddress,
});
const acceptedOrder = await client.submitOrder(prepared.order, signature, { signal });
```

`PrepareOrderParams` and `SubmitOrderOptions` are public types. These methods
need no `walletInteractions`. `signingRequest.typedData` exposes the EIP-712
`domain`, `types`, `primaryType`, and `message`; `approvalRequest` exposes the
token, spender, exact input, and suggested approval cap. Prepare after confirmed
wallet prerequisites, immediately before signing, to obtain a fresh nonce and
timestamps from the reviewed calculator values.

Forward the data unchanged to the host signer, then submit that exact
`prepared.order` with the original hex signature. Validate the current wallet
account/chain and preserve the reviewed intent through both calls. `submitOrder` resolves at acceptance. Read known IDs with
`client.getOrder({ orderId: acceptedOrder.id, signal })` to check fills. The host
owns further polling and duplicate-submission guards; do not automatically retry
an uncertain POST or create another signed intent before reconciling it in history.

## Host wallet prerequisites and progress

The core SDK takes no wallet adapter and has no execution session. The DEX owns
its allowance reads, native wrapping, approval transactions, receipt confirmation,
wallet scope checks, progress, duplicate guard, retries, and status polling.
Use the host's existing wallet/read services instead of introducing a second
wallet abstraction for Spot.

1. Capture the confirmed form, account, chain, token pair, and raw input under one host execution lock.
2. Read allowance for the ERC-20 input and `client.spenderAddress` before the wrap prompt. Keep the review button disabled with its loader while this read is pending.
3. Wrap native input only when needed, using the host-configured wrapped token and confirmed receipt. Protocol quotes/orders always use the wrapped ERC-20 address.
4. Approve only when allowance is below the exact reviewed input. Wait for a successful receipt and read allowance again. If a wallet lowers the cap, stop or retry according to host policy before signing. Read failures and wallet rejections stop the attempt.
5. Prepare after those confirmed prerequisites. Show the returned order unchanged before signing, then forward `signingRequest.typedData` and `signerAddress` to the host signer.
6. Keep the exact prepared order, original signature, confirmed hashes, and accepted/latest order in host state for progress and recovery. Submit once with `client.submitOrder()`.

`ApprovalRequest.amount` is the required input in integer base units.
`approvalAmount` is only a suggested cap, defaulting to maximum uint256; the host
can approve the exact amount or apply its own policy. A confirmed approval hash
alone does not prove enough allowance. Do not split `{ v, r, s }`, rewrite recovery
bytes, or normalize the signature returned by the wallet.

Viem signers can spread the returned typed data and set `account: signerAddress`.
Ethers signers pass the same domain, struct types, and message through the host's
supported signing API. Use `client.getCancelOrderRequest()` separately for
on-chain cancellation; aborting local work cannot cancel an accepted order.

## Form freshness and failure handling

Require a current market quote when calculating the reviewed form. Capture the
form and tokens together; later edits must not change an in-flight attempt.
`client.prepareOrder()` uses those calculator values and assigns fresh nonce,
start, and deadline data after confirmed wallet prerequisites. Do not construct
protocol payloads manually or replace the prepared order after signing.

Submission sends one POST with a thirty-second timeout and returns acceptance
for advanced orders. Preserve the exact original signed identity if a response
is lost or times out. A known ID can be checked with
`client.getOrder({ orderId, signal })`; otherwise query configured account history
and match the original signed payload before replacing an intent. Missing status
may reflect indexing delay. The host owns one cancellable polling lifecycle with
bounded retries and visibility rules. Keep order acceptance distinct from fill completion. Render `OrderStatus`
and fills according to the requested advanced-order/history UI.

Normal status/history reads never sign or resubmit. A stopped read or wallet-scope
change does not undo a confirmed transaction or establish order failure. Do not
automatically repeat a POST, open another signing prompt, or run a DEX fallback
while acceptance remains unresolved. Keep user inputs after failure and offer a
deliberate retry after reconciliation. `SpotError` codes, `QuoteError`, wallet
errors, and aborts retain their specific contracts.
