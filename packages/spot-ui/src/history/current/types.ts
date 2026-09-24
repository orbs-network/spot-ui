import { type RePermitOrder } from "../../contracts/types";
import { type Signature } from "../../shared/types";

type OrderV2Chunk = {
  blockId: number;
  description: string;
  epoch: string;
  exchange: string;
  executor: string;
  inAmount: string;
  inToken: string;
  index: number;
  minOut: string;
  oraclePricingData: {
    message: {
      chainid: number;
      cosigner: string;
      input: {
        decimals: string;
        token: string;
        value: "1000000000000000000";
      };
      output: {
        decimals: string;
        token: string;
        value: string;
      };
      reactor: string;
      timestamp: number;
    };
    oracle: string;
    signature: Signature;
    timestamp: string;
  };
  outAmount: string;
  outToken: string;
  settled: boolean;
  status: string;
  swapper: string;
  timestamp: string;
  txHash: string;
};

export type OrderV2 = {
  hash: string;
  metadata: {
    chunks?: OrderV2Chunk[];
    expectedChunks: number;
    lastPriceCheck: string;
    nextEligibleTime: string;
    status: string;
    description: string;
    displayOnlyInputTokenPriceUSD: string;
    repermitDigest: string;
  };
  order: RePermitOrder;
  signature: string;
  timestamp: string;
};
