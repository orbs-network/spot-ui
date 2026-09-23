export const SPOT_CONFIG_URL =
  "https://raw.githubusercontent.com/orbs-network/spot/master/config.json";

const CACHE_TTL_MILLIS = 5 * 60_000;

type ConfigValues = Record<string, unknown>;
export type SpotConfigEntry = ConfigValues & {
  dex?: Record<string, ConfigValues>;
};
export type SpotConfig = Record<string, SpotConfigEntry>;

let cached: { value: SpotConfig; expiresAt: number } | undefined;
let pending: Promise<SpotConfig> | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseConfig = (value: unknown): SpotConfig => {
  if (!isRecord(value) || !isRecord(value["*"])) {
    throw new Error("Invalid Spot configuration: missing global defaults");
  }
  for (const entry of Object.values(value)) {
    if (!isRecord(entry) || (entry.dex !== undefined &&
      (!isRecord(entry.dex) || !Object.values(entry.dex).every(isRecord)))) {
      throw new Error("Invalid Spot configuration: malformed chain or partner");
    }
  }
  return value as SpotConfig;
};

/** Shares in-flight requests and caches successful responses for five minutes. */
export const fetchSpotConfig = (): Promise<SpotConfig> => {
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch(SPOT_CONFIG_URL, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Spot configuration: ${response.status}`);
    }
    const value = parseConfig(await response.json());
    cached = { value, expiresAt: Date.now() + CACHE_TTL_MILLIS };
    return value;
  })().finally(() => { pending = undefined; });
  return pending;
};

