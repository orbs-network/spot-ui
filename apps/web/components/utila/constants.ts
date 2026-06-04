import { DEFAULT_CHAIN_ID, DEFAULT_PARTNER } from "@/lib/consts";
import { SWAP_SUPPORTED_CHAIN_IDS } from "@/lib/wagmi-config";
import { getPartners } from "@orbs-network/spot-ui";

const SPOT_PARTNERS = getPartners();
const SWAP_SUPPORTED_CHAIN_ID_SET = new Set<number>(SWAP_SUPPORTED_CHAIN_IDS);
const SPOT_SUPPORTED_CHAIN_ID_SET = new Set(
  SPOT_PARTNERS.map((partner) => partner.chainId),
);

export const isUtilaSupportedChain = (chainId?: number) =>
  Boolean(
    chainId &&
      SWAP_SUPPORTED_CHAIN_ID_SET.has(chainId) &&
      SPOT_SUPPORTED_CHAIN_ID_SET.has(chainId),
  );

const getPartnerValue = (partner: (typeof SPOT_PARTNERS)[number]) =>
  `${partner.name}_${partner.chainId}`;

export const getUtilaPartnerForChain = (
  chainId?: number,
  currentPartner?: string,
) => {
  if (!isUtilaSupportedChain(chainId)) return undefined;

  const current = SPOT_PARTNERS.find(
    (partner) =>
      partner.chainId === chainId && getPartnerValue(partner) === currentPartner,
  );

  if (current) {
    return getPartnerValue(current);
  }

  const defaultPartner = SPOT_PARTNERS.find(
    (partner) => partner.chainId === chainId && partner.name === DEFAULT_PARTNER,
  );
  const nextPartner =
    defaultPartner ?? SPOT_PARTNERS.find((partner) => partner.chainId === chainId);

  return nextPartner ? getPartnerValue(nextPartner) : undefined;
};

export const UTILA_PARTNER =
  getUtilaPartnerForChain(DEFAULT_CHAIN_ID) ??
  `${DEFAULT_PARTNER}_${DEFAULT_CHAIN_ID}`;
