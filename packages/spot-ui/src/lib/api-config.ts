import spotPkg from "@orbs-network/spot/package.json";
import { Partners } from "./types";

const ORDER_API_URL = "https://order-sink.orbs.network";
const ORDER_API_V2_URL = "https://order-sink-v2.orbs.network";

export const SPOT_VERSION = spotPkg.version.split(".")[0];

export const getApiEndpoint = (): string =>
  Number(SPOT_VERSION) >= 2 ? ORDER_API_V2_URL : ORDER_API_URL;

export const getRePermitConfigEndpoint = (): string =>
  `${ORDER_API_V2_URL}/config`;

export const getOrderApiEndpoints = (): string[] =>
  Number(SPOT_VERSION) >= 2
    ? [ORDER_API_V2_URL, ORDER_API_URL]
    : [ORDER_API_URL];

const LEGACY_ORDER_SINK_EXCHANGES_BY_PARTNER: Partial<
  Record<Partners, string[]>
> = {
  [Partners.Thena]: ["0xB75218ba5A99bF57Fd02556B70F05A4A0f1Dbe67"],
  [Partners.Katana]: ["0x2e43A28FAf083717CcD9B246d97C61E1Bc9914Df"],
};

export const getOrderSinkExchanges = ({
  endpoint,
  exchange,
  partner,
}: {
  endpoint: string;
  exchange?: string;
  partner?: Partners;
}): string[] => {
  const isProductionEndpoint = [ORDER_API_URL, ORDER_API_V2_URL].includes(
    endpoint,
  );
  const legacyExchanges =
    isProductionEndpoint && partner
      ? LEGACY_ORDER_SINK_EXCHANGES_BY_PARTNER[partner] || []
      : [];
  const exchanges = exchange ? [exchange, ...legacyExchanges] : legacyExchanges;

  return exchanges.filter(
    (address, index) =>
      exchanges.findIndex(
        (candidate) => candidate.toLowerCase() === address.toLowerCase(),
      ) === index,
  );
};
