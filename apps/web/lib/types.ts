/* eslint-disable @typescript-eslint/no-explicit-any */
export type Currency = {
    address: string;
    symbol: string;
    decimals: number;
    logoUrl: string;
    balance?: string;
    name: string
    imported?: boolean;
}

export type USDPrices = {
    [key: string]: number;
}

export type Balances = {
    [key: string]: string;
}


export enum SwapType {
    SWAP = 'SWAP',
    TWAP = 'TWAP',
    LIMIT = 'LIMIT',
    STOP_LOSS = 'STOP_LOSS',
    TAKE_PROFIT = 'TAKE_PROFIT',
}

export enum SwapStep {
    WRAP = 'WRAP',
    APPROVE = 'APPROVE',
    SWAP = 'SWAP',
}

export enum Field {
    INPUT = 'INPUT',
    OUTPUT = 'OUTPUT',
}
export enum TABS {
    SWAP = "SWAP",
    TWAP = "TWAP",
    LIMIT = "LIMIT",
    STOP_LOSS = "STOP_LOSS",
    TAKE_PROFIT = "TAKE_PROFIT",
  }



  

  export type BestTradeQuote = {
    outAmount: string;
    minAmountOut: string;
    inToken: string;
    outToken: string;
    inAmount: string;
    gas: string;
    originalQuote: any;
  }
  