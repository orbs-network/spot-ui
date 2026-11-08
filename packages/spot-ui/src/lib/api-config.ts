const ORDER_API_URL = "https://order-sink.orbs.network";
const ORDER_API_V2_URL = "https://order-sink-v2.orbs.network";
const ORDER_API_DEV_URL = "https://order-sink-dev.orbs.network";

export const getApiEndpoint = (): string =>
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("devurl") === "true"
    ? ORDER_API_DEV_URL
    : ORDER_API_V2_URL;

export const getRePermitConfigEndpoint = (): string =>
  `${getApiEndpoint()}/config`;

export const getOrderApiEndpoints = (getv1orders = true): string[] => {
  const endpoint = getApiEndpoint();
  return getv1orders && endpoint !== ORDER_API_DEV_URL
    ? [endpoint, ORDER_API_URL]
    : [endpoint];
};
