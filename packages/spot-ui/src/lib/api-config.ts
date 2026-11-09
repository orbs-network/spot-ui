import { SpotError } from "./errors";

const ORDER_API_URL = "https://order-sink.orbs.network";
const ORDER_API_V2_URL = "https://order-sink-v2.orbs.network";

/** Page URL parameters must never choose the order service or signing configuration. */
export const getApiEndpoint = (apiUrl = ORDER_API_V2_URL): string => {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch (cause) {
    throw new SpotError("INVALID_ARGUMENT", "apiUrl must be an absolute HTTP(S) URL", { cause });
  }

  const isHttp = url.protocol === "https:" || url.protocol === "http:";
  if (!isHttp || url.username || url.password || /[?#]/.test(url.href)) {
    throw new SpotError("INVALID_ARGUMENT", "apiUrl must be an HTTP(S) base URL without credentials, query, or fragment");
  }
  return url.href.replace(/\/+$/, "");
};

export const getRePermitConfigEndpoint = (apiUrl?: string): string =>
  `${getApiEndpoint(apiUrl)}/config`;

export const getOrderApiEndpoints = (getv1orders = true, apiUrl?: string): string[] => {
  const endpoint = getApiEndpoint(apiUrl);
  return getv1orders && endpoint === ORDER_API_V2_URL
    ? [endpoint, ORDER_API_URL]
    : [endpoint];
};
