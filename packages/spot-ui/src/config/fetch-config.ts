import { getRePermitConfigEndpoint } from "../shared/endpoints";
import { parseRePermitConfiguration } from "./parse-config";
import type { Partners } from "./partners";
import type { RePermitData } from "./types";

export const fetchRePermitData = async (
  partner: Partners,
  chainId: number,
): Promise<RePermitData> => {
  const query = new URLSearchParams({
    partner,
    chain: chainId.toString(),
  });
  const response = await fetch(`${getRePermitConfigEndpoint()}?${query}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to fetch RePermit data for partner "${partner}" on chain ${chainId}: ${response.status}${message ? ` ${message}` : ""}`,
    );
  }

  return parseRePermitConfiguration(await response.json(), chainId);
};
