# Legacy API Map

Use this map to inspect an existing Liquidity Hub adapter. Confirm the host's installed declarations: copied adapters and older package releases may differ from the legacy package retained in this monorepo. The current execution contract is documented in the sibling [Spot swap flow](../../spot-swap-integration/references/02-swap-flow.md).

## Package, client, and host services

| Liquidity Hub | Spot migration |
| --- | --- |
| `@orbs-network/liquidity-hub-sdk` | `@orbs-network/spot-ui`, or public core re-exports from an existing `@orbs-network/spot-react` install. No swap provider is required. |
| Synchronous `createClient({ partner, chainId, ... })` / `LiquidityHubClient` | `await createClient(partner, chainId, options)` / `SpotClient`; reuse a host-managed resource for the actual partner/chain and retry rejected initialization. |
| Free-form normalized partner string | Verify a supported `Partners` value and backend activation; do not invent a mapping or substitute another DEX. |
| `blockAnalytics` | `disableAnalytics` on client creation; use `client.getQuote` so quote reporting follows that policy. |
| Hub `apiUrl`, chain-specific defaults, `lhOverrideApiUrl` | Spot's default order service, or an explicitly trusted Spot `apiUrl`. Spot does not read legacy storage or page parameters. A custom base URL must be absolute HTTP(S), without credentials, query, or fragment; a legacy relative proxy is incompatible as-is. |
| Global `permit2Address` | `client.spenderAddress`, loaded from validated Spot configuration. Reread allowance for this spender; a Permit2 approval cannot be reused. |
| Exported native sentinels / `isNativeAddress` | Host native-token detection and verified chain-specific wrapped token metadata. Do not import private Spot utilities or guess wrapped addresses. |
| `maxUint256`, debounce, refresh constants | Use the host's existing wallet/numeric/timing policies. `approvalRequest.approvalAmount` is a suggested sufficient cap, not a mandatory approval amount. |

The core client has no wallet adapter or execution-session API. Keep wrapping, allowance reads, approval, successful receipt confirmation, scope checks, duplicate prevention, and progress in the existing host services. Do not add `AdvancedOrdersProvider` to replace a legacy swap hook.

## Quote request and response

| Liquidity Hub | Spot migration |
| --- | --- |
| `getQuote({ fromToken, toToken, account, ... })` | `client.getQuote({ inToken, outToken, user, ... })`. `user` is required for quotes; pass the actual signing/recipient account separately to preparation. |
| `inAmount` | A positive integer base-unit string. Alternatively pass one positive `outAmount`, never both. The server resolves output targets into fixed `quote.request.inAmount`; retain the target through `requestedOutAmount`. |
| `slippage` | Remains percentage units: `0.5` means 0.5%. Do not convert it to a fraction or basis points before quoting. |
| `dexMinAmountOut` | Optional input-quote comparison threshold in output base units, checked locally and never sent as a wire field. Omitted, `"-1"`, or `"0"` adds no positive threshold. Output-target requests accept only omitted or `"-1"`, including rejection of `"0"`. |
| `timeout`, `disabled`, `inAmountUsd` request options | No corresponding quote inputs. Gate requests and implement cancellation/timeouts in the host; keep valuation separate from executable raw amounts. |
| Top-level quote `inToken`, `outToken`, `inAmount`, `user`, `slippage`, `partner` | Corresponding `quote.request.*` fields. Include chain, partner, pair, amount/direction, quote user, slippage, and competing minimum in cache identity. |
| `quote.outAmount` and gas-adjusted output fields | Inspect each consumer's purpose. Spot exposes raw `amountOut`, net `netAmountOut`, and protected `minimumAmountOut`, plus `feeAmount`. Do not mechanically rename `userMinOutAmountWithGas`, `outAmountWsMinusGas`, or `outAmountWS`; preserve the DEX's gas/fee policy explicitly. |
| `quote.minAmountOut` | `quote.minimumAmountOut`; use unchanged for review, route comparison, and signed minimum. Slippage is already reflected. |
| `quote.timestamp` | `quote.receivedAt`, a local receipt time in milliseconds. |
| `isFreshQuote(quote, maxAgeSeconds)` | Public `isQuoteFresh(quote, maxAgeMillis)` for host display policy. The units change from seconds to milliseconds and the Spot boundary is inclusive. Preparation independently applies its twenty-second reuse rule. |
| `isLiquidityHubBetter(quote, dexMinAmountOut)` | Host comparison of protected minima using exact integer arithmetic for equivalent routes. Preserve strict comparison/tie behavior and gas/fee policy deliberately. |
| `quote.eip712`, `permitData`, `serializedOrder`, `sessionId`, `qs` | No reusable Spot signing/submission fields. Fetch a Spot quote and prepare a fresh Spot order after wallet prerequisites. |

`getQuote({ outAmount })` resolves a requested output into a fixed spend before execution. It does not mean the DEX router supports arbitrary exact-output execution: the public `isSwapSupported` helper still rejects `tradeType: "exact-output"` and alternate recipients. Preserve the host's supported-route gating.

Do not add a new quote request just because review opens. Capture the reviewed quote and fixed input, then let preparation enforce freshness. During preparation, an old, invalid-time, or future-time quote refreshes the resolved fixed input without increasing spending. A lower protected minimum rejects with `QUOTE_MINIMUM_DECREASED`; require fresh review. Display and freeze the final `prepared.quote` before signing.

## Execution, completion, and recovery

| Liquidity Hub | Spot migration |
| --- | --- |
| Sign `quote.eip712` | After confirmed wrapping and sufficient approval, call `client.prepareSwap({ quote, account, signal })`; sign its `signingRequest.typedData` unchanged for `signerAddress`. |
| Permit2 signature and serialized quote | Fresh RePermit order and the wallet's original hex signature. Never reuse, split, normalize, or reconstruct the old payload/signature. |
| `sdk.swap(quote, signature, dexRouterData)` | `client.submitSwap(prepared.order, originalSignature, { signal })`. Submit the exact prepared order; the SDK accepts no wallet callbacks or DEX fallback data. |
| Internal legacy duplicate guard | Host guard spanning wallet steps, submission, settlement, and any uncertain acceptance. Keep attempt state outside the button/modal lifetime. |
| Returned transaction hash, followed by receipt waiting | Accepted `Order`, followed by host-owned `client.getOrder({ orderId: accepted.id, signal })` polling. Submission does not imply a fill. |
| Session-based swap-status polling | Order-ID lookups; tolerate an initially missing result while indexing catches up. The accepted ID is not an EVM transaction hash. |
| Swap success notification / explorer link | Success at `OrderStatus.Completed`. Use actual available `fills[].txHash` or order transaction metadata for explorer links; keep open, expired, and cancelled states distinct. |
| Legacy retry or backend DEX fallback | Keep host route selection, but reconcile unknown acceptance before another POST, signature, or fallback route. Aborting local work does not cancel an order or undo a transaction. |
| Recovery from a legacy `sessionId` or hash | Preserve it under the legacy flow when needed for an in-flight attempt. New Spot attempts retain their prepared order/signature and accepted/latest order. Never convert one protocol's identity into the other's. |

A Spot swap signs one limit trade with a three-minute lifetime assigned at preparation. The SDK converts the reviewed DEX percentage to integer basis points in `witness.slippage` (`0.5` percent becomes `50` bps) and preserves the quoted minimum unchanged in `witness.output.limit`. Sign the prepared payload unchanged. Prepare immediately before signing so approval confirmations do not consume the order's signed lifetime.

For a lost submission response, retain the exact original prepared order and signature and use configured account history to reconcile that signed identity. Matching only pair, amount, or time can confuse distinct orders. Status/history reads do not submit or sign. Preserve successful prerequisite hashes immediately, even if a receipt arrives after an account/chain change.

## Errors and analytics

| Liquidity Hub | Spot migration |
| --- | --- |
| Matching text such as `no liquidity`, `tns`, or `ldv` | Inspect public `QuoteError.kind`, `status`, `code`, and `retryable`; keep abort cancellation separate. Use `SpotError.code`, `status`, and `serviceCode` for configuration/preparation/submission/read failures. Host wallet errors stay in the wallet layer. |
| `sdk.analytics.wrap`, `.approval`, `.signature`, `.swap`, `.dexSwap` | No public `client.analytics` replacement. The core reports its configuration, quote, preparation, and submission; direct hosts retain wallet, settlement, and DEX-route telemetry without duplicating SDK events. Never log signatures or full signed payloads. |

Keep the host's retry bounds and user-facing messages, adapting them to the new lifecycle. A polling failure is recoverable tracking state, and a submission timeout can leave acceptance uncertain; neither justifies declaring a swap failed and immediately executing another route.
