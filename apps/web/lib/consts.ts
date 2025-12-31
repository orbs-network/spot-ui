import { arbitrum, avalanche, base, bsc, linea, mainnet, monad, polygon, sei, sonic } from "viem/chains";
import { TABS } from "./types";
import { Partners } from "@orbs-network/spot-ui";

export const DEFAULT_TOKENS = {
  [bsc.id]: {
    input: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    output: "0x55d398326f99059ff775485246999027b3197955",
  },
  [polygon.id]: {
    input: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    output: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  [base.id]: {
    input: "0x4200000000000000000000000000000000000006",
    output: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  [mainnet.id]: {
    input: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    output: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  [arbitrum.id]: {
    input: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    output: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
  },
  [linea.id]: {
    input: "0x176211869ca2b568f2a7d4ee941e073a821ee1ff",
    output: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f",
  },
  [sei.id]: {
    input: "0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7",
    output: "0x5cf6826140c1c56ff49c808a1a75407cd1df9423",
  },
  [sonic.id]: {
    input: "0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38",
    output: "0x29219dd400f2bf60e5a23d13be72b486d4038894",
  },
  [monad.id]: {
    input: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a",
    output: "0x754704bc059f8c67012fed69bc8a327a5aafb603",
  },
  [avalanche.id]: { 
    input: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
    output: "0xc7198437980c041c805a1edcba50c1ce5db95118",
  },
};



export const POPULAR_TOKENS = {
  [bsc.id]: ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',"0x55d398326f99059fF775485246999027B3197955", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c"],
  [polygon.id]: ['0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"],
  [base.id]:["0x4200000000000000000000000000000000000006", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22"],
  [mainnet.id]:["0x6B175474E89094C44Da98b954EedeAC495271d0F", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "0xdAC17F958D2ee523a2206206994597C13D831ec7", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
  [arbitrum.id]:["0x82af49447d8a07e3bd95bd0d56f35241523fbab1", "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", "0xaf88d065e77c8cc2239327c5edb3a432268e5831", "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f"],
  [linea.id]:["0x176211869ca2b568f2a7d4ee941e073a821ee1ff","0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f", "0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4"],
  [sonic.id]: ['0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38','0x29219dd400f2bf60e5a23d13be72b486d4038894', "0x0555e30da8f98308edb960aa94c0db47230d2b9c", "0x6047828dc181963ba44974801ff68e538da5eaf9"],
  [sei.id]: ["0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7","0x5cf6826140c1c56ff49c808a1a75407cd1df9423", "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392", "0x160345fc359604fc6e70e3c5facbde5f7a9342d8", "0xc68351b9b3638a6f4a3ae100bd251e227bbd7479"]
};

export const NATIVE_TOKENS_LOGO_URLS = {
  [bsc.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/1839.png",
  [polygon.id]:
    "https://s2.coinmarketcap.com/static/img/coins/128x128/3890.png",
  [base.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/1027.png",
  [mainnet.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/1027.png",
  [arbitrum.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/1027.png",
  [linea.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/1027.png",
  [sonic.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/32684.png",
  [sei.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/23149.png",
  [monad.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/30495.png",
  [avalanche.id]: "https://s2.coinmarketcap.com/static/img/coins/128x128/5805.png",
};

export const DEFAULT_PRICE_PROTECTION = 5;
export const DEFAULT_SLIPPAGE = 0.5;

export const FORM_TABS = [
  {
    label: "Swap",
    value: TABS.SWAP,
    path: "/",
    fullLabel: "Swap",
  },
  {
    label: "Twap",
    value: TABS.TWAP,
    path: "/twap",
    fullLabel: "Twap",
  },
  {
    label: "Limit",
    value: TABS.LIMIT,
    path: "/limit",
    fullLabel: "Limit",
  },
  {
    label: "SL",
    value: TABS.STOP_LOSS,
    path: "/stop-loss",
    fullLabel: "Stop Loss",
  },
  {
    label: "TP",
    value: TABS.TAKE_PROFIT,
    path: "/take-profit",
    fullLabel: "Take Profit",
  },
];

export const SPOT_TABS = [
  TABS.LIMIT,
  TABS.STOP_LOSS,
  TABS.TAKE_PROFIT,
  TABS.TWAP,
];


export const BUNGEE_NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

export const DEFAULT_CHAIN_ID = 56;
export const DEFAULT_PARTNER = Partners.Thena
