import type { RePermitData } from "../src";
import type { OrderV2 } from "../src/lib/types";

export const ADDRESS_1 =
  "0x0000000000000000000000000000000000000001" as const;
export const ADDRESS_2 =
  "0x0000000000000000000000000000000000000002" as const;
export const ADDRESS_3 =
  "0x0000000000000000000000000000000000000003" as const;
export const ADDRESS_4 =
  "0x0000000000000000000000000000000000000004" as const;

export const createRePermitData = (chainId: number): RePermitData => ({
  domain: {
    name: "RePermit",
    version: "1",
    chainId,
    verifyingContract: ADDRESS_1,
  },
  primaryType: "RePermitWitnessTransferFrom",
  types: {},
  order: {
    permitted: { token: ADDRESS_2, amount: "0" },
    spender: ADDRESS_1,
    nonce: "0",
    deadline: "0",
    witness: {
      reactor: ADDRESS_2,
      executor: ADDRESS_3,
      exchange: {
        adapter: ADDRESS_4,
        ref: ADDRESS_1,
        share: 0,
        data: "0x",
      },
      swapper: ADDRESS_1,
      nonce: "0",
      deadline: "0",
      chainid: chainId,
      exclusivity: 0,
      epoch: 0,
      slippage: 0,
      freshness: 60,
      input: { token: ADDRESS_2, amount: "0", maxAmount: "0" },
      output: { token: ADDRESS_3, limit: "1", recipient: ADDRESS_1 },
    },
  },
});

export const createV2Order = (
  chainId: number,
  hash: string,
): OrderV2 => ({
  hash,
  metadata: {
    chunks: [],
    expectedChunks: 1,
    lastPriceCheck: "",
    nextEligibleTime: "",
    status: "pending",
    description: "",
    displayOnlyInputTokenPriceUSD: "1000000000000000000",
    repermitDigest: hash,
  },
  order: createRePermitData(chainId).order,
  signature: "0x",
  timestamp: "2026-01-01T00:00:00.000Z",
});
