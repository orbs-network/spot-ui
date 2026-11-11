# Form Calculation

Inspect the installed form types before using diagnostics. Releases exposing
`form.notReadyReason` identify missing input, a current quote, or USD value. When `isReady` is true but `canSubmit` is false, inspect
`errors.primary`/`errors.all` instead. Explain the relevant action in the host's
UI; do not ask a non-developer to identify raw amounts or SDK prerequisites that
can be discovered from the project.

`calculateOrder` is synchronous and time-independent for the four advanced order types: `OrderType.TWAP`, `LIMIT`, `STOP_LOSS`, and `TAKE_PROFIT`. Swaps use quote amounts and token metadata directly with `client.createSwapExecution(...).run()`; they do not use this form API. An invalid `orderType`, including raw `"SWAP"`, throws `INVALID_ARGUMENT`. Keep the user's editable state under `userInput`; pass token, quote, balance, and product configuration at the top level.

Create one memoized/computed form derivation in the application's existing state layer. Its dependency key should contain only the primitive values represented by `CalculateOrderFormParams`; do not recalculate because an unrelated app/store field changed. Existing components should select only the calculated fields they render rather than subscribing to the entire store.

```ts
import {
  OrderType,
  calculateOrder,
  type CalculateOrderFormParams,
  type CalculatedOrderForm,
} from "@orbs-network/spot-ui";

export function calculateSpotForm(
  params: CalculateOrderFormParams,
): CalculatedOrderForm {
  return calculateOrder(params);
}

const form = calculateSpotForm({
  orderType: OrderType.TWAP,
  inputTokenDecimals: inputToken.decimals,
  outputTokenDecimals: outputToken.decimals,
  quotedOutputAmountRaw,
  inputTokenUsdPrice,
  outputTokenUsdPrice,
  minTradeSizeUsd,
  priceProtectionPercent: 3,
  displayFeePercent,
  inputBalanceRaw,
  userInput: {
    inputAmountUi,
    isMarketOrder,
    tradeCount,
    tradeInterval,
    orderDuration,
    limitPriceUi,
    limitPricePercent,
    triggerPriceUi,
    triggerPricePercent,
    isPriceInverted,
  },
});
```

## Input Contracts

| Input | Required meaning |
| --- | --- |
| `inputTokenDecimals` / `outputTokenDecimals` | Actual token decimals; zero is valid |
| `orderType` | One of the four advanced `OrderType` enum values |
| `quotedOutputAmountRaw` | Raw output-token amount quoted for the complete current input amount; an SDK quote can supply `netAmountOut` for valuation |
| `inputTokenUsdPrice` / `outputTokenUsdPrice` | USD value of exactly one token, expressed as a decimal string |
| `minTradeSizeUsd` | Positive host/partner policy threshold in USD |
| `priceProtectionPercent` | Percentage units; `3` is 3%, not 3 basis points |
| `displayFeePercent` | Optional display-only estimate; it does not collect or subtract a fee |
| `inputBalanceRaw` | Raw integer balance for the selected input token |
| `userInput.inputAmountUi` | User-entered decimal token amount, such as `"1.25"` |
| `tradeInterval` / `orderDuration` | `{ value, unit: TimeUnit }` values controlled by the form |
| price `Ui` fields | Current displayed price direction |
| price `Percent` fields | Percentage relative to the current market price |

The SDK derives advanced-order values, protection, deadlines, and defaults from
the selected order type and its price controls. Swap preview and execution use
the separate quote-only flow in [Swap and Migration](07-swap-and-migration.md).

For missing native-token USD values on a new chain, check the host's wrapped-native mapping and price normalization before changing SDK calculations. See [Chain Integration](06-chain-integration.md) for price-provider and cache checks. A token amount from a router quote and its USD valuation are separate inputs; one can succeed while the other is unavailable.

Do not copy the returned form or its nested calculated values into mutable state. That creates duplicate sources of truth and update loops. Retain only editable inputs and external market data, then derive `CalculatedOrderForm` from them. When the state library supports equality functions, use shallow/field equality for component selectors so equivalent calculated values do not trigger unrelated renders.

## Quote Freshness

Track the amount and token pair that produced the DEX quote. A previously successful output is stale as soon as those inputs change.

```ts
const quoteIsCurrent =
  quote.inputAmountUi === inputAmountUi &&
  quote.inputTokenAddress.toLowerCase() === inputToken.address.toLowerCase() &&
  quote.outputTokenAddress.toLowerCase() === outputToken.address.toLowerCase();

const quotedOutputAmountRaw = quoteIsCurrent
  ? quote.outputAmountRaw
  : undefined;
```

Omit `quotedOutputAmountRaw` while the replacement quote loads. Do not calculate with the old quote or treat it as a standalone one-token price; the SDK derives the market rate from the complete input/output quote pair.

## Authoritative Output

- Use `form.inputAmount`, `form.outputAmount`, `form.trades`, `form.schedule`, `form.triggerPrice`, `form.limitPrice`, `form.minOutputAmountTotal`, `form.tradePrice`, and `form.fees` for UI.
- Display amounts use `{ raw, ui, usd }`. Use `.ui` for token values shown directly and the host formatter for final presentation.
- `limitPrice.raw` and `triggerPrice.raw` are canonical protocol-direction rates. Their `display` objects follow `form.isInverted`.
- Use `invertPriceInput(value)` when the user flips price direction; do not merely swap the label while retaining the old typed number.
- `form.orderType` is the high-level advanced order type; `form.values.orderVariant` is its detailed protocol mode.
- Use `form.values` only for execution/auditing. It intentionally contains raw protocol values and no UI/USD fields.
- Render `form.errors.primary` near the submit control and field-specific entries such as `form.errors.trades` or `form.errors.limitPrice` at their fields.
- Translate `InputError.type` in the host; use `error.args` for localized interpolation.
- Gate submit with `form.canSubmit`. `form.isReady` means the minimum market inputs exist, not that validation passed.
- Bind these values into the app's existing order-form, settings, review, progress, and history components. Do not create Spot-specific replacements for controls the app already has.

## Controlled State

Persist values the user explicitly changed. In particular, keep an explicit `tradeCount` when the input amount changes. If the next calculation returns `InputErrors.MAX_TRADES`, show it and let the user choose a valid value. Silent clamping makes the visible form diverge from user intent.

When a field has never been edited, it may remain `undefined` so the SDK supplies the default for that order type. Once the host adopts a returned default into editable UI state, treat subsequent user edits as controlled values.
