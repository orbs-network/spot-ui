# Spot SDK

`@orbs-network/spot-ui` is the framework-agnostic Spot SDK. Use it from Vue,
Angular, Svelte, React, vanilla JavaScript, or a server-side TypeScript
application. It has no React dependency.

## Complete form calculation

Use `calculateOrderForm` as the primary calculation API. Pass the DEX-owned
form state and market data; the SDK returns one authoritative model for both
display and order execution.

```ts
import {
  calculateOrderForm,
  Module,
  toAmountWei,
} from "@orbs-network/spot-ui";

const form = calculateOrderForm({
  module: Module.TWAP,
  isMarketOrder: true,

  // Raw input-token amount.
  inputAmountWei: toAmountWei(typedInputAmount, inputToken.decimals),
  inputTokenDecimals: inputToken.decimals,
  outputTokenDecimals: outputToken.decimals,

  // Raw output-token amount quoted for the complete input amount.
  quotedOutputAmount,
  inputUsdPrice,
  outputUsdPrice,
  minTradeSizeUsd,

  // Optional user overrides. Omit them to use SDK defaults.
  trades,
  fillDelay,
  duration,
  limitPrice,
  limitPricePercent,
  triggerPrice,
  triggerPricePercent,
  isInverted,

  priceProtection: 3, // 3%
  displayFeePercent,
  inputBalance, // raw input-token units
});
```

The result includes:

```ts
form.inputAmount; // raw, UI, and USD input amounts
form.outputAmount; // raw, UI, and USD output amounts
form.isInverted; // current price-display direction
form.trades; // trade count and structured per-trade input/output amounts
form.schedule; // resolved fill delay, duration, milliseconds, and errors
form.triggerPrice; // canonical raw value, display values, defaults, and validation
form.limitPrice; // canonical raw value, display values, defaults, and validation
form.minOutputAmountTotal; // raw, UI, and USD minimum total output
form.tradePrice; // raw, UI, and USD execution price
form.fees; // raw, UI, USD, and percentage fee values
form.values; // raw execution values used to build the order
form.errors; // structured errors, ordered list, and primary error
form.isReady;
form.canSubmit;
```

Display amounts use `{ raw, ui, usd }` objects and
trade-direction terminology. For `limitPrice` and `triggerPrice`, `amount`
is now named `raw` and remains the canonical protocol rate, while
`display.raw`, `display.ui`, and `display.usd` follow the current `isInverted`
display direction. `form.values` intentionally contains no `UI` or `Usd`
fields. Integration-facing calculation and client APIs use input/output names.
Existing source/destination names remain only on low-level protocol helpers and
protocol response models such as `Order`.

This calculation is synchronous and does not fetch configuration. Optional
fields can be passed while the user edits the form; the result always contains
the currently derivable values. `inputAmountWei` is the single input amount
input; the SDK derives its UI and USD representations from the token decimals
and USD price. Integrations that already have a per-input-token raw rate can
pass `marketPrice` instead of `quotedOutputAmount`.

`marketPrice` and `quotedOutputAmount` use different units:

- `marketPrice` is the raw output-token amount for exactly one whole input
  token (for example, a 2 USDC rate with 6 output decimals is `"2000000"`);
- `quotedOutputAmount` is the raw output-token amount quoted for the complete
  `inputAmountWei`.

Pass one or the other. When `quotedOutputAmount` is supplied, the SDK derives
the per-token rate using `inputAmountWei` and `inputTokenDecimals`.

`calculateOrderForm` is time-independent. Recalculate only when its form or
market inputs change. `prepareOrder` stamps the current start and deadline from
the calculated duration immediately before signing; those exact timestamps are
returned on `preparedOrder.values`.

`calculateOrderForm` is the only public order-calculation entry point. Its
smaller calculators are internal implementation details, so every integration
uses the same defaults, validation, and derived-value rules.

`minTradeSizeUsd` is a positive USD threshold owned by the integrating DEX.
Use the minimum approved for that partner/product; the SDK deliberately does
not guess protocol policy. `priceProtection` is a percentage, so `3` means 3%
(300 basis points), not 3 bps. `displayFeePercent` is also a percentage, but it
only calculates `form.fees` for display. It does not collect or subtract a fee;
collection must be configured by the partner/backend.

## Client and order submission

`createClient` loads RePermit configuration and returns a new initialized
client. It does not retain a module-level cache; the hosting application owns
client reuse, request deduplication, and refresh policy. Initialization rejects
chain mismatches and malformed or zero RePermit and exchange-adapter addresses
before exposing approval or cancellation values.

### Migrating from 1.x

Version 2 uses `calculateOrderForm` as the single calculation entry point and
an initialized `createClient` for order preparation, signing, submission,
cancellation requests, and configured history. Legacy low-level order-building
and submission exports were removed so integrations cannot bypass the shared
validated form and client configuration.

```ts
import {
  calculateOrderForm,
  createClient,
  ensureWrappedToken,
  getExplorerUrl,
  isNativeAddress,
  isTxRejected,
  Module,
  Partners,
  toAmountWei,
} from "@orbs-network/spot-ui";

const client = await createClient(Partners.Quick, 137);

const form = calculateOrderForm({
  module: Module.TWAP,
  isMarketOrder: true,
  inputAmountWei: toAmountWei(typedInputAmount, inputToken.decimals),
  inputTokenDecimals: inputToken.decimals,
  outputTokenDecimals: outputToken.decimals,
  quotedOutputAmount,
  inputUsdPrice,
  outputUsdPrice,
  minTradeSizeUsd,
  trades,
  fillDelay,
  duration,
  limitPrice,
  limitPricePercent,
  triggerPrice,
  triggerPricePercent,
  isInverted,
  priceProtection: 3,
  displayFeePercent,
  inputBalance,
});

const amount = form.inputAmount.raw;
const approvalToken = ensureWrappedToken(inputToken, client.chainId);
const approvalRequest = {
  tokenAddress: approvalToken.address,
  amount,
  spenderAddress: client.spenderAddress,
};
const { tokenAddress, spenderAddress } = approvalRequest;
const hasAllowance = async () =>
  BigInt(await wallet.getAllowance({ tokenAddress, spenderAddress })) >=
  BigInt(amount);

try {
  const approvalRequired = !(await hasAllowance());

  // The signed order spends wrapped native tokens, so wrap before approval.
  if (isNativeAddress(inputToken.address)) {
    await wallet.wrapNativeToken(amount);
  }

  if (approvalRequired) {
    await wallet.approveToken(approvalRequest);

    // Allow RPC allowance state to catch up after the confirmed approval.
    for (let attempt = 0; attempt < 3 && !(await hasAllowance()); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    if (!(await hasAllowance())) throw new Error("Approval was not observed");
  }

  const preparedOrder = client.prepareOrder({
    form,
    inputTokenAddress: inputToken.address,
    outputTokenAddress: outputToken.address,
    swapperAddress: account,
  });
  const signature = await client.signOrder(
    preparedOrder,
    ({ signerAddress, typedData }) =>
      wallet.signTypedData(typedData, signerAddress),
  );
  const order = await client.submitOrder(preparedOrder, signature);
  console.info("Order submitted", order, getExplorerUrl(order.txHash, 137));
} catch (error) {
  if (isTxRejected(error)) console.info("The wallet request was rejected");
  else throw error;
}
```

`signOrder` only invokes the supplied wallet signer and returns its signature.
It never submits the order. `submitOrder` is the separate network operation.
The complete sequence is allowance check, native wrapping when required,
approval when required, allowance verification, signing, and submission.

`prepareOrder` does not recalculate form amounts, prices, trades, or schedules,
and it rejects a form whose `canSubmit` value is `false`.
It stamps the current start and deadline from the calculated duration, then
converts the supplied form into RePermit, signing, and approval data. The
returned `PreparedOrder` contains:

- `form`, the complete calculated form snapshot shown to the user;
- `values`, `form.values` plus the exact preparation-time timestamps used by the
  signed order;
- `order`, the resulting protocol order;
- `signingRequest`, containing a framework-neutral `signerAddress` and
  `typedData` EIP-712 payload;
- `approvalRequest`, ready for the wallet approval adapter.

Each `prepareOrder` call assigns a fresh monotonic nonce within that client
instance, so two orders prepared by the same instance cannot reuse a nonce. A
new client instance starts again from the current wall-clock value. The call
also assigns fresh `currentTimeMillis` and `deadlineMillis` values for that
submission attempt. Call it after wrapping and approval, immediately before
signing, so those time-dependent values remain fresh.

The signing request does not depend on Viem, Wagmi, Ethers, or another wallet
library. Viem adapters can spread `typedData` and map `signerAddress` to
`account`; Ethers adapters can pass `typedData.domain`, `typedData.types`, and
`typedData.message` to the signer.

`minTradeSizeUsd` is required calculation input owned by the integrating
application. The client does not read or infer it from partner configuration.

The complete form calculation remains a package-level function because it does
not depend on partner or chain configuration. The client exposes only
configured operations:

```ts
calculateOrderForm(formParams);
client.getCancelOrderRequest(order);
client.getAccountOrders({ account });
```

Omitting `page` fetches every available history page. To fetch one page, pass
a zero-based `page` and an optional positive `limit`. Use `order.historyKey`
as the stable list/cache identity: legacy v1 numeric IDs can repeat across TWAP
contract deployments, while `order.id` remains the protocol order ID used for
display and cancellation.

The normalized history model keeps protocol response names (`src`/`dst` and
fill `in`/`out`) because it combines v1 and v2 payloads. Form and calculation
inputs use `input`/`output`. `OrderType` maps the selected module and execution
mode into `LIMIT`, `TWAP_LIMIT`, `TWAP_MARKET`, `STOP_LOSS_LIMIT`,
`STOP_LOSS_MARKET`, `TAKE_PROFIT_LIMIT`, or `TAKE_PROFIT_MARKET`.
`OrderFilter` provides `ALL`, `OPEN`, `COMPLETED`, `CANCELLED`, and `EXPIRED`
history filter values.

There is no authoritative single-order endpoint in the current service API.
To track an order, call `client.getAccountOrders({ account, page, limit })` on
the host's polling schedule and find it by `historyKey`. Supplying a page and
limit avoids fetching every history page when only a recent status window is
needed.

Use `client.spenderAddress` for allowance reads and approvals. Normalize a
native input with `ensureWrappedToken`, and approve `form.inputAmount.raw`.
The `approvalRequest` returned by `prepareOrder` records the same normalized
token, spender, and exact amount used by the signed order.

Native token addresses are normalized to the chain's wrapped token for order
input and approval requests. Protocol configuration fetching, RePermit order
construction, submission, cancellation request construction, and configured
history access are intentionally exposed only through `SpotClient`. This keeps
partner- and chain-derived values on one authoritative path.

Framework-neutral helpers `ensureWrappedToken`, `shouldWrapOnly`,
`shouldUnwrapOnly`, `isTxRejected`, and `getExplorerUrl` are also exported from
`spot-ui`; Vue, Angular, Svelte, and server integrations do not need to copy
React-specific utility code.

Every `createClient` call performs a new configuration request. Cache the
returned promise or client in the host application's normal data layer when it
should be reused. `spot-react` keeps one provider-scoped client resource keyed
by partner and chain; it does not require React Query. Vue, Angular, Svelte,
vanilla JavaScript, and server applications should apply their own lifecycle
and refresh policy.

```ts
// Illustrative host-owned cache; use the host framework's data layer where possible.
const clientPromise = createClient(Partners.Quick, 137);
const client = await clientPromise;
```
