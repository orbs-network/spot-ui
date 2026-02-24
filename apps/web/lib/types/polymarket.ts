/** Polymarket Gamma API types */

export interface PolymarketTag {
  id?: string;
  slug?: string;
  label?: string;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  image?: string;
  icon?: string;
  outcomes?: string;
  outcomePrices?: string;
  volume?: number | string;
  volume24hr?: number;
  volume24hrClob?: number;
  volumeNum?: number;
  active?: boolean;
  closed?: boolean;
  events?: PolymarketEvent[];
}

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  image?: string;
  icon?: string;
  volume?: number | string;
  volume24hr?: number;
  active?: boolean;
  closed?: boolean;
  markets?: PolymarketMarket[];
  tags?: PolymarketTag[];
}

/** Normalized card data for display */
export interface PredictionMarket {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  chancePercent: number;
  volume: number;
  volume24hr?: number;
  polymarketUrl: string;
}
