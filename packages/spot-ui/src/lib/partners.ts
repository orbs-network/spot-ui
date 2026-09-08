// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore The Spot package does not currently publish a type for `raw`.
import * as Spot from "@orbs-network/spot";
import { Partners, type PartnerPayloadItem } from "./types";

const PARTNER_NAMES: ReadonlySet<string> = new Set(Object.values(Partners));

const isPartner = (name: string): name is Partners =>
  PARTNER_NAMES.has(name);

export const getPartners = (): PartnerPayloadItem[] => {
  const raw = Spot.raw as Record<
    string,
    { dex?: Record<string, unknown> } | undefined
  >;
  const globalDex = raw["*"]?.dex ?? {};

  return Object.entries(raw)
    .flatMap(([chainId, chainConfig]) => {
      if (chainId === "*") return [];

      const numericChainId = Number(chainId);
      if (!Number.isSafeInteger(numericChainId)) return [];

      const dex = { ...globalDex, ...(chainConfig?.dex ?? {}) };

      return Object.keys(dex)
        .filter(isPartner)
        .filter((name) => Boolean(Spot.config(numericChainId, name)))
        .map((name) => ({ chainId: numericChainId, name }));
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.chainId - b.chainId,
    );
};
