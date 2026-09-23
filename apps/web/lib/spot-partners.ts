import { Partners } from "@orbs-network/spot-react";
import { fetchSpotConfig } from "./spot-config";

type PartnerPayloadItem = {
  chainId: number;
  name: Partners;
};

const PARTNER_NAMES: ReadonlySet<string> = new Set(Object.values(Partners));

const isPartner = (name: string): name is Partners =>
  PARTNER_NAMES.has(name);

export const getPartners = async (): Promise<PartnerPayloadItem[]> => {
  const raw = await fetchSpotConfig();
  const globalDex = raw["*"]?.dex ?? {};

  return Object.entries(raw)
    .flatMap(([chainId, chainConfig]) => {
      if (chainId === "*") return [];

      const numericChainId = Number(chainId);
      if (!Number.isSafeInteger(numericChainId) || numericChainId <= 0) return [];

      const dex = { ...globalDex, ...(chainConfig?.dex ?? {}) };

      return Object.keys(dex)
        .filter(isPartner)
        .map((name) => ({ chainId: numericChainId, name }));
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.chainId - b.chainId,
    );
};
