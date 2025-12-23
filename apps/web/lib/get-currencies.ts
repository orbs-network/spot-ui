/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";
import * as chains from "viem/chains";
import { Currency } from "./types";
import { zeroAddress } from "viem";
import axios from "axios";
import {
  eqCompare,
  getNativeTokenLogoUrl,
  sortByBaseAssets,
} from "./utils";

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

    let tokens = safeResponse.map(
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

    const _native = Object.values(chains).find(
      (chain) => chain.id === chainId
    )?.nativeCurrency;

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
    return res.slice(0, 100);
  } catch (error) {
    console.error("Error fetching tokens:", error);
    throw error;
  }
};
