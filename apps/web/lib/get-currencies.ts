/* eslint-disable @typescript-eslint/no-explicit-any */
import * as chains from "viem/chains";
import type { Currency } from "./types";
import { zeroAddress } from "viem";
import axios from "axios";
import {
  eqCompare,
  getNativeTokenLogoUrl,
  sortByBaseAssets,
} from "./utils";
import { getChain, megaethChain, robinhoodChain } from "./chains";

const flareTokens: Currency[] = [
  {
    address: "0x1502FA4be69d526124D453619276FacCab275d3D",
    symbol: "WETH",
    decimals: 18,
    logoUrl: "https://tokens-data.1inch.io/images/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png",
    name: "Wrapped Ether",
  },
  {
    address: "0x657097cC15fdEc9e383dB8628B57eA4a763F2ba0",
    symbol: "SPRK",
    decimals: 18,
    logoUrl: "https://res.cloudinary.com/sparkdex/image/upload/q_100/v1/website-assets/coins/sprk",
    name: "SparkDEX",
  },
];

const coingekoChainToName = {
  [chains.flare.id]: "flare-network",
  [chains.fantom.id]: "fantom",
  [chains.arbitrum.id]: "arbitrum-one",
  [chains.polygon.id]: "polygon-pos",
  [chains.base.id]: "base",
  [chains.mainnet.id]: "ethereum",
  [chains.bsc.id]: "binance-smart-chain",
  [chains.linea.id]: "linea",
  [chains.sonic.id]: "sonic",
  [chains.cronoszkEVM.id]: "cronos-zkevm",
  [chains.katana.id]: "katana",
  [chains.sei.id]: "sei-v2",
  [chains.berachain.id]: "berachain",
  [chains.monad.id]: "monad",
  [chains.avalanche.id]: "avalanche",
  [chains.optimism.id]: "optimistic-ethereum",
  [chains.mantle.id]: "mantle",
  [chains.hyperEvm.id]: "hyperevm",
  [chains.unichain.id]: "unichain",
  [chains.xLayer.id]: "x-layer",
  [megaethChain.id]: "megaeth",
  [robinhoodChain.id]: "robinhood",
};

export const getCurrencies = async (
  chainId: number,
  signal?: AbortSignal
): Promise<Currency[]> => {
  try {
    const name =
      coingekoChainToName[chainId as keyof typeof coingekoChainToName];

    if (!name) {
      return [];
    }

    const response = await axios.get(
      `https://tokens.coingecko.com/${name}/all.json`,
      { signal }
    );
    
    const safeResponse = response.data.tokens.filter((token: { address: string }) => token.address.startsWith("0x"));

    let tokens: Currency[] = safeResponse.map(
      (token: {
        address: string;
        symbol: string;
        decimals: number;
        logoURI: string;
        name: string;
      }) => {
        return {
          address: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
          logoUrl: token.logoURI,
          name: token.name,
        };
      }
    );

    if (chainId === chains.flare.id) {
      tokens = [
        ...tokens,
        ...flareTokens.filter(
          (extra) => !tokens.some((token) => eqCompare(token.address, extra.address))
        ),
      ];
    }

    const _native = getChain(chainId)?.nativeCurrency;

    tokens = tokens.filter(
      (token: Currency) => !eqCompare(token.symbol, _native?.symbol ?? "")
    );

    let res = sortByBaseAssets(tokens, chainId);
    if (_native) {
      res = [
        {
          address: zeroAddress,
          symbol: _native.symbol,
          decimals: _native.decimals,
          logoUrl: getNativeTokenLogoUrl(chainId),
          name: _native.name,
        },
        ...res,
      ];
    }
    const CURRENCY_LIST_LIMIT = 2000;
    return res.slice(0, CURRENCY_LIST_LIMIT);
  } catch (error) {
    console.error("Error fetching tokens:", error);
    throw error;
  }
};
