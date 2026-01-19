import * as chains from "viem/chains";
import BN from "bignumber.js";
import { zeroAddress } from "viem";
import { USDPrices } from "./types";
import { getWrappedNativeCurrency, isNativeAddress } from "./utils";

const chainIdToName: { [key: number]: string } = {
  [chains.bsc.id]: "bsc",
  [chains.polygon.id]: "polygon",
  [chains.base.id]: "base",
  [chains.fantom.id]: "fantom",
  [chains.mainnet.id]: "ethereum",
  [chains.blast.id]: "blast",
  [chains.linea.id]: "linea",
  [chains.arbitrum.id]: "arbitrum",
  [chains.sei.id]: "sei",
  [chains.zircuit.id]: "zircuit",
  [chains.flare.id]: "flare",
  [chains.sonic.id]: "sonic",
  [chains.cronoszkEVM.id]: "cronos-zkevm",
  [chains.katana.id]: "katana",
  [chains.monad.id]: "monad",
  [chains.avalanche.id]: "avax",
  [chains.berachain.id]: "berachain",
};

export interface LlamaPriceResult {
  price: number;
  symbol: string;
  timestamp: number;
  confidence: number;
}

export interface LlamaPriceResponse {
  coins: Record<string, LlamaPriceResult>;
}

export async function getUSDPrice(
  tokens: string[],
  chainId: number,
): Promise<USDPrices> {
  try {
    const chainName = chainIdToName[chainId];
    if (!chainName) {
      throw new Error(`Chain name not found for chainId: ${chainId}`);
    }

    // Normalize to llama format: "chain:address"

    const includesNative = tokens.some((t) => isNativeAddress(t));
    const wCurrencyAddress = getWrappedNativeCurrency(chainId)?.address ?? "";
    const tokensWithChainId = tokens.map((t) => {
      let tokenAddress = t;
      if (isNativeAddress(t)) {
        tokenAddress = wCurrencyAddress;
      }
      return `${chainName}:${tokenAddress}`;
    });

    // ---- batching (20 tokens per request) ----
    const BATCH_SIZE = 20;
    const batches = [];

    for (let i = 0; i < tokensWithChainId.length; i += BATCH_SIZE) {
      batches.push(tokensWithChainId.slice(i, i + BATCH_SIZE));
    }

    // Final merged result
    const result: LlamaPriceResponse = { coins: {} };

    for (const batch of batches) {
      const url = `https://coins.llama.fi/prices/current/${batch.join(",")}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error("Failed Llama batch:", batch);
        continue; // skip failing batches, but don't stop execution
      }

      const data: LlamaPriceResponse = await response.json();

      Object.assign(result.coins, data.coins);
    }

    const prices = Object.entries(result.coins).reduce(
      (acc, [symbol, result]) => {
        acc[symbol.split(":")[1]] = BN(result.price)
          .decimalPlaces(6)
          .toNumber();
        return acc;
      },
      {} as USDPrices,
    );
    if (includesNative) {
      prices[zeroAddress] = prices[wCurrencyAddress];
    }
    return prices;
  } catch (error) {
    console.error("Error fetching Llama price:", error);
    return {};
  }
}
