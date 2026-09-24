export type Token = {
  address: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
};

export enum Module {
  TWAP = "TWAP",
  LIMIT = "LIMIT",
  STOP_LOSS = "STOP_LOSS",
  TAKE_PROFIT = "TAKE_PROFIT",
}

export type Address = `0x${string}`;

export type Hex = `0x${string}`;

export type Signature = {
  v: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
};
