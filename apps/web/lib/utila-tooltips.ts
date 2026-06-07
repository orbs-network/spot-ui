export const UTILA_ORDER_TOOLTIPS = {
  expiration:
    "This is the date and time marking the end of the period which you have selected for your order to be executed.",
  limitPrice:
    "Trades will only execute if the available market price is better than the limit price, potentially resulting in partial fills or orders remaining unfilled upon expiration.",
  minReceived:
    "This is the minimum number of tokens that may be received. NOTE: This minimum only refers to executed trades. Some trades may not be executed if the limit price is higher than the available market prices and your order may only be partially filled.",
  individualTradeSize:
    "The number of input tokens that will be removed from your balance and swapped for the output token in each individual trade.",
  numberOfTrades:
    "The total number of individual trades that will be scheduled as part of your order. Note that in limit orders, not all trades that are scheduled will be executed.",
  tradeInterval:
    "The estimated time that will elapse between each trade in your order. Note that as this time includes an allowance of two minutes for bidder auction and block settlement, which cannot be predicted exactly, actual time may vary.",
  triggerPrice:
    "The price at which the order will be executed. If the market price is higher than the trigger price, the order will be executed at the market price.",
} as const;
