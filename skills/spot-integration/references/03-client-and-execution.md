# Client and Execution

## Client resource

Reuse `createClient(partner, chainId, options?)` through the host's existing
resource/cache pattern. The client owns validated protocol configuration,
spender, signing data, history, and cancellation requests. Partner/chain selection,
wrapped-native metadata, wallet state, and UI belong to the host. Failed client
initialization remains retryable. Do not mirror protocol configuration into a
second host store or create another client for each history poll.

Read a token's USD unit price with `client.getTokenUsd({ tokenAddress, signal })`,
or `getTokenUsd({ tokenAddress, chainId, signal, apiUrl? })` without a client.
The decimal string is USD per whole token, normalized from the service's
18-decimal raw price, independently of token decimals. Use decimal arithmetic
when multiplying by input units; do not use the rounded display price.
Within the same loaded SDK instance, standalone/client price reads and implicit
`getSwapSlippage` reads share pending requests and a 128-entry in-memory LRU cache
keyed by normalized endpoint, chain, and lowercase token address. Successful
prices stay fresh for 10 minutes from the response. Failed or invalid responses
are not cached; there is no persistence or timer polling. A caller's abort signal
stops only its wait; the shared lookup continues for other callers and cache
warming. Direct `getTokenUsd` calls throw on failed lookups rather than returning
zero; the host owns fallback policy for those calls. Price reads do not change
quote slippage.

Await the resolved policy before displaying slippage or requesting a quote:

```ts
const policy = await client.getSwapSlippage({
  tokenAddress: inToken, typedInputAmount,
  slippage: dexSlippage,
  isCustom: isUserCustomSlippage,
  signal,
});
const quote = await client.getQuote({
  inToken, outToken, inAmount: inputAmountRaw, user: account,
  slippage: policy.slippagePercent, signal,
});
```

Pass the user's whole-token decimal string directly as `typedInputAmount`
(for example, `"50.25"`), without converting through JavaScript `Number`. The helper
needs no token decimals. Quote `inAmount` remains the integer base-unit amount.

Show `policy.slippagePercent` before quoting. Both `slippage` and `isCustom` are
required. Slippage must round to at least one basis point and must not exceed
50%; zero is rejected. With `isCustom: false`,
`slippage` is the DEX baseline: known positive input value up to $100 applies a
1% floor without lowering a higher baseline, and larger trades retain the
baseline. With `isCustom: true`, the supplied percentage wins without fetching
or waiting for pricing. Hosts that treat empty
or zero settings as automatic should pass their positive DEX default as the
baseline, as the web demo does. Positive automatic input waits at most 1,500 ms
for the supplied `inputTokenUsd` string/promise or a shared `getTokenUsd` lookup
when omitted.
Supplied overrides are not imported into that cache; their freshness belongs to
the caller. Missing, failed, invalid, zero, or timed-out pricing returns the
supplied DEX baseline with undefined `inputAmountUsd`, allowing quoting to proceed.
Shared lookups can finish in the background and warm the cache. This
fallback belongs to `getSwapSlippage`; direct `getTokenUsd` calls still throw.
Missing, empty, `"."`, or zero input returns the baseline immediately without
fetching or waiting for a supplied price promise; rejected supplied promises are
still observed. Invalid token, chain, amount, and slippage inputs still reject;
caller cancellation propagates. Partial decimals such as `".5"` and `"1."` are
accepted. The helper returns `slippagePercent`, integer `slippageBps`, and optional `inputAmountUsd`.
The USD value is the exact decimal-string input total when automatic pricing
knows the amount; it is undefined for custom slippage or unavailable input/pricing.
Standalone
`getSwapSlippage` also requires `chainId` and accepts `apiUrl`; the client supplies
its captured chain and endpoint. Slippage inputs are percentages rounded to
basis points, and malformed inputs throw `INVALID_ARGUMENT`.
After quoting, the displayed percentage comes from
`quote.request.slippage`, then `prepared.quote.request.slippage` at signing.
Never recompute a different display value from settings beside the accepted quote.
For output entry, the web demo classifies automatic slippage once using the target
output token and its approximate USD value. The price helper's contract is unchanged.
Quote the actual token pair with exactly one positive base-unit `inAmount` or
`outAmount`. Each call makes one server request, without reversing the pair or
searching client-side. The SDK maps server `amountIn` to `quote.request.inAmount`;
output targets remain in `quote.requestedOutAmount` and must be covered by the
server minimum. Legacy `dexMinAmountOut` is an input-only local threshold, never
sent to the server; positive thresholds are rejected for output-target quotes.
Opening review reuses the current quote without an additional quote request.
That quote supplies the reviewed amounts, percentage, and unchanged protected
minimum. Freeze the resolved `quote.request.inAmount` before wallet work. The host owns quote
state, cancellation, and refreshes; the SDK starts no searches or polling.

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
quotes, invalid receipt times, and future receipt times refresh the resolved fixed
input. A refreshed protected minimum below the reviewed floor rejects with
`QUOTE_MINIMUM_DECREASED`; otherwise the selected quote becomes the prepared order.
Estimates may remain live through wrap/approval, then freeze displayed output and
minimum from `prepared.quote` before opening the wallet signature prompt. Keep
input amount, tokens, account, chain, and slippage fixed from the confirmed review.

Stale output-target quotes refresh the resolved fixed input, never repeat the
target calculation or increase spending. A decreased minimum requires fresh review.
Preparation creates fresh nonce/timestamps immediately before signing. Swaps
expire three minutes from preparation and sign independent 500 bps oracle price
protection. DEX quote tolerance is enforced by the unchanged quote minimum in
signed `witness.output.limit`; it does not set `witness.slippage`. Advanced orders
use the reviewed calculator values. Never construct protocol
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
