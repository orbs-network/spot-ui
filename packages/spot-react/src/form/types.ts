import type { TimeDuration } from "@orbs-network/spot-ui";

export type FormDefaults = {
  isMarketOrder?: boolean;
  tradeCount?: number;
  triggerPricePercent?: string | null;
  limitPricePercent?: string | null;
  tradeInterval?: TimeDuration;
  orderDuration?: TimeDuration;
  limitPriceUi?: string;
  triggerPriceUi?: string;
};

export enum Disclaimer {
  TRIGGER_MARKET_PRICE = "triggerMarketPriceDisclaimer",
  MARKET_PRICE = "marketOrderDisclaimer",
  LIMIT_PRICE = "limitOrderDisclaimer",
}

export type Overrides = {
  state?: Partial<InitialState>;
};

export type MarketQuote = {
  quotedOutputAmountRaw?: string;
  isLoading?: boolean;
  noLiquidity?: boolean;
};

export type InitialState = FormDefaults;
export type FormState = FormDefaults & { isPriceInverted?: boolean };
