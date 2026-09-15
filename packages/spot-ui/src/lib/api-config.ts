import spotPkg from "@orbs-network/spot/package.json";

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
