import { getRePermitConfigEndpoint } from "./api-config";
import { SpotError } from "./errors";
import { assertRePermitConfiguration } from "./repermit-configuration";
import type { Partners, RePermitData } from "./types";

const CONFIG_CACHE_TTL_MILLIS = 60_000;
const MAX_CACHED_CONFIGS = 32;
interface ConfigCacheEntry {
  promise: Promise<RePermitData>;
  expiresAt: number;
}
const configurationCache = new Map<string, ConfigCacheEntry>();

const loadRePermitData = async (
  partner: Partners,
  chainId: number,
): Promise<RePermitData> => {
  const query = new URLSearchParams({
    partner,
    chain: chainId.toString(),
  });
  let response: Response;
  try {
    response = await fetch(`${getRePermitConfigEndpoint()}?${query}`);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new SpotError("CONFIGURATION_FAILED", cause instanceof Error ? cause.message : "Failed to fetch RePermit data", { cause });
  }

  if (!response.ok) {
    let message = "";
    try {
      message = await response.text();
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new SpotError("CONFIGURATION_FAILED", cause instanceof Error ? cause.message : "Failed to read RePermit data", { cause, status: response.status });
    }
    let serviceCode: string | number | undefined;
    try {
      const data = JSON.parse(message) as { code?: unknown } | null;
      if (typeof data?.code === "string" || typeof data?.code === "number") serviceCode = data.code;
    } catch { /* Plain-text configuration errors have no service code. */ }
    throw new SpotError("CONFIGURATION_FAILED",
      `Failed to fetch RePermit data for partner "${partner}" on chain ${chainId}: ${response.status}${message ? ` ${message}` : ""}`,
      { status: response.status, serviceCode },
    );
  }

  let data: RePermitData;
  try {
    data = await response.json() as RePermitData;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new SpotError("CONFIGURATION_FAILED", cause instanceof Error ? cause.message : "Failed to read RePermit data", { cause, status: response.status });
  }
  assertRePermitConfiguration(data, chainId);
  return data;
};

/** Share requests and validated templates for one minute; each caller owns its deep copy. */
export const fetchRePermitData = async (partner: Partners, chainId: number): Promise<RePermitData> => {
  const key = JSON.stringify([partner, chainId]);
  const now = Date.now();
  for (const [cachedKey, entry] of configurationCache) {
    if (entry.expiresAt <= now) configurationCache.delete(cachedKey);
  }
  let entry = configurationCache.get(key);
  if (entry) {
    configurationCache.delete(key);
    configurationCache.set(key, entry);
  } else {
    const pending: ConfigCacheEntry = {
      promise: loadRePermitData(partner, chainId),
      // A hung request also expires, so later client attempts can recover.
      expiresAt: now + CONFIG_CACHE_TTL_MILLIS,
    };
    pending.promise = pending.promise.then(data => {
      pending.expiresAt = Date.now() + CONFIG_CACHE_TTL_MILLIS;
      return data;
    }, error => {
      if (configurationCache.get(key) === pending) configurationCache.delete(key);
      throw error;
    });
    configurationCache.set(key, pending);
    while (configurationCache.size > MAX_CACHED_CONFIGS) {
      const oldestKey = configurationCache.keys().next().value;
      if (oldestKey !== undefined) configurationCache.delete(oldestKey);
    }
    entry = pending;
  }
  // The API returns JSON; copying it prevents a client's exposed config from
  // changing either the cached template or a different client's signing domain.
  return JSON.parse(JSON.stringify(await entry.promise)) as RePermitData;
};
