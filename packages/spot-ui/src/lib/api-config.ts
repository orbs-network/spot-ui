const ORDER_API_URL = "https://order-sink.orbs.network";
const ORDER_API_V2_URL = "https://order-sink-v2.orbs.network";

export const getApiEndpoint = (): string =>
  ORDER_API_V2_URL;

export const getRePermitConfigEndpoint = (): string =>
  `${ORDER_API_V2_URL}/config`;

export const getOrderApiEndpoints = (): string[] =>
  [ORDER_API_V2_URL, ORDER_API_URL];
