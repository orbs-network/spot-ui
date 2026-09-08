# Form Calculation

`calculateOrderForm` is synchronous, time-independent, and the only public order-calculation entry point. Keep the user's editable state under `userInput`; pass token, quote, balance, and product configuration at the top level.

Create one memoized/computed form derivation in the application's existing state layer. Its dependency key should contain only the primitive values represented by `CalculateOrderFormParams`; do not recalculate because an unrelated app/store field changed. Existing components should select only the calculated fields they render rather than subscribing to the entire store.

```ts
import {
  Module,
  calculateOrderForm,
  type CalculateOrderFormParams,
  type CalculatedOrderForm,
} from "@orbs-network/spot-ui";

export function calculateSpotForm(
  params: CalculateOrderFormParams,
): CalculatedOrderForm {
  return calculateOrderForm(params);
}

const form = calculateSpotForm({
  module: Module.TWAP,
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
| `quotedOutputAmountRaw` | Raw output-token amount quoted for the complete current input amount |
| `inputTokenUsdPrice` / `outputTokenUsdPrice` | USD value of exactly one token, expressed as a decimal string |
| `minTradeSizeUsd` | Positive host/partner policy threshold in USD |
| `priceProtectionPercent` | Percentage units; `3` is 3%, not 3 basis points |
| `displayFeePercent` | Optional display-only estimate; it does not collect or subtract a fee |
| `inputBalanceRaw` | Raw integer balance for the selected input token |
| `userInput.inputAmountUi` | User-entered decimal token amount, such as `"1.25"` |
| `tradeInterval` / `orderDuration` | `{ value, unit: TimeUnit }` values controlled by the form |
| price `Ui` fields | Current displayed price direction |
| price `Percent` fields | Percentage relative to the current market price |

Do not precompute raw order amounts, per-trade values, slippage, deadlines, or defaults in the host. The SDK derives them consistently for display and execution.

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
- Use `form.values` only for execution/auditing. It intentionally contains raw protocol values and no UI/USD fields.
- Render `form.errors.primary` near the submit control and field-specific entries such as `form.errors.trades` or `form.errors.limitPrice` at their fields.
- Translate `InputError.type` in the host; use `error.args` for localized interpolation.
- Gate submit with `form.canSubmit`. `form.isReady` means the minimum market inputs exist, not that validation passed.
- Bind these values into the app's existing order-form, settings, review, progress, and history components. Do not create Spot-specific replacements for controls the app already has.

## Controlled State

Persist values the user explicitly changed. In particular, keep an explicit `tradeCount` when the input amount changes. If the next calculation returns `InputErrors.MAX_TRADES`, show it and let the user choose a valid value. Silent clamping makes the visible form diverge from user intent.

When a field has never been edited, it may remain `undefined` so the SDK supplies the module default. Once the host adopts a returned default into editable UI state, treat subsequent user edits as controlled values.
