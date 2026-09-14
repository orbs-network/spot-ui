# Default Tooltip Text

Every Spot tooltip must have meaningful default text. Use the English copy below from `apps/web/lib/spot-translations.json`, with the host DEX's tooltip component and i18n system. Register these strings as English defaults and fall back to them when a translation is missing or empty; never display a translation key, placeholder, or empty tooltip. Reuse the same defaults in the form, order preview, and submit review.

## Copy

| Key | Default text |
| --- | --- |
| `expirationTooltip` | This is the date and time marking the end of the period which you have selected for your order to be executed. |
| `tradeSizeTooltip` | The number of input tokens that will be removed from your balance and swapped for the output token in each individual trade. |
| `totalTradesTooltip` | The total number of individual trades that will be scheduled as part of your order. Note that in limit orders, not all trades that are scheduled will be executed. |
| `minDstAmountTooltip` | This is the minimum number of tokens that may be received. NOTE: This minimum only refers to executed trades. Some trades may not be executed if the limit price is higher than the available market prices and your order may only be partially filled. |
| `limitPriceTooltip` | Trades will only execute if the available market price is better than the limit price, potentially resulting in partial fills or orders remaining unfilled upon expiration. |
| `maxDurationTooltip` | This is the time period during which the order will be active. Please note that orders may be completed earlier than this time, partially filled, or remain unfilled based on the specified parameters. |
| `tradeIntervalTooltip` | The estimated time that will elapse between each trade in your order. Note that as this time includes an allowance of two minutes for bidder auction and block settlement, which cannot be predicted exactly, actual time may vary. |
| `triggerPriceTooltip` | The price at which the order will be executed. If the market price is higher than the trigger price, the order will be executed at the market price. |
| `stopLossTooltip` | The trigger price at which your stop-loss order will be activated. |
| `takeProfitTooltip` | The trigger price at which your take-profit order will be activated. |
| `stopLossLimitPriceTooltip` | The stop loss order will execute at the specified limit price or better, once the stop price is triggered. |
| `stopLossDurationTooltip` | This is the time period during which the order will be active. Please note that orders may be completed earlier than this time, or remain unfilled based on the specified parameters. |

Additional defaults from `apps/web/components/settings-modal.tsx` and `apps/web/components/spot/orders.tsx`:

| UI | Default text |
| --- | --- |
| Price Protection | The protocol uses an oracle price to help protect users from unfavorable executions. If the execution price is worse than the oracle price by more than the allowed percentage, the transaction will not be executed. |
| Order history button | View order history |

## Placement

Match the reference app's tooltip placement when implementing the corresponding controls and detail rows:

| UI | Default key |
| --- | --- |
| Limit price control and limit price details | `limitPriceTooltip` |
| Stop-loss trigger price control | `stopLossTooltip` |
| Take-profit trigger price control | `takeProfitTooltip` |
| Trigger price in preview and submit review | `triggerPriceTooltip` |
| Duration control | `maxDurationTooltip` |
| Number of trades control and total trades details | `totalTradesTooltip` |
| Trade interval control and details | `tradeIntervalTooltip` |
| Individual trade size details | `tradeSizeTooltip` |
| Minimum received details | `minDstAmountTooltip` |
| Expiration details | `expirationTooltip` |

`stopLossLimitPriceTooltip` and `stopLossDurationTooltip` are also available in the app's translation catalog for dedicated stop-loss explanations; the current shared controls use `limitPriceTooltip` and `maxDurationTooltip`.

For the order ID tooltip, use the full actual order ID as in `apps/web/components/spot/order-details.tsx`; do not replace dynamic content with generic text. If the ID is unavailable, omit its tooltip trigger until there is content.

These defaults belong to the host integration; they are not exports from `@orbs-network/spot-react`. Copy them into the host's translation resources rather than importing from `apps/web`. When updating this skill, keep the copy aligned with the reference app.
