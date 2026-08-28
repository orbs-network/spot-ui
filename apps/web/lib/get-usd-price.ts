import * as chains from "viem/chains";
import BN from "bignumber.js";
import { getAddress, isAddress, zeroAddress } from "viem";
import { USDPrices } from "./types";
import { getWrappedNativeCurrency, isNativeAddress } from "./utils";
import { megaethChain } from "./chains";

const chainIdToLlamaName: Record<number, string> = {
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
  [chains.optimism.id]: "optimism",
  [chains.mantle.id]: "mantle",
  [chains.hyperEvm.id]: "hyperevm",
  [chains.unichain.id]: "unichain",
  [chains.xLayer.id]: "xlayer",
  [megaethChain.id]: "megaeth",
};

const chainIdToDexScreenerName: Record<number, string> = {
  ...chainIdToLlamaName,
  [chains.mainnet.id]: "ethereum",
  [chains.avalanche.id]: "avalanche",
  [chains.hyperEvm.id]: "hyperevm",
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

interface LlamaHistoricalPrice {
  timestamp: number;
  price: number;
}

interface LlamaHistoricalPriceResponse {
  coins: Record<
    string,
    {
      prices?: LlamaHistoricalPrice[];
    }
  >;
}

export interface HistoricalPairPricePoint {
  /** Unix timestamp in seconds. */
  time: number;
  /** Destination-token units for one source token. */
  value: number;
}

export type CurrentPairPricePoint = HistoricalPairPricePoint;

type DexScreenerPair = {
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
};

const LLAMA_BATCH_SIZE = 20;
const DEX_BATCH_SIZE = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}

function normalizeToken(token: string, chainId: number): string | null {
  if (isNativeAddress(token)) {
    return getWrappedNativeCurrency(chainId)?.address?.toLowerCase() ?? null;
  }

  if (!isAddress(token)) return null;

  return getAddress(token).toLowerCase();
}

function roundPrice(price: number): number {
  return BN(price).decimalPlaces(6).toNumber();
}

function getHourlyPricesByTimestamp(prices?: LlamaHistoricalPrice[]) {
  const result = new Map<number, number>();

  for (const point of prices ?? []) {
    if (
      !Number.isFinite(point.timestamp) ||
      !Number.isFinite(point.price) ||
      point.price <= 0
    ) {
      continue;
    }

    const hour = Math.floor(point.timestamp / 3_600) * 3_600;
    result.set(hour, point.price);
  }

  return result;
}

/**
 * Returns hourly source/destination market prices for the previous seven days.
 * Native currencies are resolved through the same wrapped-token mapping used by
 * the current-price endpoint.
 */
export async function getHistoricalPairPrices(
  sourceToken: string,
  destinationToken: string,
  chainId: number,
  signal?: AbortSignal,
): Promise<HistoricalPairPricePoint[]> {
  const chainName = chainIdToLlamaName[chainId];
  const normalizedSource = normalizeToken(sourceToken, chainId);
  const normalizedDestination = normalizeToken(destinationToken, chainId);

  if (!chainName || !normalizedSource || !normalizedDestination) return [];

  const sourceId = `${chainName}:${normalizedSource}`;
  const destinationId = `${chainName}:${normalizedDestination}`;
  const coinIds = Array.from(new Set([sourceId, destinationId]));
  const start = Math.floor(Date.now() / 1_000) - 7 * 24 * 60 * 60;
  const url = new URL(
    `https://coins.llama.fi/chart/${coinIds.join(",")}`,
  );
  url.searchParams.set("start", start.toString());
  url.searchParams.set("span", "168");
  url.searchParams.set("period", "1h");

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Historical price request failed (${response.status})`);
  }

  const data: LlamaHistoricalPriceResponse = await response.json();
  const sourcePrices = getHourlyPricesByTimestamp(data.coins?.[sourceId]?.prices);

  if (sourceId === destinationId) {
    return [...sourcePrices.keys()]
      .sort((a, b) => a - b)
      .map((time) => ({ time, value: 1 }));
  }

  const destinationPrices = getHourlyPricesByTimestamp(
    data.coins?.[destinationId]?.prices,
  );

  return [...sourcePrices]
    .flatMap(([time, sourcePrice]) => {
      const destinationPrice = destinationPrices.get(time);
      if (!destinationPrice) return [];
      const pairPrice = sourcePrice / destinationPrice;
      if (!Number.isFinite(pairPrice) || pairPrice <= 0) return [];

      return [
        {
          time,
          value: BN(pairPrice).decimalPlaces(12).toNumber(),
        },
      ];
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * Returns the latest destination-token price for one source token. DefiLlama
 * is used first so the live tick and seven-day history share a price source;
 * the existing USD-price fallback covers tokens DefiLlama cannot price.
 */
export async function getCurrentPairPrice(
  sourceToken: string,
  destinationToken: string,
  chainId: number,
  signal?: AbortSignal,
): Promise<CurrentPairPricePoint | null> {
  const chainName = chainIdToLlamaName[chainId];
  const normalizedSource = normalizeToken(sourceToken, chainId);
  const normalizedDestination = normalizeToken(destinationToken, chainId);
  const time = Math.floor(Date.now() / 1_000);

  if (!normalizedSource || !normalizedDestination) return null;
  if (normalizedSource === normalizedDestination) return { time, value: 1 };

  if (chainName) {
    const sourceId = `${chainName}:${normalizedSource}`;
    const destinationId = `${chainName}:${normalizedDestination}`;
    const url = `https://coins.llama.fi/prices/current/${sourceId},${destinationId}`;

    try {
      const response = await fetch(url, { signal });
      if (response.ok) {
        const data: LlamaPriceResponse = await response.json();
        const sourcePrice = data.coins?.[sourceId]?.price;
        const destinationPrice = data.coins?.[destinationId]?.price;
        const value = Number(sourcePrice) / Number(destinationPrice);

        if (Number.isFinite(value) && value > 0) {
          return { time, value };
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  const prices = await getUSDPrice(
    [sourceToken, destinationToken],
    chainId,
  );
  const value =
    Number(prices[sourceToken]) / Number(prices[destinationToken]);

  return Number.isFinite(value) && value > 0 ? { time, value } : null;
}

function getDexScreenerTokenPrice(pair: DexScreenerPair, token: string) {
  const base = pair.baseToken?.address?.toLowerCase();
  const quote = pair.quoteToken?.address?.toLowerCase();
  const basePriceUsd = Number(pair.priceUsd);

  if (base === token) return basePriceUsd;

  if (quote === token) {
    const basePriceInQuote = Number(pair.priceNative);
    if (basePriceUsd > 0 && basePriceInQuote > 0) {
      return basePriceUsd / basePriceInQuote;
    }
  }

  return 0;
}

async function fetchLlamaPrices(
  tokenAddresses: string[],
  chainName: string,
): Promise<USDPrices> {
  const prices: USDPrices = {};

  await Promise.all(
    chunk(tokenAddresses, LLAMA_BATCH_SIZE).map(async (batch) => {
      const coinIds = batch.map((address) => `${chainName}:${address}`);
      const url = `https://coins.llama.fi/prices/current/${coinIds.join(",")}`;

      try {
        const response = await fetch(url);
        if (!response.ok) return;

        const data: LlamaPriceResponse = await response.json();

        for (const address of batch) {
          const coinId = `${chainName}:${address}`;
          const price = data.coins?.[coinId]?.price;

          if (typeof price === "number" && price > 0) {
            prices[address] = roundPrice(price);
          }
        }
      } catch (e) {
        console.error("Llama price batch failed:", e);
      }
    }),
  );

  return prices;
}

async function fetchDexScreenerFallbackPrices(
  tokenAddresses: string[],
  chainName: string,
): Promise<USDPrices> {
  const prices: USDPrices = {};

  await Promise.all(
    chunk(tokenAddresses, DEX_BATCH_SIZE).map(async (batch) => {
      const url = `https://api.dexscreener.com/tokens/v1/${chainName}/${batch.join(",")}`;

      try {
        const response = await fetch(url);
        if (!response.ok) return;

        const pairs: DexScreenerPair[] = await response.json();

        for (const token of batch) {
          const tokenPairs = pairs.filter((pair) => {
            const base = pair.baseToken?.address?.toLowerCase();
            const quote = pair.quoteToken?.address?.toLowerCase();
            return base === token || quote === token;
          });

          // Pick the most reliable-looking pair.
          const bestPair = tokenPairs
            .filter((p) => getDexScreenerTokenPrice(p, token) > 0)
            .sort((a, b) => {
              const liquidityDiff =
                (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);

              if (liquidityDiff !== 0) return liquidityDiff;

              return (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0);
            })[0];

          const price = bestPair
            ? getDexScreenerTokenPrice(bestPair, token)
            : 0;

          if (price > 0) {
            prices[token] = roundPrice(price);
          }
        }
      } catch (e) {
        console.error("DexScreener fallback batch failed:", e);
      }
    }),
  );

  return prices;
}

export async function getUSDPrice(
  tokens: string[],
  chainId: number,
): Promise<USDPrices> {
  try {
    const llamaChainName = chainIdToLlamaName[chainId];
    const dexChainName = chainIdToDexScreenerName[chainId];

    if (!llamaChainName) {
      throw new Error(`Llama chain name not found for chainId: ${chainId}`);
    }

    const includesNative = tokens.some(isNativeAddress);
    const wrappedNativeAddress =
      getWrappedNativeCurrency(chainId)?.address?.toLowerCase();

    const tokenEntries = tokens
      .map((token) => ({
        original: token,
        normalized: normalizeToken(token, chainId),
      }))
      .filter(
        (entry): entry is { original: string; normalized: string } =>
          Boolean(entry.original && entry.normalized),
      );

    const normalizedTokens = Array.from(
      new Set(tokenEntries.map((entry) => entry.normalized)),
    );

    if (!normalizedTokens.length) return {};

    const llamaPrices = await fetchLlamaPrices(normalizedTokens, llamaChainName);

    const missingTokens = normalizedTokens.filter(
      (token) => llamaPrices[token] == null,
    );

    let fallbackPrices: USDPrices = {};

    if (missingTokens.length && dexChainName) {
      fallbackPrices = await fetchDexScreenerFallbackPrices(
        missingTokens,
        dexChainName,
      );
    }

    const prices: USDPrices = {
      ...llamaPrices,
      ...fallbackPrices,
    };

    if (includesNative && wrappedNativeAddress && prices[wrappedNativeAddress]) {
      prices[zeroAddress] = prices[wrappedNativeAddress];
    }

    for (const { original, normalized } of tokenEntries) {
      if (prices[normalized] != null) {
        prices[original] = prices[normalized];
      }
    }

    return prices;
  } catch (error) {
    console.error("Error fetching USD prices:", error);
    return {};
  }
}
