import { getLegacyExchanges } from "./deployments";
import { Config } from "./types";
export const getExchanges = (config?: Config[]) => {
  if (!config) return undefined;
  const legacyAddresses = config.flatMap(getLegacyExchanges);
  const exchangeAddresses = config.map((c) => c.exchangeAddress);

  const allAddresses = new Set(
    [...exchangeAddresses, ...legacyAddresses].map((a) => a.toLowerCase()),
  );

  return Array.from(allAddresses);
};
